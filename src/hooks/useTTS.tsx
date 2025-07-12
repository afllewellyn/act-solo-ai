import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TTSOptions {
  voiceId?: string;
  onWordSpoken?: (wordIndex: number) => void;
  onComplete?: () => void;
}

export const useTTS = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const speak = useCallback(async (text: string, options: TTSOptions = {}) => {
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      console.log('TTS: Starting speech generation for text length:', text.length);
      console.log('TTS: Using voice ID:', options.voiceId || '9BWtsMINqrJLrRacOk9x');
      console.log('TTS: Text content:', text.substring(0, 100) + '...');
      
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          text: text.trim(),
          voice_id: options.voiceId || '9BWtsMINqrJLrRacOk9x'
        }
      });

      console.log('TTS: Supabase response received - data:', data, 'error:', error);

      if (error) {
        console.error('TTS: Supabase function error:', error);
        throw new Error(error.message || 'Failed to invoke TTS function');
      }

      if (data?.error) {
        console.error('TTS: API error:', data.error);
        throw new Error(data.error);
      }

      if (data?.audioContent) {
        console.log('TTS: Audio content received, converting to blob');
        
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
        audioRef.current.onplay = () => {
          console.log('TTS: Audio playback started');
          setIsPlaying(true);
        };
        audioRef.current.onpause = () => setIsPlaying(false);
        audioRef.current.onended = () => {
          console.log('TTS: Audio playback completed');
          setIsPlaying(false);
          options.onComplete?.();
          URL.revokeObjectURL(audioUrl);
        };
        audioRef.current.onerror = (e) => {
          console.error('TTS: Audio playback error:', e);
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
        };
        
        await audioRef.current.play();
      } else {
        throw new Error('No audio content received from TTS service');
      }
    } catch (error) {
      console.error('TTS Error:', error);
      
      let errorMessage = 'Failed to generate speech. Please try again.';
      
      if (error.message?.includes('Rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (error.message?.includes('Invalid API key')) {
        errorMessage = 'TTS service not properly configured. Please contact support.';
      } else if (error.message?.includes('Too long')) {
        errorMessage = 'Text is too long for speech generation. Please shorten it.';
      }
      
      toast({
        title: "Text-to-Speech Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, toast]);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play();
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  return {
    speak,
    pause,
    resume,
    stop,
    isPlaying,
    isLoading
  };
};