import { useTTS } from '@/hooks/useTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

/**
 * Audio Manager
 * 
 * Unified interface for managing both TTS (text-to-speech) and speech recognition.
 * Handles coordination between audio input/output and provides clean callbacks.
 */
export interface AudioManagerConfig {
  // TTS Configuration
  defaultVoiceId?: string;
  defaultPlaybackSpeed?: number;
  
  // Speech Recognition Configuration
  language?: string;
  
  // Event Callbacks
  onTTSComplete?: () => void;
  onTTSError?: (error: string) => void;
  onCueDetected?: (cue: string) => void;
  onSpeechError?: (error: string) => void;
}

export interface AudioManagerReturn {
  // TTS Controls
  speakText: (text: string, options?: TTSSpeakOptions) => Promise<void>;
  pauseTTS: () => void;
  resumeTTS: () => void;
  stopTTS: () => void;
  enableAudio: () => Promise<void>;
  isTTSPlaying: boolean;
  isTTSPaused: boolean;
  needsUserGesture: boolean;
  
  // Speech Recognition Controls
  startListeningForCue: (targetText: string) => void;
  stopListening: () => void;
  isListening: boolean;
  isSpeechSupported: boolean;
  
  // Master Controls
  stopAll: () => void;
}

export interface TTSSpeakOptions {
  voiceId?: string;
  playbackSpeed?: number;
  onComplete?: () => void;
}

/**
 * Custom hook that provides unified audio management
 */
export function useAudioManager(config: AudioManagerConfig = {}): AudioManagerReturn {
  // Initialize TTS
  const {
    speak,
    pause: pauseTTS,
    resume: resumeTTS,
    stop: stopTTS,
    enableAudio,
    isPlaying: isTTSPlaying,
    isPaused: isTTSPaused,
    needsUserGesture
  } = useTTS();

  // Initialize Speech Recognition
  const {
    isListening,
    isSupported: isSpeechSupported,
    startListeningForCue,
    stopListening
  } = useSpeechRecognition({
    onCueDetected: (detectedCue: string) => {
      console.log('🎤 AudioManager: Cue detected:', detectedCue);
      config.onCueDetected?.(detectedCue);
    },
    onError: (error: any) => {
      console.error('🎤 AudioManager: Speech error:', error);
      config.onSpeechError?.(error);
    },
    language: config.language || 'en-US'
  });

  /**
   * Speak text with TTS
   */
  const speakText = async (text: string, options: TTSSpeakOptions = {}): Promise<void> => {
    const {
      voiceId = config.defaultVoiceId || '9BWtsMINqrJLrRacOk9x',
      playbackSpeed = config.defaultPlaybackSpeed || 1,
      onComplete
    } = options;

    try {
      console.log('🔊 AudioManager: Starting TTS for text length:', text.length);
      
      await speak(text, {
        voiceId,
        playbackSpeed,
        onComplete: () => {
          console.log('🔊 AudioManager: TTS completed');
          onComplete?.();
          config.onTTSComplete?.();
        }
      });
    } catch (error) {
      console.error('🔊 AudioManager: TTS error:', error);
      config.onTTSError?.(error instanceof Error ? error.message : 'TTS failed');
      throw error;
    }
  };

  /**
   * Stop all audio operations
   */
  const stopAll = (): void => {
    console.log('🛑 AudioManager: Stopping all audio operations');
    stopTTS();
    stopListening();
  };

  return {
    // TTS Controls
    speakText,
    pauseTTS,
    resumeTTS,
    stopTTS,
    enableAudio,
    isTTSPlaying,
    isTTSPaused,
    needsUserGesture,
    
    // Speech Recognition Controls
    startListeningForCue,
    stopListening,
    isListening,
    isSpeechSupported,
    
    // Master Controls
    stopAll
  };
}