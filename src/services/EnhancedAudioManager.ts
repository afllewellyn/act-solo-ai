/**
 * Enhanced Audio Manager with Engine Switching Infrastructure
 * Phase 3 - Engine Switch Infrastructure
 */

import { useCallback, useRef } from 'react';
import { useTTS } from '@/hooks/useTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { logger, logAudioManager, generateRequestId } from '@/lib/logger';
import { isFeatureEnabled } from '@/lib/featureFlags';

export type AudioEngine = 'webspeech' | 's2s'; // s2s = speech-to-speech (OpenAI Realtime)

export interface AudioManagerConfig {
  defaultVoice?: string;
  language?: string;
  engine?: AudioEngine;
  onTTSComplete?: () => void;
  onTTSError?: (error: string) => void;
  onSpeechError?: (error: string) => void;
  onCueDetected?: (cue: string) => void;
  onMobileListenRequest?: () => void;
}

export interface AudioManagerReturn {
  // TTS methods
  speakText: (text: string, options?: TTSSpeakOptions) => Promise<void>;
  pauseTTS: () => void;
  resumeTTS: () => Promise<void>;
  stopTTS: () => void;
  enableAudio: () => Promise<void>;
  
  // Speech Recognition methods
  startListeningForCue: (textToMatch: string) => void;
  stopListening: () => void;
  manualTriggerListen: () => void;
  
  // VAD methods (OpenAI Realtime API)
  initializeVADConnection: () => Promise<void>;
  updateVADCueWords: (cueWords: string[]) => void;
  stopVADConnection: () => void;
  
  // Combined control
  stopAll: () => void;
  
  // State
  isTTSPlaying: boolean;
  isTTSLoading: boolean;
  isTTSPaused: boolean;
  needsUserGesture: boolean;
  showTapToResume: boolean;
  isListening: boolean;
  isListeningSupported: boolean;
  targetWords: string[];
  isMobile: boolean;
  waitingForUserTrigger: boolean;
  currentEngine: AudioEngine;
  isSpeechSupported: boolean;
}

export interface TTSSpeakOptions {
  voiceId?: string;
  playbackSpeed?: number;
  onComplete?: () => void;
  lineIdx?: number;
  requestId?: string;
}

