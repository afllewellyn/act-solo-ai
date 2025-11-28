/**
 * ElevenLabs Conversational AI Engine
 * Phase 2: Real implementation using ElevenLabs Agents API
 */

import { ConversationEngine, ConversationStatus, ConversationEvent, ConversationControlCommand } from './types';
import { ConversationEngineConfig, ScriptContext } from './domain';
import { supabase } from '@/integrations/supabase/client';

export class ElevenAgentsEngine implements ConversationEngine {
  private ws: WebSocket | null = null;
  private status: ConversationStatus = 'idle';
  private eventListeners: Array<(event: ConversationEvent) => void> = [];
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private config: ConversationEngineConfig;
  
  // Response buffering state
  private currentResponseText: string = '';
  private isResponseActive: boolean = false;
  private isAudioActive: boolean = false;

  constructor(config: ConversationEngineConfig) {
    this.config = config;
    console.log('[ElevenAgentsEngine] Created with config:', { 
      agentId: config.agentId,
      voiceId: config.voiceId,
      language: config.language 
    });
  }

  async start(): Promise<void> {
    console.log('[ElevenAgentsEngine] Starting...');
    
    try {
      this.setStatus('connecting');

      // Fetch signed URL from edge function
      const { data, error } = await supabase.functions.invoke('eleven-agent-token');
      
      if (error || !data?.signed_url) {
        throw new Error(`Failed to get signed URL: ${error?.message || 'No URL returned'}`);
      }

      console.log('[ElevenAgentsEngine] Got signed URL, connecting WebSocket...');

      // Connect to ElevenLabs WebSocket
      this.ws = new WebSocket(data.signed_url);
      
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = (event) => this.handleClose(event);

    } catch (error) {
      console.error('[ElevenAgentsEngine] Start error:', error);
      this.setStatus('error');
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error('Unknown error'),
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('[ElevenAgentsEngine] Stopping...');
    
    // Disconnect and clean up audio processor
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor.onaudioprocess = null;
      this.audioProcessor = null;
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
      console.warn('[ElevenAgentsEngine] Cannot send text, WebSocket not open');
      return;
    }

    console.log('[ElevenAgentsEngine] Sending text:', text);
    this.ws.send(JSON.stringify({
      type: 'user_message',
      text,
    }));
  }

  async updateContext(context: ScriptContext): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[ElevenAgentsEngine] Cannot update context, WebSocket not open');
      return;
    }

    // Format script context for ElevenLabs
    const contextMessage = this.formatScriptContext(context);
    
    console.log('[ElevenAgentsEngine] Updating context:', contextMessage);
    this.ws.send(JSON.stringify({
      type: 'contextual_update',
      text: contextMessage,
    }));
  }

  async sendControl(command: ConversationControlCommand): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[ElevenAgentsEngine] Cannot send control, WebSocket not open');
      return;
    }

    console.log('[ElevenAgentsEngine] Sending control:', command);

    switch (command.type) {
      case 'pause_agent':
        // ElevenLabs doesn't have explicit pause, but we can interrupt
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
        break;
      case 'resume_agent':
        // ElevenLabs Conversational AI doesn't support explicit resume
        // The agent resumes automatically when the user speaks or interruption ends
        console.warn('[ElevenAgentsEngine] resume_agent not supported by ElevenLabs - agent resumes automatically');
        this.emitEvent({
          type: 'error',
          error: new Error('resume_agent command not supported by ElevenLabs Conversational AI'),
          timestamp: Date.now(),
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

  private async handleOpen(): Promise<void> {
    console.log('[ElevenAgentsEngine] WebSocket connected');
    
    try {
      // Initialize microphone
      await this.initializeMicrophone();
      
      // Send initial configuration if voice override is specified
      if (this.config.voiceId) {
        console.log('[ElevenAgentsEngine] Sending voice override:', this.config.voiceId);
        this.ws?.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            tts: {
              voice_id: this.config.voiceId,
            },
          },
        }));
      }

      // Send initial context if provided
      if (this.config.initialContext) {
        await this.updateContext(this.config.initialContext);
      }

      this.setStatus('ready');
    } catch (error) {
      console.error('[ElevenAgentsEngine] Error in handleOpen:', error);
      this.setStatus('error');
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error('Unknown error'),
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
          if (message.user_transcript?.is_final) {
            this.emitEvent({
              type: 'user_speech_ended',
              transcript: message.user_transcript.text,
              timestamp: Date.now(),
            });
          } else {
            this.emitEvent({
              type: 'user_speech_started',
              timestamp: Date.now(),
            });
          }
          break;

        case 'agent_response':
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
          const delta = message.agent_response.text || '';
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
          }
          break;

        case 'audio':
          // Track audio streaming state
          if (!this.isAudioActive) {
            this.isAudioActive = true;
            this.emitEvent({
              type: 'agent_audio_started',
              timestamp: Date.now(),
            });
          }

          // Base64 decode audio and emit
          const audioData = this.base64ToArrayBuffer(message.audio.chunk);
          this.emitEvent({
            type: 'agent_audio_delta',
            audioData: audioData,
            timestamp: Date.now(),
          });
          break;

        case 'audio_end':
          // Audio streaming completed
          if (this.isAudioActive) {
            this.emitEvent({
              type: 'agent_audio_ended',
              timestamp: Date.now(),
            });
            this.isAudioActive = false;
          }
          break;

        case 'interruption':
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

        case 'ping':
          // Respond to keepalive
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;

        default:
          console.log('[ElevenAgentsEngine] Unhandled message type:', message.type);
      }
    } catch (error) {
      console.error('[ElevenAgentsEngine] Error handling message:', error);
    }
  }

  private handleError(error: Event): void {
    console.error('[ElevenAgentsEngine] WebSocket error:', error);
    this.setStatus('error');
    this.emitEvent({
      type: 'error',
      error: new Error('WebSocket error'),
      timestamp: Date.now(),
    });
  }

  private handleClose(event: CloseEvent): void {
    console.log('[ElevenAgentsEngine] WebSocket closed:', event.code, event.reason);
    
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
    
    this.setStatus('disconnected');
  }

  private async initializeMicrophone(): Promise<void> {
    console.log('[ElevenAgentsEngine] Initializing microphone...');
    
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
    
    // Use ScriptProcessorNode to extract raw PCM audio samples
    // Note: ScriptProcessorNode is deprecated but AudioWorklet requires separate processor file
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      
      // Get Float32Array audio data from input
      const float32Array = e.inputBuffer.getChannelData(0);
      
      // Convert Float32Array (-1.0 to 1.0) to Int16Array (PCM16 format)
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        // Clamp to [-1, 1] and convert to 16-bit signed integer
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert Int16Array to base64
      const base64 = this.arrayBufferToBase64(int16Array.buffer);
      
      // Send to ElevenLabs as user audio chunk
      this.ws.send(JSON.stringify({
        type: 'user_audio_chunk',
        audio_data: base64,
      }));
    };
    
    // Connect audio pipeline
    source.connect(processor);
    processor.connect(this.audioContext.destination);
    
    console.log('[ElevenAgentsEngine] Microphone initialized - streaming PCM16 @ 16kHz');
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
    this.status = newStatus;
    
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
        console.error('[ElevenAgentsEngine] Error in event callback:', error);
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
