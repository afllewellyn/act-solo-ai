/**
 * ElevenLabs Conversational AI Engine
 * Phase 2: Real implementation using ElevenLabs Agents API
 * Phase 3.5: Structured telemetry for production monitoring
 */

import { ConversationEngine, ConversationStatus, ConversationEvent, ConversationControlCommand } from './types';
import { ConversationEngineConfig, ScriptContext } from './domain';
import { supabase } from '@/integrations/supabase/client';
import { ConversationAudioPlayer } from './AudioPlayer';
import { createSpeechOnsetDetector } from './speechOnset';
import { logConversationEngine, type ConversationEngineLogContext } from '@/lib/logger';

export class ElevenAgentsEngine implements ConversationEngine {
  private ws: WebSocket | null = null;
  private status: ConversationStatus = 'idle';
  private eventListeners: Array<(event: ConversationEvent) => void> = [];
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private config: ConversationEngineConfig;
  
  // Connection state
  private isInitialized: boolean = false;
  private intentionalStop: boolean = false;
  
  // Reconnection state
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private readonly baseReconnectDelay: number = 1000; // 1 second
  private readonly maxReconnectDelay: number = 30000; // 30 seconds
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  
  // Response buffering state
  private currentResponseText: string = '';
  private isResponseActive: boolean = false;
  private isAudioActive: boolean = false;
  // Server finished streaming audio; playback may still be draining
  private audioStreamEnded: boolean = false;
  // Dropping the rest of ONE reply the app rejected (early answer mid split actor speech).
  // Lifted by: a new reply after the rejected one ended, actor speech, a cue, or a quiet gap.
  private discardingAudio: boolean = false;
  private discardStartedAt = 0;
  private rejectedReplyEnded = false;
  private discardQuietTimer: ReturnType<typeof setTimeout> | null = null;
  static readonly DISCARD_QUIET_MS = 1500;
  private detectSpeechOnset = createSpeechOnsetDetector();
  // Safety net: if the server never sends audio_end, finish the turn after a quiet gap
  private audioEndWatchdog: ReturnType<typeof setTimeout> | null = null;
  static readonly AUDIO_QUIET_MS = 600;
  
  // Audio playback
  private audioPlayer: ConversationAudioPlayer;
  
  // Telemetry state
  private connectionStartTime: number = 0;
  private statusChangeTime: number = 0;
  private audioChunksReceived: number = 0;
  private lastError: Error | null = null;

  constructor(config: ConversationEngineConfig) {
    this.config = config;
    this.audioPlayer = new ConversationAudioPlayer();
    if (config.playbackSpeed !== undefined) this.audioPlayer.setPlaybackSpeed(config.playbackSpeed);
    // "Audio ended" means the line was actually heard, not just fully streamed
    this.audioPlayer.onDrained = () => this.finishAudioIfDrained();
    logConversationEngine('engine_created', {
      engine: 'eleven_agents',
      component: 'ElevenAgentsEngine',
    });
  }

  // Public getters for telemetry state (used by hook)
  getLastError(): Error | null {
    return this.lastError;
  }

  getReconnectCount(): number {
    return this.reconnectAttempts;
  }

