/**
 * ElevenLabs Conversational AI Engine
 * Phase 2: Real implementation using ElevenLabs Agents API
 * Phase 3.5: Structured telemetry for production monitoring
 */

import { ConversationEngine, ConversationStatus, ConversationEvent, ConversationControlCommand } from './types';
import { ConversationEngineConfig, ScriptContext } from './domain';
import { supabase } from '@/integrations/supabase/client';
import { ConversationAudioPlayer } from './AudioPlayer';
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
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
        break;
      case 'clear_buffer':
        this.ws.send(JSON.stringify({ type: 'clear_buffer' }));
        break;
    }
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
      const conversationOverride: Record<string, any> = {};
      
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
        case 'user_transcript':
          // ElevenLabs uses user_transcription_event nested object
          const transcriptEvent = message.user_transcription_event;
          if (transcriptEvent) {
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

        case 'agent_response':
          // ElevenLabs uses agent_response_event nested object
          const responseEvent = message.agent_response_event;
          if (!responseEvent) break;
          
          // Start tracking response if not already active
          if (!this.isResponseActive) {
            this.isResponseActive = true;
            this.currentResponseText = '';
            this.emitEvent({
              type: 'agent_response_started',
              timestamp: Date.now(),
            });
          }

          // Accumulate response text and emit delta
          const delta = responseEvent.agent_response || '';
          this.currentResponseText += delta;
          this.emitEvent({
            type: 'agent_response_delta',
            delta,
            timestamp: Date.now(),
          });
          break;

        case 'agent_response_end':
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

        case 'audio':
          // ElevenLabs uses audio_event nested object with audio_base_64
          const audioEvent = message.audio_event;
          if (!audioEvent) break;
          
          // Track audio streaming state
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
          this.emitEvent({
            type: 'agent_audio_delta',
            audioData: audioData,
            timestamp: Date.now(),
          });
          
          // Play the audio chunk
          this.audioPlayer.addChunk(audioData);
          break;

        case 'audio_end':
          // Audio streaming completed
          if (this.isAudioActive) {
            this.emitEvent({
              type: 'agent_audio_ended',
              timestamp: Date.now(),
            });
            logConversationEngine('audio_stream_complete', {
              engine: 'eleven_agents',
              audioChunksReceived: this.audioChunksReceived,
            });
            this.isAudioActive = false;
          }
          break;

        case 'interruption':
          // Stop audio playback immediately on interruption
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

    // Create audio context for resampling to 16kHz (ElevenLabs requirement)
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Use AudioWorklet for modern, efficient audio processing (replaces deprecated ScriptProcessorNode)
    try {
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm16-audio-processor');
      
      // Handle audio data from worklet
      this.audioWorkletNode.port.onmessage = (event) => {
        // Only send audio if WebSocket is open AND we're fully initialized
        if (this.ws?.readyState !== WebSocket.OPEN || !this.isInitialized) return;
        
        const { type, buffer } = event.data;
        if (type === 'audio') {
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
      });
    } catch (workletError) {
      logConversationEngine('audio_worklet_fallback', {
        engine: 'eleven_agents',
        errorCategory: 'audio',
      });
      // Fallback to ScriptProcessorNode for older browsers
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN || !this.isInitialized) return;
        
        const float32Array = e.inputBuffer.getChannelData(0);
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          const s = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
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
