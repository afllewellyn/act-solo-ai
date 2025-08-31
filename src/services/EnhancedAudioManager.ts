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
  const currentEngineRef = useRef<AudioEngine>(config.engine || 'webspeech');
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
      if (engine === 's2s' && isFeatureEnabled('realtime_api_enabled')) {
        // Phase 3 - OpenAI Realtime API implementation via WebSocket
        try {
          await speakWithS2S(text, options);
          fallbackAttemptedRef.current = false;
          return;
        } catch (error) {
          logAudioManager('s2s_error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId: logger.getSessionId()
          });
          
          // Auto-fallback to Web Speech if enabled
          if (isFeatureEnabled('auto_fallback_enabled') && !fallbackAttemptedRef.current) {
            fallbackAttemptedRef.current = true;
            currentEngineRef.current = 'webspeech';
            logAudioManager('auto_fallback_to_webspeech', {
              reason: 's2s_error',
              sessionId: logger.getSessionId()
            });
            await speakText(text, options);
            return;
          }
          throw error;
        }
      }
      
      // Use Web Speech engine (current implementation)
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

  // S2S implementation using WebSocket to realtime-s2s edge function
  const speakWithS2S = useCallback(async (text: string, options: TTSSpeakOptions = {}) => {
    return new Promise<void>((resolve, reject) => {
      const wsUrl = `wss://uomdyqdvorusucuudwnz.functions.supabase.co/functions/v1/realtime-s2s`;
      
      logAudioManager('s2s_connection_start', {
        url: wsUrl,
        text: text.substring(0, 50) + '...',
        sessionId: logger.getSessionId()
      });
      
      const ws = new WebSocket(wsUrl);
      let resolved = false;
      
      ws.onopen = () => {
        logAudioManager('s2s_connected', { sessionId: logger.getSessionId() });
        
        // Send session configuration
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a helpful assistant that reads text aloud.',
            voice: 'alloy',
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
        
        // Send text to speak
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
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'response.audio.delta') {
            // Handle audio streaming
            logAudioManager('s2s_audio_delta', { sessionId: logger.getSessionId() });
          } else if (data.type === 'response.done') {
            logAudioManager('s2s_complete', { sessionId: logger.getSessionId() });
            if (!resolved) {
              resolved = true;
              resolve();
              options.onComplete?.();
              config.onTTSComplete?.();
            }
            ws.close();
          } else if (data.type === 'error') {
            if (!resolved) {
              resolved = true;
              reject(new Error(data.error || 'S2S error'));
            }
            ws.close();
          }
        } catch (error) {
          if (!resolved) {
            resolved = true;
            reject(error);
          }
          ws.close();
        }
      };
      
      ws.onerror = (error) => {
        logAudioManager('s2s_ws_error', {
          error: 'WebSocket error',
          sessionId: logger.getSessionId()
        });
        if (!resolved) {
          resolved = true;
          reject(new Error('S2S WebSocket connection failed'));
        }
      };
      
      ws.onclose = () => {
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