  async start(): Promise<void> {
    // Unlock playback while still inside the Start click, before any network wait
    void this.audioPlayer.unlock().then((ok) =>
      logConversationEngine(ok ? 'audio_unlocked' : 'audio_unlock_failed', { engine: 'eleven_agents' }));
    this.connectionStartTime = performance.now();
    logConversationEngine('websocket_connecting', {
      engine: 'eleven_agents',
      connectionStartMs: this.connectionStartTime,
    });
    
    // Reset intentional stop flag on fresh start
    this.intentionalStop = false;
    
    try {
      this.setStatus('connecting');

      // Fetch signed URL from edge function
      const { data, error } = await supabase.functions.invoke('eleven-agent-token');
      
      if (error || !data?.signed_url) {
        const tokenError = new Error(`Failed to get signed URL: ${error?.message || 'No URL returned'}`);
        this.lastError = tokenError;
        logConversationEngine('token_fetch_failed', {
          engine: 'eleven_agents',
          errorCategory: 'auth',
        });
        throw tokenError;
      }

      logConversationEngine('token_fetched', {
        engine: 'eleven_agents',
      });

      // Connect to ElevenLabs WebSocket
      this.ws = new WebSocket(data.signed_url);
      
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = (event) => this.handleClose(event);

    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error('Unknown error');
      logConversationEngine('start_error', {
        engine: 'eleven_agents',
        errorCategory: this.categorizeError(this.lastError),
      });
      this.setStatus('error');
      this.emitEvent({
        type: 'error',
        error: this.lastError,
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    logConversationEngine('stopping', {
      engine: 'eleven_agents',
    });
    
    // Mark as intentional stop to prevent reconnection
    this.intentionalStop = true;
    
    // Clear any pending reconnection timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    
    // Stop audio playback
    this.clearAudioEndWatchdog();
    this.audioPlayer.stop();
    
    // Disconnect and clean up audio worklet
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode.port.close();
      this.audioWorkletNode = null;
    }
    
    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close audio context
    if (this.audioContext?.state !== 'closed') {
      await this.audioContext?.close();
      this.audioContext = null;
    }
    
    // Close WebSocket
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client requested disconnect');
    }
    this.ws = null;

    this.setStatus('disconnected');
  }

  async sendText(text: string): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      logConversationEngine('send_text_failed', {
        engine: 'eleven_agents',
        errorCategory: 'network',
      });
      return;
    }

