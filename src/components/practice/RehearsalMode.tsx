import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTTS } from '@/hooks/useTTS';
import { getScriptLines } from './rehearsal/scriptParser';

interface RehearsalModeProps {
  scriptContent: string;
  characters: Character[];
  selectedVoice: string;
  playbackSpeed: number;
  textFilter: TextFilter;
  isActive: boolean;
  onComplete: () => void;
  onStop: () => void;
  onStateChange?: (state: RehearsalState) => void;
  onCueWordsChange?: (cueWords: string[]) => void;
}

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

type TextFilter = 'all' | 'bold' | 'italic';
type RehearsalState = 'IDLE' | 'WAITING_FOR_ACTOR_CUE' | 'AI_SPEAKING' | 'TRANSITIONING';

export const useRehearsalMode = (props: RehearsalModeProps) => {
  const { 
    scriptContent, 
    characters, 
    selectedVoice, 
    playbackSpeed, 
    textFilter, 
    isActive, 
    onComplete, 
    onStop,
    onStateChange,
    onCueWordsChange
  } = props;

  // State management
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [rehearsalState, setRehearsalState] = useState<RehearsalState>('IDLE');
  const [currentCueWords, setCurrentCueWords] = useState<string[]>([]);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopRef = useRef(false); // Immediate stop flag

  // Initialize speech recognition with enhanced cue detection
  const { isListening, startListeningForCue, stopListening } = useSpeechRecognition({
    onCueDetected: (detectedCue: string) => {
      console.log('🎭 Actor cue detected:', detectedCue);
      if (!stopRef.current) {
        handleActorCueDetected();
      }
    },
    onError: (error: any) => {
      console.error('Speech recognition error in rehearsal:', error);
    }
  });

  // Initialize TTS directly for more control
  const { speak, stop: stopTTS, isPlaying: isTTSPlaying } = useTTS();

  // Update parent with state changes
  useEffect(() => {
    onStateChange?.(rehearsalState);
  }, [rehearsalState, onStateChange]);

  useEffect(() => {
    onCueWordsChange?.(currentCueWords);
  }, [currentCueWords, onCueWordsChange]);

  const startRehearsalMode = async () => {
    if (!scriptContent || !characters) {
      console.log('Missing script content or characters');
      return;
    }

    console.log('🎭 Starting rehearsal mode');
    stopRef.current = false;
    setCurrentLineIndex(0);
    setRehearsalState('TRANSITIONING');
    setCurrentCueWords([]);
    
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('🎤 Microphone access granted');
      
      // Start the rehearsal flow
      await processCurrentLine();
    } catch (error) {
      console.error('Failed to access microphone:', error);
      setRehearsalState('IDLE');
    }
  };

  const stopRehearsalMode = () => {
    console.log('🛑 Emergency stop - halting all rehearsal operations');
    
    // Set immediate stop flag
    stopRef.current = true;
    
    // Clear all timeouts
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
    
    // Stop all audio and recognition immediately
    stopTTS();
    stopListening();
    
    // Reset all state
    setCurrentLineIndex(0);
    setRehearsalState('IDLE');
    setCurrentCueWords([]);
    
    // Notify parent
    onStop();
  };

  // Core rehearsal processing logic
  const processCurrentLine = useCallback(async () => {
    if (!isActive || stopRef.current) {
      console.log('❌ Rehearsal not active or stopped');
      return;
    }

    const lines = getScriptLines(scriptContent, textFilter);
    
    if (currentLineIndex >= lines.length) {
      console.log('🎯 Rehearsal complete!');
      setRehearsalState('IDLE');
      onComplete();
      return;
    }

    const currentLine = lines[currentLineIndex];
    console.log(`📝 Processing line ${currentLineIndex}: ${currentLine.type} - "${currentLine.content.substring(0, 50)}..."`);

    if (currentLine.type === 'actor') {
      // Actor's turn - extract cue words and start listening
      console.log('👤 Actor line detected - extracting cue words');
      
      const cueWords = extractCueWordsFromLine(currentLine.content);
      setCurrentCueWords(cueWords);
      setRehearsalState('WAITING_FOR_ACTOR_CUE');
      
      if (cueWords.length > 0) {
        console.log(`🎤 Listening for cue words: ${cueWords.join(', ')}`);
        startListeningForCue(currentLine.content);
        
        // Set timeout for actor response
        listeningTimeoutRef.current = setTimeout(() => {
          if (!stopRef.current) {
            console.log('⏰ Actor timeout - auto-advancing');
            handleActorTimeout();
          }
        }, 15000);
      } else {
        console.log('⚠️ No cue words found, auto-advancing');
        setTimeout(() => advanceToNextLine(), 1000);
      }
      
    } else if (currentLine.type === 'ai') {
      // AI's turn - speak the line
      console.log('🤖 AI speaking line...');
      setRehearsalState('AI_SPEAKING');
      setCurrentCueWords([]);
      
      if (currentLine.content && currentLine.content.trim()) {
        // Extract just the dialogue text for TTS
        const textToSpeak = currentLine.dialogue || currentLine.content.replace(/<[^>]*>/g, '').trim();
        
        speak(textToSpeak, {
          voiceId: selectedVoice,
          playbackSpeed: playbackSpeed,
          onComplete: () => {
            if (!stopRef.current && isActive) {
              console.log('✅ AI finished speaking, advancing to next line');
              advanceToNextLine();
            }
          }
        });
      } else {
        // Skip empty lines
        console.log('Skipping empty AI line');
        advanceToNextLine();
      }
    }
  }, [isActive, currentLineIndex, scriptContent, characters, textFilter, startListeningForCue, speak, selectedVoice, playbackSpeed]);

  // Extract meaningful cue words from actor line
  const extractCueWordsFromLine = (lineText: string): string[] => {
    if (!lineText) return [];
    
    // Remove character name and clean text
    const cleanText = lineText
      .replace(/^[A-Z][A-Z\s\-\'\.]+:\s*/, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanText.split(' ').filter(word => word.length > 1);
    const fillerWords = ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as'];
    const meaningfulWords = words.filter(word => 
      !fillerWords.includes(word.toLowerCase()) && word.length > 2
    );
    
    if (meaningfulWords.length >= 2) {
      return [meaningfulWords.slice(-2).join(' ')]; // Last 2 meaningful words
    } else if (meaningfulWords.length === 1) {
      return [meaningfulWords[0]]; // Last meaningful word
    } else {
      return words.slice(-2); // Fallback to last words
    }
  };

  // Handle when actor cue is detected
  const handleActorCueDetected = useCallback(() => {
    if (stopRef.current) return;
    
    console.log('🎭 Actor cue detected - advancing to next line');
    stopListening();
    
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
    
    advanceToNextLine();
  }, []);

  // Handle actor timeout
  const handleActorTimeout = useCallback(() => {
    if (stopRef.current) return;
    
    console.log('⏰ Actor timeout - auto-advancing');
    stopListening();
    setCurrentCueWords([]);
    advanceToNextLine();
  }, []);

  // Advance to next line
  const advanceToNextLine = useCallback(() => {
    if (stopRef.current) return;
    
    setCurrentLineIndex(prev => {
      const newIndex = prev + 1;
      console.log(`⏭️ Advanced from line ${prev} to line ${newIndex}`);
      return newIndex;
    });
    
    setRehearsalState('TRANSITIONING');
    
    // Process next line after state update
    setTimeout(() => {
      if (!stopRef.current && isActive) {
        processCurrentLine();
      }
    }, 200);
  }, [isActive, processCurrentLine]);

  // Auto-start when activated
  useEffect(() => {
    if (isActive) {
      startRehearsalMode();
    } else {
      stopRehearsalMode();
    }
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current = true;
      stopTTS();
      stopListening();
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  return {
    currentLineIndex,
    waitingForActor: rehearsalState === 'WAITING_FOR_ACTOR_CUE',
    rehearsalState,
    currentCueWords,
    stopRehearsalMode,
  };
};