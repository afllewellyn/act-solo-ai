import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TTSOptions {
  voiceId?: string;
  playbackSpeed?: number;
  onWordSpoken?: (wordIndex: number) => void;
  onComplete?: () => void;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextManager = AudioContextManager.getInstance();
  const { toast } = useToast();

  const speak = useCallback(async (text: string, options: TTSOptions = {}) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setNeedsUserGesture(false);
    
    try {
      console.log('[TTS] Starting speech generation for text length:', text.length);
      console.log('[TTS] Using voice ID:', options.voiceId || '9BWtsMINqrJLrRacOk9x');
      console.log('[TTS] Text content:', text.substring(0, 100) + '...');
      console.log('[TTS] User gesture detected:', audioContextManager.hasUserGesture());
      console.log('[TTS] Audio context unlocked:', audioContextManager.isAudioUnlocked());
      
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          text: text.trim(),
          voice_id: options.voiceId || '9BWtsMINqrJLrRacOk9x'
        }
      });

      console.log('[TTS] Supabase response received - data:', !!data, 'error:', error);

      if (error) {
        console.error('[TTS] Supabase function error:', error);
        throw new Error(error.message || 'Failed to invoke TTS function');
      }

      if (data?.error) {
        console.error('[TTS] API error:', data.error);
        throw new Error(data.error);
      }

      if (data?.audioContent) {
        console.log('[TTS] Audio content received, converting to blob');
        
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
          console.log('[TTS] Audio playback started successfully');
          setIsPlaying(true);
          setIsPaused(false);
          setNeedsUserGesture(false);
        };
        audioRef.current.onpause = () => {
          console.log('[TTS] Audio playback paused');
          setIsPlaying(false);
          setIsPaused(true);
        };
        audioRef.current.onended = () => {
          console.log('[TTS] Audio playback completed');
          setIsPlaying(false);
          setIsPaused(false);
          options.onComplete?.();
          URL.revokeObjectURL(audioUrl);
        };
        audioRef.current.onerror = (e) => {
          console.error('[TTS] Audio playback error:', e);
          setIsPlaying(false);
          setIsPaused(false);
          URL.revokeObjectURL(audioUrl);
        };
        
        // Attempt to play audio with autoplay policy handling
        try {
          await audioRef.current.play();
          console.log('[TTS] Audio play() succeeded');
        } catch (playError: any) {
          console.error('[TTS] Audio play() failed:', playError);
          
          if (playError.name === 'NotAllowedError') {
            console.warn('[TTS] Autoplay blocked - user gesture required');
            setNeedsUserGesture(true);
            
            // Show user-friendly toast for Safari/strict autoplay policies
            toast({
              title: "Audio Blocked",
              description: "Click the play button to enable audio playback",
              variant: "default",
            });
          } else {
            throw playError; // Re-throw other errors
          }
        }
      } else {
        throw new Error('No audio content received from TTS service');
      }
    } catch (error: any) {
      console.error('[TTS] Error:', error);
      
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
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, toast, audioContextManager]);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      console.log('[TTS] Pausing audio');
      audioRef.current.pause();
    }
  }, []);

  const resume = useCallback(async () => {
    if (audioRef.current && audioRef.current.paused) {
      console.log('[TTS] Resuming audio');
      try {
        // Mark as user gesture for autoplay policy compliance
        audioContextManager.setUserGesture();
        await audioRef.current.play();
        setNeedsUserGesture(false);
      } catch (error: any) {
        console.error('[TTS] Resume failed:', error);
        if (error.name === 'NotAllowedError') {
          setNeedsUserGesture(true);
        }
      }
    }
  }, [audioContextManager]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      console.log('[TTS] Stopping audio');
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setIsPaused(false);
      setNeedsUserGesture(false);
    }
  }, []);

  // Add function to enable audio after user gesture
  const enableAudio = useCallback(async () => {
    audioContextManager.setUserGesture();
    await audioContextManager.unlockAudioContext();
    
    // If we have pending audio and user just clicked, try to play it
    if (audioRef.current && needsUserGesture) {
      try {
        await audioRef.current.play();
        setNeedsUserGesture(false);
      } catch (error) {
        console.error('[TTS] Failed to play after user gesture:', error);
      }
    }
  }, [audioContextManager, needsUserGesture]);

  return {
    speak,
    pause,
    resume,
    stop,
    enableAudio,
    isPlaying,
    isLoading,
    isPaused,
    needsUserGesture
  };
};