    logConversationEngine('send_text', {
      engine: 'eleven_agents',
    });
    this.liftDiscard('cue'); // a deliberate cue: its reply must be heard
    this.ws.send(JSON.stringify({
      type: 'user_message',
      text,
    }));
  }

  async updateContext(context: ScriptContext): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      logConversationEngine('update_context_failed', {
        engine: 'eleven_agents',
        errorCategory: 'network',
      });
      return;
    }

    // Format script context for ElevenLabs
    const contextMessage = this.formatScriptContext(context);
    
    logConversationEngine('update_context', {
      engine: 'eleven_agents',
    });
    this.ws.send(JSON.stringify({
      type: 'contextual_update',
      text: contextMessage,
    }));
  }

  async sendControl(command: ConversationControlCommand): Promise<void> {
    // Local playback setting: needs no socket
    if (command.type === 'set_playback_speed') {
      this.audioPlayer.setPlaybackSpeed(command.speed);
      return;
    }

    if (this.ws?.readyState !== WebSocket.OPEN) {
      logConversationEngine('send_control_failed', {
        engine: 'eleven_agents',
        errorCategory: 'network',
      });
      return;
    }

    logConversationEngine('send_control', {
      engine: 'eleven_agents',
    });

    switch (command.type) {
      case 'pause_agent':
        // ElevenLabs doesn't have explicit pause, but we can interrupt
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
        break;
      case 'resume_agent':
        // ElevenLabs resumes automatically when user speaks - this is a graceful no-op
        logConversationEngine('resume_agent_noop', {
          engine: 'eleven_agents',
        });
        break;
      case 'interrupt':
        this.audioPlayer.stop(); // silence locally right away, don't wait for the server
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
        break;
      case 'discard_response':
        // Interrupt, and drop every remaining chunk of this reply until the actor speaks or we cue
        this.discardingAudio = true;
        this.discardStartedAt = Date.now();
        this.rejectedReplyEnded = false;
        this.armDiscardQuietTimer();
        logConversationEngine('discard_start', { engine: 'eleven_agents' });
        this.clearAudioEndWatchdog();
        this.audioPlayer.stop();
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
        if (this.isAudioActive) {
          this.isAudioActive = false;
          this.audioStreamEnded = false;
          this.emitEvent({ type: 'agent_audio_ended', timestamp: Date.now() });
        }
        break;
      case 'clear_buffer':
        this.ws.send(JSON.stringify({ type: 'clear_buffer' }));
        break;
    }
  }

  /** Emit user_speech_started on a fresh loud mic chunk (ignored while the agent is audible). */
  private checkSpeechOnset(samples: Int16Array): void {
    const onset = this.detectSpeechOnset(samples, Date.now());
    if (!onset || this.audioPlayer.isBusy) return;
    this.liftDiscard('speech_onset');
    this.emitEvent({ type: 'user_speech_started', timestamp: Date.now() });
  }

  /** Emit agent_audio_ended once the server stream is done and the last chunk has played. */
  private finishAudioIfDrained(): void {
    if (!this.isAudioActive || !this.audioStreamEnded || this.audioPlayer.isBusy) return;
    this.clearAudioEndWatchdog();
    this.isAudioActive = false;
    this.audioStreamEnded = false;
    this.emitEvent({
      type: 'agent_audio_ended',
      timestamp: Date.now(),
    });
  }

  /** Stop dropping agent audio; safe to call any time. */
  liftDiscard(reason: string): void {
    if (this.discardQuietTimer) clearTimeout(this.discardQuietTimer);
    this.discardQuietTimer = null;
    if (!this.discardingAudio) return;
    this.discardingAudio = false;
    this.rejectedReplyEnded = false;
    logConversationEngine('discard_end', {
      engine: 'eleven_agents', reason, ms: Date.now() - this.discardStartedAt,
    });
  }

  /** Safety net: once the rejected reply has gone quiet, never keep muting. */
  private armDiscardQuietTimer(): void {
    if (this.discardQuietTimer) clearTimeout(this.discardQuietTimer);
    this.discardQuietTimer = setTimeout(() => {
      this.discardQuietTimer = null;
      this.liftDiscard('quiet_gap');
    }, ElevenAgentsEngine.DISCARD_QUIET_MS);
  }

  private clearAudioEndWatchdog(): void {
    if (this.audioEndWatchdog) clearTimeout(this.audioEndWatchdog);
    this.audioEndWatchdog = null;
  }

  /**
   * ElevenLabs doesn't send audio_end: once no chunk has arrived for a short quiet window, treat the
   * stream as finished; agent_audio_ended then fires as soon as playback drains (onDrained).
   */
  private armAudioEndWatchdog(): void {
    this.clearAudioEndWatchdog();
    this.audioEndWatchdog = setTimeout(() => {
      this.audioEndWatchdog = null;
      if (!this.isAudioActive || this.audioStreamEnded || this.discardingAudio) return;
      logConversationEngine('audio_end_watchdog_fired', {
        engine: 'eleven_agents',
        audioChunksReceived: this.audioChunksReceived,
      });
      this.audioStreamEnded = true;
      this.finishAudioIfDrained();
    }, ElevenAgentsEngine.AUDIO_QUIET_MS);
  }

  onEvent(callback: (event: ConversationEvent) => void): () => void {
    this.eventListeners.push(callback);
    return () => {
      const index = this.eventListeners.indexOf(callback);
      if (index > -1) this.eventListeners.splice(index, 1);
    };
  }

  getStatus(): ConversationStatus {
    return this.status;
  }

  // Private methods

  private categorizeError(error: Error, wsCloseCode?: number): ConversationEngineLogContext['errorCategory'] {
    if (wsCloseCode === 1008) return 'protocol';
    if (wsCloseCode === 1006) return 'network';
    if (error.message.includes('token') || error.message.includes('auth') || error.message.includes('API')) return 'auth';
    if (error.message.includes('microphone') || error.message.includes('audio') || error.message.includes('getUserMedia')) return 'audio';
    if (error.message.includes('timeout')) return 'timeout';
    return 'unknown';
  }

  private async handleOpen(): Promise<void> {
    const connectionLatencyMs = performance.now() - this.connectionStartTime;
    logConversationEngine('websocket_connected', {
      engine: 'eleven_agents',
      connectionLatencyMs,
    });
    
    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;
    
    try {
      // Build conversation override with voice and custom prompt from initial context
      const conversationOverride: Record<string, unknown> = {};
      
      // Add voice override if specified
      if (this.config.voiceId) {
        conversationOverride.tts = {
          voice_id: this.config.voiceId,
        };
      }
      
      // Add custom prompt from initial context (script lines for rehearsal)
      if (this.config.initialContext?.customInstructions) {
        conversationOverride.agent = {
          prompt: {
            prompt: this.config.initialContext.customInstructions,
          },
        };
        logConversationEngine('custom_prompt_set', {
          engine: 'eleven_agents',
        });
      }
      
      // Send initial configuration with overrides
      this.ws?.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: conversationOverride,
      }));
      logConversationEngine('initiation_sent', {
        engine: 'eleven_agents',
      });

    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error('Unknown error');
      logConversationEngine('handle_open_error', {
        engine: 'eleven_agents',
        errorCategory: this.categorizeError(this.lastError),
      });
      this.setStatus('error');
      this.emitEvent({
        type: 'error',
        error: this.lastError,
        timestamp: Date.now(),
      });
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      // Normalize ElevenLabs events to ConversationEvent types
      switch (message.type) {
        case 'user_transcript': {
          // ElevenLabs uses user_transcription_event nested object
          const transcriptEvent = message.user_transcription_event;
          if (transcriptEvent) {
            // The actor spoke again: the agent's next reply is a fresh one
            this.liftDiscard('transcript');
            // ElevenLabs doesn't have is_final flag - emit user_speech_ended with transcript
            this.emitEvent({
              type: 'user_speech_ended',
              transcript: transcriptEvent.user_transcript || '',
              timestamp: Date.now(),
            });
            logConversationEngine('user_transcript', {
              engine: 'eleven_agents',
            });
          }
          break;
        }

        case 'agent_response': {
          // ElevenLabs sends each reply as ONE complete message (there is no agent_response_end),
          // so every message is a whole reply: started -> text -> ended.
          const responseEvent = message.agent_response_event;
          if (!responseEvent) break;
          // A brand-new reply after the rejected one finished must be heard
          if (this.discardingAudio && this.rejectedReplyEnded) {
            this.liftDiscard('new_reply');
          }
          const text = responseEvent.agent_response || '';
          this.isResponseActive = true;
          this.currentResponseText = text;
          this.emitEvent({ type: 'agent_response_started', timestamp: Date.now() });
          this.emitEvent({ type: 'agent_response_delta', delta: text, timestamp: Date.now() });
          this.emitEvent({ type: 'agent_response', text, timestamp: Date.now() });
          this.emitEvent({ type: 'agent_response_ended', timestamp: Date.now() });
          this.isResponseActive = false;
          this.currentResponseText = '';
          // If this reply was rejected (discard began during the events above), it is now over
          if (this.discardingAudio) this.rejectedReplyEnded = true;
          break;
        }

        case 'agent_response_correction': {
          // Interrupted reply: the server reports what was actually spoken. Text only.
          const corrected = message.agent_response_correction_event?.corrected_agent_response;
          if (typeof corrected === 'string') {
            this.emitEvent({ type: 'agent_response_delta', delta: '', timestamp: Date.now() });
          }
          break;
        }

        case 'agent_response_end':
          if (this.discardingAudio) this.rejectedReplyEnded = true;
          // Response completed - emit final aggregated response
          if (this.isResponseActive) {
            this.emitEvent({
              type: 'agent_response',
              text: this.currentResponseText,
              timestamp: Date.now(),
            });
            this.emitEvent({
              type: 'agent_response_ended',
              timestamp: Date.now(),
            });
            this.isResponseActive = false;
            this.currentResponseText = '';
            logConversationEngine('agent_response_complete', {
              engine: 'eleven_agents',
            });
          }
          break;

        case 'audio': {
          // ElevenLabs uses audio_event nested object with audio_base_64
          const audioEvent = message.audio_event;
          if (!audioEvent) break;
          // A discarded early reply keeps streaming for a moment after the interrupt: never play it
          if (this.discardingAudio) { this.armDiscardQuietTimer(); break; }

          // Track audio streaming state
          this.audioStreamEnded = false;
          if (!this.isAudioActive) {
            this.isAudioActive = true;
            this.audioChunksReceived = 0;
            this.emitEvent({
              type: 'agent_audio_started',
              timestamp: Date.now(),
            });
          }

          // Base64 decode audio and emit
          const audioData = this.base64ToArrayBuffer(audioEvent.audio_base_64);
          this.audioChunksReceived++;
          this.armAudioEndWatchdog();
          this.emitEvent({
            type: 'agent_audio_delta',
            audioData: audioData,
            timestamp: Date.now(),
          });

          // Play the audio chunk
          this.audioPlayer.addChunk(audioData);
          break;
        }

        case 'audio_end':
          // Audio streaming completed; announce the end once playback has drained too
          if (this.isAudioActive) {
            logConversationEngine('audio_stream_complete', {
              engine: 'eleven_agents',
              audioChunksReceived: this.audioChunksReceived,
            });
            this.clearAudioEndWatchdog();
            this.audioStreamEnded = true;
            this.finishAudioIfDrained();
          }
          break;

        case 'interruption':
          if (this.discardingAudio) this.rejectedReplyEnded = true;
          // Stop audio playback immediately on interruption
          this.clearAudioEndWatchdog();
          this.audioPlayer.stop();
          logConversationEngine('interruption_received', {
            engine: 'eleven_agents',
          });
          
          // Handle interruption - end both response and audio if active
          if (this.isResponseActive) {
            this.emitEvent({
              type: 'agent_response',
              text: this.currentResponseText,
              timestamp: Date.now(),
            });
            this.emitEvent({
              type: 'agent_response_ended',
              timestamp: Date.now(),
            });
            this.isResponseActive = false;
            this.currentResponseText = '';
          }
          if (this.isAudioActive) {
            this.emitEvent({
              type: 'agent_audio_ended',
              timestamp: Date.now(),
            });
            this.isAudioActive = false;
            this.audioStreamEnded = false;
          }
          break;

        case 'tool_call':
          // Emit tool call event with name and parameters
          this.emitEvent({
            type: 'tool_call',
            toolName: message.tool_name || 'unknown',
            parameters: message.parameters || {},
            timestamp: Date.now(),
          });
          break;

        case 'conversation_initiation_metadata':
          // Server acknowledged initialization - now we can start microphone
          logConversationEngine('initiation_metadata_received', {
            engine: 'eleven_agents',
          });
          this.isInitialized = true;
          
          // Initialize microphone and send context asynchronously
          (async () => {
            try {
              const micStartTime = performance.now();
              await this.initializeMicrophone();
              const micInitLatencyMs = performance.now() - micStartTime;
              
              logConversationEngine('microphone_initialized', {
                engine: 'eleven_agents',
                micInitLatencyMs,
              });
              
              // Send initial context if provided
              if (this.config.initialContext) {
                await this.updateContext(this.config.initialContext);
              }
              
              this.setStatus('ready');
            } catch (error) {
              this.lastError = error instanceof Error ? error : new Error('Unknown error');
              logConversationEngine('microphone_init_error', {
                engine: 'eleven_agents',
                errorCategory: 'audio',
              });
              this.setStatus('error');
            }
          })();
          break;

        case 'ping':
          // Respond to keepalive with event_id from ping
          if (this.ws?.readyState === WebSocket.OPEN) {
            const eventId = message.ping_event?.event_id;
            this.ws.send(JSON.stringify({ 
              type: 'pong',
              event_id: eventId,
            }));
          }
          break;

        default:
          // Unhandled message types are ignored silently
          break;
      }
    } catch (error) {
      logConversationEngine('message_parse_error', {
        engine: 'eleven_agents',
        errorCategory: 'protocol',
      });
    }
  }

  private handleError(error: Event): void {
    this.lastError = new Error('WebSocket error');
    logConversationEngine('websocket_error', {
      engine: 'eleven_agents',
      errorCategory: 'network',
    });
    this.setStatus('error');
    this.emitEvent({
      type: 'error',
      error: this.lastError,
      timestamp: Date.now(),
    });
  }

  private handleClose(event: CloseEvent): void {
    logConversationEngine('websocket_closed', {
      engine: 'eleven_agents',
      wsCloseCode: event.code,
      wsCloseReason: event.reason,
    });
    
    // Clean up any active response/audio state
    if (this.isResponseActive) {
      this.emitEvent({
        type: 'agent_response',
        text: this.currentResponseText,
        timestamp: Date.now(),
      });
      this.emitEvent({
        type: 'agent_response_ended',
        timestamp: Date.now(),
      });
      this.isResponseActive = false;
      this.currentResponseText = '';
    }
    if (this.isAudioActive) {
      this.emitEvent({
        type: 'agent_audio_ended',
        timestamp: Date.now(),
      });
      this.isAudioActive = false;
      this.audioStreamEnded = false;
    }
    
    // Reset initialized state
    this.isInitialized = false;
    
    // If this was an intentional stop (user clicked stop), don't reconnect
    if (this.intentionalStop) {
      logConversationEngine('intentional_stop', {
        engine: 'eleven_agents',
      });
      this.setStatus('disconnected');
      return;
    }
    
    // Normal close code (1000) typically means intentional close
    if (event.code === 1000) {
      logConversationEngine('clean_close', {
        engine: 'eleven_agents',
      });
      this.setStatus('disconnected');
      return;
    }
    
    // Attempt reconnection with exponential backoff
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logConversationEngine('reconnect_exhausted', {
        engine: 'eleven_agents',
        reconnectAttempt: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
        errorCategory: 'network',
      });
      this.setStatus('disconnected');
      this.emitEvent({
        type: 'error',
        error: new Error('Connection lost after maximum reconnection attempts'),
        timestamp: Date.now(),
      });
      this.reconnectAttempts = 0;
      return;
    }

    // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    this.reconnectAttempts++;
    logConversationEngine('reconnect_scheduled', {
      engine: 'eleven_agents',
      reconnectAttempt: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectDelayMs: delay,
    });
    
    this.setStatus('connecting');
    
    this.reconnectTimeoutId = setTimeout(async () => {
      try {
        // Clean up before reconnecting
        await this.cleanupForReconnect();
        
        logConversationEngine('reconnect_attempting', {
          engine: 'eleven_agents',
          reconnectAttempt: this.reconnectAttempts,
        });
        
        // Attempt to start again
        await this.start();
        
        logConversationEngine('reconnect_success', {
          engine: 'eleven_agents',
          reconnectAttempt: this.reconnectAttempts,
        });
      } catch (error) {
        logConversationEngine('reconnect_failed', {
          engine: 'eleven_agents',
          reconnectAttempt: this.reconnectAttempts,
          errorCategory: this.categorizeError(error instanceof Error ? error : new Error('Unknown')),
        });
        // start() already handles error state, attemptReconnect will be called again from handleClose
      }
    }, delay);
  }

  private async cleanupForReconnect(): Promise<void> {
    // Stop audio playback
    this.audioPlayer.stop();
    
    // Disconnect and clean up audio worklet
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode.port.close();
      this.audioWorkletNode = null;
    }
    
    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close audio context
    if (this.audioContext?.state !== 'closed') {
      await this.audioContext?.close();
      this.audioContext = null;
    }
    
    this.ws = null;
  }

  private async initializeMicrophone(): Promise<void> {
    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } 
    });

    // Create audio context with native sample rate (Firefox compatibility)
    // Firefox doesn't allow connecting MediaStreamSource to AudioContext with different sample rates
    this.audioContext = new AudioContext();
    const nativeSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000; // ElevenLabs requirement
    
    logConversationEngine('audio_context_created', {
      engine: 'eleven_agents',
      nativeSampleRate,
      targetSampleRate,
    });
    
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Use AudioWorklet for modern, efficient audio processing (replaces deprecated ScriptProcessorNode)
    try {
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm16-audio-processor');
      
      // Send sample rate configuration to worklet for resampling
      this.audioWorkletNode.port.postMessage({
        type: 'init',
        sourceSampleRate: nativeSampleRate,
        targetSampleRate: targetSampleRate,
      });
      
      // Handle audio data from worklet
      this.audioWorkletNode.port.onmessage = (event) => {
        // Only send audio if WebSocket is open AND we're fully initialized
        if (this.ws?.readyState !== WebSocket.OPEN || !this.isInitialized) return;
        
        const { type, buffer } = event.data;
        if (type === 'audio') {
          this.checkSpeechOnset(new Int16Array(buffer));
          // Convert ArrayBuffer to base64
          const base64 = this.arrayBufferToBase64(buffer);
          
          // Send to ElevenLabs as JSON with base64-encoded audio
          this.ws.send(JSON.stringify({
            user_audio_chunk: base64,
          }));
        }
      };
      
      // Connect audio pipeline
      source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);
      
      logConversationEngine('audio_worklet_active', {
        engine: 'eleven_agents',
        nativeSampleRate,
      });
    } catch (workletError) {
      logConversationEngine('audio_worklet_fallback', {
        engine: 'eleven_agents',
        errorCategory: 'audio',
        nativeSampleRate,
      });
      // Fallback to ScriptProcessorNode for older browsers
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // Resampling state for ScriptProcessorNode fallback
      const resampleRatio = nativeSampleRate / targetSampleRate;
      
      processor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN || !this.isInitialized) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Resample from native rate to 16kHz using linear interpolation
        const outputLength = Math.floor(inputData.length / resampleRatio);
        const int16Array = new Int16Array(outputLength);
        
        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i * resampleRatio;
          const srcIndexFloor = Math.floor(srcIndex);
          const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
          const fraction = srcIndex - srcIndexFloor;
          
          // Linear interpolation between samples
          const sample = inputData[srcIndexFloor] * (1 - fraction) + inputData[srcIndexCeil] * fraction;
          const s = Math.max(-1, Math.min(1, sample));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        this.checkSpeechOnset(int16Array);
        const base64 = this.arrayBufferToBase64(int16Array.buffer);
        this.ws.send(JSON.stringify({ user_audio_chunk: base64 }));
      };
      
      source.connect(processor);
      processor.connect(this.audioContext.destination);
    }
  }

  private formatScriptContext(context: ScriptContext): string {
    const parts: string[] = [
      `Script: ${context.scriptTitle}`,
      `Progress: Line ${context.currentLine} of ${context.totalLines}`,
    ];

    if (context.scene) {
      parts.push(`Scene: ${context.scene}`);
    }

    if (context.currentCue) {
      parts.push(`Current cue: "${context.currentCue.text}" (${context.currentCue.characterName})`);
    }

    if (context.nextCue) {
      parts.push(`Your next line: "${context.nextCue.text}" (${context.nextCue.characterName})`);
    }

    if (context.upcomingCues.length > 0) {
      const upcoming = context.upcomingCues.map(c => `"${c.text}"`).join(', ');
      parts.push(`Upcoming lines: ${upcoming}`);
    }

    if (context.customInstructions) {
      parts.push(context.customInstructions);
    }

    return parts.join('. ');
  }

  private setStatus(newStatus: ConversationStatus): void {
    const previousStatus = this.status;
    const statusDurationMs = this.statusChangeTime 
      ? performance.now() - this.statusChangeTime 
      : undefined;
    
    this.status = newStatus;
    this.statusChangeTime = performance.now();
    
    logConversationEngine('status_changed', {
      engine: 'eleven_agents',
      previousStatus,
      newStatus,
      statusDurationMs,
    });
    
    this.emitEvent({
      type: 'status_changed',
      status: newStatus,
      previousStatus,
      timestamp: Date.now(),
    });
  }

  private emitEvent(event: ConversationEvent): void {
    this.eventListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logConversationEngine('event_callback_error', {
          engine: 'eleven_agents',
          errorCategory: 'unknown',
        });
      }
    });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
