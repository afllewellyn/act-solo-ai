import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger, logTTS, logClientTiming, generateRequestId } from '@/lib/logger';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { getStreamingAudioManager } from '@/services/StreamingAudioManager';

interface TTSOptions {
  voiceId?: string;
  playbackSpeed?: number;
  onWordSpoken?: (wordIndex: number) => void;
  onComplete?: () => void;
  engine?: 'webspeech' | 's2s';
  lineIdx?: number;
  requestId?: string;
  useStreaming?: boolean;
}

// Audio context manager for autoplay policy compliance
class AudioContextManager {
  private static instance: AudioContextManager;
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;
  private userGestureDetected = false;

  static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  async unlockAudioContext(): Promise<void> {
    if (this.isUnlocked) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.isUnlocked = true;
      console.log('[TTS AudioContext] Audio context unlocked successfully');
    } catch (error) {
      console.error('[TTS AudioContext] Failed to unlock audio context:', error);
    }
  }

  setUserGesture(): void {
    this.userGestureDetected = true;
    this.unlockAudioContext();
  }

  hasUserGesture(): boolean {
    return this.userGestureDetected;
  }

  isAudioUnlocked(): boolean {
    return this.isUnlocked && this.audioContext?.state === 'running';
  }
}

export const useTTS = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [showTapToResume, setShowTapToResume] = useState(false);
  
  // Streaming-specific state
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamingManagerRef = useRef<any>(null);
  const isUsingStreamingRef = useRef(false);
  const audioContextManager = AudioContextManager.getInstance();
  const { toast } = useToast();
  const currentRequestIdRef = useRef<string | null>(null);
  const currentEngineRef = useRef<'webspeech' | 's2s'>('webspeech');
  const currentLineIdxRef = useRef<number | undefined>(undefined);

  // Phase 1 - Visibility change handling for mobile "Tap to resume audio" UX
  useEffect(() => {
    if (!isFeatureEnabled('mobile_audio_optimization')) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - pause TTS if playing
        if (isPlaying && audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          logTTS('visibility_paused', { 
            reason: 'page_hidden',
            sessionId: logger.getSessionId() 
          });
        }
      } else {
        // Page is visible again - show tap to resume if needed
        if (isPaused && audioRef.current) {
          setShowTapToResume(true);
          logTTS('visibility_resumed', { 
            showTapToResume: true,
            sessionId: logger.getSessionId() 
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, isPaused]);

  const handleSpeechError = useCallback(async (error: any) => {
    logTTS('error', { 
      error: error.message, 
      name: error.name,
      sessionId: logger.getSessionId() 
    });
    
    let errorMessage = 'Failed to generate speech. Please try again.';
    
    if (error.message?.includes('Rate limit')) {
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message?.includes('Invalid API key')) {
      errorMessage = 'TTS service not properly configured. Please contact support.';
    } else if (error.message?.includes('Too long')) {
      errorMessage = 'Text is too long for speech generation. Please shorten it.';
    } else if (error.name === 'NotAllowedError') {
      // Don't show error toast for autoplay policy - we handle this above
      return;
    }
    
    toast({
      title: "Text-to-Speech Error",
      description: errorMessage,
      variant: "destructive",
    });
  }, [toast]);

  const handleStreamingSpeech = useCallback(async (text: string, options: TTSOptions) => {
    setIsStreaming(true);
    setIsBuffering(true);
    setStreamProgress(0);
    
    try {
      // Ensure audio context is unlocked
      await audioContextManager.unlockAudioContext();
      
      const streamingManager = getStreamingAudioManager();
      streamingManagerRef.current = streamingManager;
      
      await streamingManager.startStreaming(text, {
        voiceId: options.voiceId || '9BWtsMINqrJLrRacOk9x',
        model: 'eleven_turbo_v2_5',
        onChunkReceived: (chunkIndex: number, totalExpected?: number) => {
          if (totalExpected) {
            setStreamProgress((chunkIndex / totalExpected) * 100);
          }
          // First chunk starts playback
          if (chunkIndex === 0) {
            setIsBuffering(false);
            setIsPlaying(true);
            setIsPaused(false);
            logTTS('streaming_playback_started', { sessionId: logger.getSessionId() });
          }
        },
        onStreamComplete: () => {
          setIsPlaying(false);
          setIsPaused(false);
          setIsStreaming(false);
          setStreamProgress(100);
          logTTS('streaming_playback_completed', { sessionId: logger.getSessionId() });
          options.onComplete?.();
        },
        onError: (error: Error) => {
          logTTS('streaming_error', { 
            error: error.message,
            sessionId: logger.getSessionId() 
          });
          throw error;
        }
      });
    } catch (error: any) {
      // Fallback to non-streaming if streaming fails
      if (isFeatureEnabled('auto_fallback_enabled')) {
        logTTS('streaming_fallback_to_regular', { 
          error: error.message,
          sessionId: logger.getSessionId() 
        });
        setIsStreaming(false);
        setIsBuffering(false);
        await handleNonStreamingSpeech(text, options);
      } else {
        throw error;
      }
    }
  }, [audioContextManager]);

  const handleNonStreamingSpeech = useCallback(async (text: string, options: TTSOptions) => {
    const tRequestStart = performance.now();

    const { data, error } = await supabase.functions.invoke('text-to-speech', {
      body: {
        text: text.trim(),
        voice_id: options.voiceId || '9BWtsMINqrJLrRacOk9x',
        request_id: currentRequestIdRef.current,
        line_idx: currentLineIdxRef.current
      }
    });

    logTTS('supabase_response', { 
      hasData: !!data, 
      hasError: !!error,
      sessionId: logger.getSessionId() 
    });

    if (error) {
      throw new Error(error.message || 'Failed to invoke TTS function');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (data?.audioContent) {
      logTTS('audio_content_received', { sessionId: logger.getSessionId() });
      // Emit end-to-first-byte latency (client-perceived)
      logClientTiming('latency_ms_endToFirstByte', {
        engine: currentEngineRef.current,
        requestId: currentRequestIdRef.current || undefined,
        lineIdx: currentLineIdxRef.current,
        latency_ms_endToFirstByte: Math.round(performance.now() - tRequestStart),
      });
      
      // Ensure audio context is unlocked before playing
      await audioContextManager.unlockAudioContext();
      
      // Convert base64 to audio
      const audioBlob = new Blob(
        [Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      
      audioRef.current = new Audio(audioUrl);
      
      // Set playback speed if specified
      if (options.playbackSpeed && options.playbackSpeed !== 1) {
        audioRef.current.playbackRate = options.playbackSpeed;
      }
      
      audioRef.current.onplay = () => {
        logTTS('playback_started', { sessionId: logger.getSessionId() });
        logClientTiming('play_start', {
          engine: currentEngineRef.current,
          requestId: currentRequestIdRef.current || undefined,
          lineIdx: currentLineIdxRef.current,
          t_play_start: performance.now(),
        });
        setIsPlaying(true);
        setIsPaused(false);
        setNeedsUserGesture(false);
        setShowTapToResume(false);
      };
      audioRef.current.onpause = () => {
        logTTS('playback_paused', { sessionId: logger.getSessionId() });
        setIsPlaying(false);
        setIsPaused(true);
      };
      audioRef.current.onended = () => {
        logTTS('playback_completed', { sessionId: logger.getSessionId() });
        logClientTiming('silence_complete', {
          engine: currentEngineRef.current,
          requestId: currentRequestIdRef.current || undefined,
          lineIdx: currentLineIdxRef.current,
          t_silence_complete: performance.now(),
        });
        setIsPlaying(false);
        setIsPaused(false);
        setShowTapToResume(false);
        options.onComplete?.();
        URL.revokeObjectURL(audioUrl);
      };
      audioRef.current.onerror = (e) => {
        logTTS('playback_error', { error: e, sessionId: logger.getSessionId() });
        setIsPlaying(false);
        setIsPaused(false);
        setShowTapToResume(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      // Attempt to play audio with enhanced autoplay policy handling
      try {
        await audioRef.current.play();
        logTTS('play_succeeded', { sessionId: logger.getSessionId() });
      } catch (playError: any) {
        logTTS('play_failed', { 
          error: playError.name, 
          message: playError.message,
          sessionId: logger.getSessionId() 
        });
        
        if (playError.name === 'NotAllowedError') {
          setNeedsUserGesture(true);
          if (isFeatureEnabled('mobile_audio_optimization')) {
            setShowTapToResume(true);
          }
          
          // Enhanced user feedback for autoplay restrictions
          toast({
            title: "Audio Requires Interaction",
            description: isFeatureEnabled('mobile_audio_optimization') ? 
              "Tap the audio button to enable playback" : 
              "Click the play button to enable audio playback",
            variant: "default",
          });
        } else {
          throw playError; // Re-throw other errors
        }
      }
    } else {
      throw new Error('No audio content received from TTS service');
    }
  }, [audioContextManager, toast]);

  const speak = useCallback(async (text: string, options: TTSOptions = {}) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setNeedsUserGesture(false);
    setShowTapToResume(false);
    
    try {
      const engine = options.engine || 'webspeech';
      const requestId = options.requestId || generateRequestId();
      const lineIdx = options.lineIdx;
      currentEngineRef.current = engine;
      currentRequestIdRef.current = requestId;
      currentLineIdxRef.current = lineIdx;
      
      // Determine if we should use streaming
      const shouldUseStreaming = isFeatureEnabled('tts_streaming_enabled') && options.useStreaming;
      isUsingStreamingRef.current = shouldUseStreaming;
      
      logClientTiming('speak_requested', { 
        engine, 
        requestId, 
        lineIdx, 
        streaming: shouldUseStreaming 
      });
      
      logTTS('speech_generation_started', {
        textLength: text.length,
        voiceId: options.voiceId || '9BWtsMINqrJLrRacOk9x',
        textPreview: text.substring(0, 100),
        hasUserGesture: audioContextManager.hasUserGesture(),
        audioUnlocked: audioContextManager.isAudioUnlocked(),
        streaming: shouldUseStreaming,
        sessionId: logger.getSessionId()
      });

      if (shouldUseStreaming) {
        await handleStreamingSpeech(text, options);
      } else {
        await handleNonStreamingSpeech(text, options);
      }
    } catch (error: any) {
      await handleSpeechError(error);
    } finally {
      setIsLoading(false);
      setIsBuffering(false);
      setIsStreaming(false);
    }
  }, [isLoading, toast, audioContextManager, handleStreamingSpeech, handleNonStreamingSpeech, handleSpeechError]);

  const pause = useCallback(() => {
    if (isUsingStreamingRef.current && streamingManagerRef.current) {
      // Pause streaming audio
      streamingManagerRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
      logTTS('streaming_pause_called', { sessionId: logger.getSessionId() });
    } else if (audioRef.current && !audioRef.current.paused) {
      // Pause regular audio
      logTTS('pause_called', { sessionId: logger.getSessionId() });
      audioRef.current.pause();
    }
  }, []);

  const resume = useCallback(async () => {
    if (isUsingStreamingRef.current && streamingManagerRef.current) {
      // Resume streaming audio
      try {
        audioContextManager.setUserGesture();
        await streamingManagerRef.current.resume();
        setIsPlaying(true);
        setIsPaused(false);
        setNeedsUserGesture(false);
        setShowTapToResume(false);
        logTTS('streaming_resume_called', { sessionId: logger.getSessionId() });
      } catch (error: any) {
        logTTS('streaming_resume_failed', { 
          error: error.name,
          sessionId: logger.getSessionId() 
        });
        if (error.name === 'NotAllowedError') {
          setNeedsUserGesture(true);
          if (isFeatureEnabled('mobile_audio_optimization')) {
            setShowTapToResume(true);
          }
        }
      }
    } else if (audioRef.current && audioRef.current.paused) {
      // Resume regular audio
      logTTS('resume_called', { sessionId: logger.getSessionId() });
      try {
        audioContextManager.setUserGesture();
        await audioRef.current.play();
        setNeedsUserGesture(false);
        setShowTapToResume(false);
      } catch (error: any) {
        logTTS('resume_failed', { 
          error: error.name,
          sessionId: logger.getSessionId() 
        });
        if (error.name === 'NotAllowedError') {
          setNeedsUserGesture(true);
          if (isFeatureEnabled('mobile_audio_optimization')) {
            setShowTapToResume(true);
          }
        }
      }
    }
  }, [audioContextManager]);

  const stop = useCallback(() => {
    if (isUsingStreamingRef.current && streamingManagerRef.current) {
      // Stop streaming audio
      logTTS('streaming_stop_called', { sessionId: logger.getSessionId() });
      const tCut = performance.now();
      logClientTiming('cut_event', {
        engine: currentEngineRef.current,
        requestId: currentRequestIdRef.current || undefined,
        lineIdx: currentLineIdxRef.current,
        t_cut_event: tCut,
      });

      streamingManagerRef.current.stop();
      
      // Emit cut_to_silence_ms (time from cut to silence achieved)
      logClientTiming('cut_to_silence_ms', {
        engine: currentEngineRef.current,
        requestId: currentRequestIdRef.current || undefined,
        lineIdx: currentLineIdxRef.current,
        cut_to_silence_ms: Math.round(performance.now() - tCut),
      });

      setIsPlaying(false);
      setIsPaused(false);
      setIsStreaming(false);
      setIsBuffering(false);
      setStreamProgress(0);
      setNeedsUserGesture(false);
      setShowTapToResume(false);
    } else if (audioRef.current) {
      // Stop regular audio
      logTTS('stop_called', { sessionId: logger.getSessionId() });
      const tCut = performance.now();
      logClientTiming('cut_event', {
        engine: currentEngineRef.current,
        requestId: currentRequestIdRef.current || undefined,
        lineIdx: currentLineIdxRef.current,
        t_cut_event: tCut,
      });

      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      // Emit cut_to_silence_ms (time from cut to silence achieved)
      logClientTiming('cut_to_silence_ms', {
        engine: currentEngineRef.current,
        requestId: currentRequestIdRef.current || undefined,
        lineIdx: currentLineIdxRef.current,
        cut_to_silence_ms: Math.round(performance.now() - tCut),
      });

      setIsPlaying(false);
      setIsPaused(false);
      setNeedsUserGesture(false);
      setShowTapToResume(false);
    }
  }, []);

  // Enhanced function to enable audio after user gesture
  const enableAudio = useCallback(async () => {
    audioContextManager.setUserGesture();
    await audioContextManager.unlockAudioContext();
    
    logTTS('audio_enabled', { 
      hadPendingAudio: needsUserGesture,
      isStreaming: isUsingStreamingRef.current,
      sessionId: logger.getSessionId() 
    });
    
    // If we have pending audio and user just clicked, try to play it
    if (needsUserGesture || showTapToResume) {
      try {
        if (isUsingStreamingRef.current && streamingManagerRef.current) {
          await streamingManagerRef.current.resume();
        } else if (audioRef.current) {
          await audioRef.current.play();
        }
        setNeedsUserGesture(false);
        setShowTapToResume(false);
      } catch (error) {
        logTTS('enable_audio_failed', { 
          error: error,
          sessionId: logger.getSessionId() 
        });
      }
    }
  }, [audioContextManager, needsUserGesture, showTapToResume]);

  return {
    speak,
    pause,
    resume,
    stop,
    enableAudio,
    isPlaying,
    isLoading,
    isPaused,
    needsUserGesture,
    showTapToResume,
    // Streaming-specific state
    isBuffering,
    streamProgress,
    isStreaming
  };
};