export const useAudioManager = (config: AudioManagerConfig = {}): AudioManagerReturn => {
  const currentEngineRef = useRef<AudioEngine>(config.engine || 's2s');
  const fallbackAttemptedRef = useRef(false);
  
  // Initialize TTS and Speech Recognition hooks
  const {
    speak,
    pause,
    resume,
    stop,
    enableAudio,
    isPlaying: isTTSPlaying,
    isLoading: isTTSLoading,
    isPaused: isTTSPaused,
    needsUserGesture,
    showTapToResume
  } = useTTS();

  const {
    startListeningForCue,
    stopListening,
    manualTriggerListen,
    isListening,
    isSupported: isListeningSupported,
    targetWords,
    isMobile,
    waitingForUserTrigger
  } = useSpeechRecognition({
    onCueDetected: config.onCueDetected,
    onError: config.onSpeechError || config.onTTSError,
    language: config.language,
    onMobileListenRequest: config.onMobileListenRequest
  });

  // Enhanced speakText with engine switching and auto-fallback
  const speakText = useCallback(async (text: string, options: TTSSpeakOptions = {}) => {
    const engine = currentEngineRef.current;
    
    logAudioManager('speak_text_called', {
      engine,
      textLength: text.length,
      voiceId: options.voiceId || config.defaultVoice,
      sessionId: logger.getSessionId()
    });

    try {
      // Always use ElevenLabs via useTTS (webspeech engine)
      // S2S is now used only for VAD, not for TTS
      const reqId = options.requestId || generateRequestId();
      await speak(text, {
        voiceId: options.voiceId || config.defaultVoice || '9BWtsMINqrJLrRacOk9x',
        playbackSpeed: options.playbackSpeed,
        engine: currentEngineRef.current,
        lineIdx: options.lineIdx,
        requestId: reqId,
        onComplete: () => {
          logAudioManager('speech_completed', {
            engine: currentEngineRef.current,
            sessionId: logger.getSessionId()
          });
          options.onComplete?.();
          config.onTTSComplete?.();
        }
      });
      
      // Reset fallback attempt on success
      fallbackAttemptedRef.current = false;
      
    } catch (error) {
      logAudioManager('speech_error', {
        engine,
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: logger.getSessionId()
      });
      
      // Auto-fallback logic for S2S failures
      if (engine === 's2s' && isFeatureEnabled('auto_fallback_enabled') && !fallbackAttemptedRef.current) {
        fallbackAttemptedRef.current = true;
        currentEngineRef.current = 'webspeech';
        logAudioManager('auto_fallback_to_webspeech', {
          reason: 's2s_error',
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: logger.getSessionId()
        });
        await speakText(text, options);
        return;
      }
      
      config.onTTSError?.(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }, [speak, config, logger]);

  // Audio recorder for streaming microphone to OpenAI S2S (VAD only)
  class AudioRecorder {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    constructor(private onAudioData: (audioData: Float32Array) => void) {}

    async start() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 24000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        this.audioContext = new AudioContext({ sampleRate: 24000 });
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        this.processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          this.onAudioData(new Float32Array(inputData));
        };
        
        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        
        console.log('[AudioRecorder] Started streaming microphone to S2S');
      } catch (error) {
        console.error('[AudioRecorder] Error accessing microphone:', error);
        throw error;
      }
    }

    stop() {
      if (this.source) this.source.disconnect();
      if (this.processor) this.processor.disconnect();
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      if (this.audioContext) this.audioContext.close();
      
      this.source = null;
      this.processor = null;
      this.stream = null;
      this.audioContext = null;
      
      console.log('[AudioRecorder] Stopped microphone streaming');
    }
  }

  // Helper: Encode Float32 PCM to base64 PCM16
  function encodeAudioForAPI(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return btoa(binary);
  }

  // Helper: Phonetic matching for cue word detection
  function soundsLike(spoken: string, target: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    return normalize(spoken) === normalize(target);
  }

  // Persistent S2S connection for VAD-only (no audio output from OpenAI)
  const vadConnectionRef = useRef<{
    ws: WebSocket | null;
    recorder: AudioRecorder | null;
    isActive: boolean;
    currentCueWords: string[];
  }>({
    ws: null,
    recorder: null,
    isActive: false,
    currentCueWords: []
  });

  const initializeVADConnection = useCallback(async () => {
    if (vadConnectionRef.current.isActive) {
      console.log('[VAD] Connection already active');
      return;
    }

    const wsUrl = `wss://uomdyqdvorusucuudwnz.functions.supabase.co/functions/v1/realtime-s2s`;
    console.log('[VAD] 🔌 Attempting connection to:', wsUrl);
    console.log('[VAD] 🕐 Timestamp:', new Date().toISOString());
    
    const ws = new WebSocket(wsUrl);
    console.log('[VAD] WebSocket created, readyState:', ws.readyState); // 0 = CONNECTING
    vadConnectionRef.current.ws = ws;
    
    ws.onopen = async () => {
      console.log('[VAD] ✅ WebSocket connected');
      console.log('[VAD] 🕐 Connection established at:', new Date().toISOString());
      
      // Send VAD-only session configuration
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text'], // ✅ Text-only (no audio output)
          instructions: 'You are a voice activity detection system. Your only job is to detect when the user stops speaking.',
          input_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1000
          }
        }
      }));
      
      // Initialize microphone streaming
      const recorder = new AudioRecorder((audioData) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encodeAudioForAPI(audioData)
          }));
          console.log('[VAD] 🎤 Sent audio buffer (readyState:', ws.readyState, ')');
        } else {
          console.warn('[VAD] ⚠️ Cannot send audio - WebSocket not open (readyState:', ws.readyState, ')');
        }
      });
      
      try {
        console.log('[VAD] 🎤 Starting microphone recorder...');
        await recorder.start();
        vadConnectionRef.current.recorder = recorder;
        vadConnectionRef.current.isActive = true;
        console.log('[VAD] ✅ Microphone streaming started successfully');
      } catch (error) {
        console.error('[VAD] ❌ Failed to start microphone:', error);
        console.error('[VAD] Error type:', error instanceof Error ? error.name : typeof error);
        console.error('[VAD] Error message:', error instanceof Error ? error.message : String(error));
        ws.close();
        throw error;
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'session.created') {
          console.log('[VAD] Session created');
        } else if (data.type === 'session.updated') {
          console.log('[VAD] Session configured for VAD-only mode');
        } else if (data.type === 'input_audio_buffer.speech_started') {
          console.log('[VAD] 🎤 User started speaking');
        } else if (data.type === 'input_audio_buffer.speech_stopped') {
          console.log('[VAD] 🎤 User stopped speaking');
          // When VAD detects speech stopped, notify cue detection system
          const cueWords = vadConnectionRef.current.currentCueWords;
          if (cueWords.length > 0) {
            console.log('[VAD] ✅ Speech stopped - triggering cue detection');
            config.onCueDetected?.(cueWords[0]);
          }
        } else if (data.type === 'conversation.item.input_audio_transcription.completed') {
          // TODO: This handler is currently unused - transcription disabled to avoid 429 errors
          // Kept for potential future use if needed
          const transcript = data.transcript?.toLowerCase() || '';
          console.log('[VAD] 📝 Transcription (unused):', transcript);
        } else if (data.type === 'error') {
          console.error('[VAD] Error:', data.error);
        }
      } catch (error) {
        console.error('[VAD] Message parse error:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('[VAD] ❌ WebSocket ERROR:', error);
      console.error('[VAD] Error type:', error.type);
      console.error('[VAD] Target readyState:', (error.target as WebSocket)?.readyState);
      console.error('[VAD] 🕐 Error timestamp:', new Date().toISOString());
    };
    
    ws.onclose = (event) => {
      console.log('[VAD] 🔌 WebSocket CLOSED');
      console.log('[VAD] Close code:', event.code);
      console.log('[VAD] Close reason:', event.reason || '(no reason provided)');
      console.log('[VAD] Was clean:', event.wasClean);
      console.log('[VAD] 🕐 Close timestamp:', new Date().toISOString());
      vadConnectionRef.current.recorder?.stop();
      vadConnectionRef.current.isActive = false;
    };
  }, [config]);

  const updateVADCueWords = useCallback((cueWords: string[]) => {
    console.log('[VAD] Updating cue words:', cueWords);
    vadConnectionRef.current.currentCueWords = cueWords;
  }, []);

  const stopVADConnection = useCallback(() => {
    console.log('[VAD] Stopping connection');
    vadConnectionRef.current.ws?.close();
    vadConnectionRef.current.recorder?.stop();
    vadConnectionRef.current.isActive = false;
  }, []);

  // S2S implementation using WebSocket to realtime-s2s edge function (TTS fallback)
  const speakWithS2S = useCallback(async (text: string, options: TTSSpeakOptions = {}) => {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `wss://uomdyqdvorusucuudwnz.functions.supabase.co/functions/v1/realtime-s2s`;
      
      logAudioManager('s2s_connection_start', {
        url: wsUrl,
        text: text.substring(0, 50) + '...',
        sessionId: logger.getSessionId()
      });
      
      // Audio processing setup
      let audioContext: AudioContext | null = null;
      let audioQueue: AudioBuffer[] = [];
      let isPlaying = false;
      let sessionCreated = false;
      
      const ws = new WebSocket(wsUrl);
      let resolved = false;
      
      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!sessionCreated && !resolved) {
          logAudioManager('s2s_connection_timeout', { sessionId: logger.getSessionId() });
          resolved = true;
          ws.close();
          reject(new Error('S2S connection timeout'));
        }
      }, 10000); // 10 second timeout

      // Initialize audio context
      const initAudioContext = async () => {
        try {
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 24000
          });
          
          // Unlock audio context for mobile browsers
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          logAudioManager('s2s_audio_context_ready', { 
            state: audioContext.state,
            sessionId: logger.getSessionId() 
          });
        } catch (error) {
          logAudioManager('s2s_audio_context_error', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId: logger.getSessionId() 
          });
          throw error;
        }
      };

      // Convert base64 PCM16 to AudioBuffer
      const decodeAudioDelta = async (base64Audio: string): Promise<AudioBuffer | null> => {
        if (!audioContext) return null;
        
        try {
          // Decode base64 to binary
          const binaryString = atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Convert PCM16 bytes to Float32Array
          const samples = new Float32Array(bytes.length / 2);
          const dataView = new DataView(bytes.buffer);
          
          for (let i = 0; i < samples.length; i++) {
            // Read 16-bit signed integer (little endian) and convert to float
            const sample = dataView.getInt16(i * 2, true);
            samples[i] = sample / 32768.0; // Convert to [-1, 1] range
          }
          
          // Create AudioBuffer
          const audioBuffer = audioContext.createBuffer(1, samples.length, 24000);
          audioBuffer.getChannelData(0).set(samples);
          
          return audioBuffer;
        } catch (error) {
          logAudioManager('s2s_audio_decode_error', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId: logger.getSessionId() 
          });
          return null;
        }
      };

      // Play audio buffer with queue management
      const playAudioBuffer = async (audioBuffer: AudioBuffer) => {
        if (!audioContext) return;
        
        try {
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          return new Promise<void>((resolvePlay) => {
            source.onended = () => {
              resolvePlay();
              playNextInQueue();
            };
            source.start(0);
          });
        } catch (error) {
          logAudioManager('s2s_audio_play_error', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId: logger.getSessionId() 
          });
        }
      };

      // Queue management for sequential audio playback
      const playNextInQueue = async () => {
        if (audioQueue.length === 0) {
          isPlaying = false;
          return;
        }
        
        const nextBuffer = audioQueue.shift();
        if (nextBuffer) {
          await playAudioBuffer(nextBuffer);
        }
      };

      const addToQueue = async (audioBuffer: AudioBuffer) => {
        audioQueue.push(audioBuffer);
        
        if (!isPlaying) {
          isPlaying = true;
          await playNextInQueue();
        }
      };
      
      ws.onopen = async () => {
        logAudioManager('s2s_connected', { sessionId: logger.getSessionId() });
        
        // Initialize audio context
        try {
          await initAudioContext();
        } catch (error) {
          reject(new Error('Failed to initialize audio context'));
          return;
        }
        
        // IMPORTANT: Send session configuration IMMEDIATELY so edge function can buffer it
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are a helpful assistant that reads text aloud. The user will provide text and you should read it clearly and naturally. Text to read: "${text}"`,
            voice: options.voiceId?.includes('alloy') ? 'alloy' : 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000
            }
          }
        }));
        
        // Send conversation messages immediately (will be buffered by edge function until session ready)
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text }]
          }
        }));
        
        ws.send(JSON.stringify({ type: 'response.create' }));
      };
      
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'session.created') {
            sessionCreated = true;
            logAudioManager('s2s_session_created', { sessionId: logger.getSessionId() });
            
          } else if (data.type === 'session.updated') {
            logAudioManager('s2s_session_updated', { sessionId: logger.getSessionId() });
            
          } else if (data.type === 'response.audio.delta') {
            // Handle audio streaming with actual playback
            logAudioManager('s2s_audio_delta', { 
              deltaSize: data.delta?.length || 0,
              sessionId: logger.getSessionId() 
            });
            
            if (data.delta) {
              const audioBuffer = await decodeAudioDelta(data.delta);
              if (audioBuffer) {
                await addToQueue(audioBuffer);
              }
            }
            
          } else if (data.type === 'response.audio_transcript.delta') {
            logAudioManager('s2s_transcript_delta', { 
              transcript: data.delta,
              sessionId: logger.getSessionId() 
            });
            
          } else if (data.type === 'response.audio.done') {
            logAudioManager('s2s_audio_done', { sessionId: logger.getSessionId() });
            
          } else if (data.type === 'response.done') {
            logAudioManager('s2s_complete', { sessionId: logger.getSessionId() });
            
            // Wait for audio queue to finish before resolving
            const waitForQueue = () => {
              if (audioQueue.length === 0 && !isPlaying) {
                if (!resolved) {
                  resolved = true;
                  resolve();
                  options.onComplete?.();
                  config.onTTSComplete?.();
                }
                ws.close();
              } else {
                setTimeout(waitForQueue, 100);
              }
            };
            waitForQueue();
            
          } else if (data.type === 'error') {
            logAudioManager('s2s_response_error', { 
              error: data.error,
              sessionId: logger.getSessionId() 
            });
            if (!resolved) {
              resolved = true;
              reject(new Error(data.error || 'S2S error'));
            }
            ws.close();
            
          } else {
            // Log other message types for debugging
            logAudioManager('s2s_message_received', { 
              type: data.type,
              sessionId: logger.getSessionId() 
            });
          }
          
        } catch (error) {
          logAudioManager('s2s_message_parse_error', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId: logger.getSessionId() 
          });
          if (!resolved) {
            resolved = true;
            reject(error);
          }
          ws.close();
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        logAudioManager('s2s_ws_error', {
          error: 'WebSocket error',
          sessionId: logger.getSessionId()
        });
        if (!resolved) {
          resolved = true;
          reject(new Error('S2S WebSocket connection failed'));
        }
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        logAudioManager('s2s_ws_closed', {
          code: event.code,
          reason: event.reason,
          sessionId: logger.getSessionId()
        });
        
        // Clean up audio context
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().catch(() => {
            // Ignore cleanup errors
          });
        }
        
        if (!resolved) {
          resolved = true;
          reject(new Error('S2S connection closed unexpectedly'));
        }
      };
    });
  }, [config, logger]);

  // Unified stop function for all audio operations
  const stopAll = useCallback(() => {
    logAudioManager('stop_all_called', {
      engine: currentEngineRef.current,
      wasTTSPlaying: isTTSPlaying,
      wasListening: isListening,
      sessionId: logger.getSessionId()
    });
    
    stop(); // Stop TTS
    stopListening(); // Stop speech recognition
    
    // Reset fallback state
    fallbackAttemptedRef.current = false;
  }, [stop, stopListening, isTTSPlaying, isListening]);

  // TTS control methods
  const pauseTTS = useCallback(() => {
    logAudioManager('pause_tts', {
      engine: currentEngineRef.current,
      sessionId: logger.getSessionId()
    });
    pause();
  }, [pause]);

  const resumeTTS = useCallback(async () => {
    logAudioManager('resume_tts', {
      engine: currentEngineRef.current,
      sessionId: logger.getSessionId()
    });
    await resume();
  }, [resume]);

  const stopTTS = useCallback(() => {
    logAudioManager('stop_tts', {
      engine: currentEngineRef.current,
      sessionId: logger.getSessionId()
    });
    stop();
  }, [stop]);

  return {
    // TTS methods
    speakText,
    pauseTTS,
    resumeTTS,
    stopTTS,
    enableAudio,
    
    // Speech Recognition methods
    startListeningForCue,
    stopListening,
    manualTriggerListen,
    
    // VAD methods (OpenAI Realtime API)
    initializeVADConnection,
    updateVADCueWords,
    stopVADConnection,
    
    // Combined control
    stopAll,
    
    // State
    isTTSPlaying,
    isTTSLoading,
    isTTSPaused,
    needsUserGesture,
    showTapToResume,
    isListening,
    isListeningSupported,
    targetWords,
    isMobile,
    waitingForUserTrigger,
    currentEngine: currentEngineRef.current,
    isSpeechSupported: isListeningSupported
  };
};