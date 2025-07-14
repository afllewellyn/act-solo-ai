import { useEffect, useState } from 'react';
import { useTTS } from '@/hooks/useTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useToast } from '@/hooks/use-toast';
import { RehearsalModeProps } from './rehearsal/types';
import { getScriptLines } from './rehearsal/scriptParser';
import { extractFormattedText } from './rehearsal/textUtils';

/**
 * useRehearsalMode Hook
 * 
 * Manages interactive script rehearsal with AI. Coordinates between AI speaking
 * its assigned lines and waiting for the actor to speak their lines. Uses speech
 * recognition to detect when the actor finishes speaking before continuing.
 * 
 * Flow: AI speaks → waits for actor → detects actor's voice → continues to next AI line
 * Requires microphone access and handles timeouts/errors gracefully.
 */
export const useRehearsalMode = ({
  scriptContent,
  characters,
  selectedVoice,
  playbackSpeed,
  textFilter,
  isActive,
  onComplete,
  onStop,
}: RehearsalModeProps) => {
  const { toast } = useToast();
  const { speak, stop: stopTTS } = useTTS();
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [waitingForActor, setWaitingForActor] = useState(false);
  const [listeningTimeout, setListeningTimeout] = useState<NodeJS.Timeout | null>(null);

  // Initialize speech recognition
  const { isSupported, startListening, stopListening } = useSpeechRecognition({
    onWordMatch: (matchedWord) => {
      console.log('Voice match detected:', matchedWord);
      if (!isActive) {
        console.log('Rehearsal not active - ignoring voice match');
        return;
      }
      if (waitingForActor) {
        console.log('Actor response detected, continuing rehearsal');
        // Clear the listening timeout
        if (listeningTimeout) {
          clearTimeout(listeningTimeout);
          setListeningTimeout(null);
        }
        // Continue to next line
        setWaitingForActor(false);
        continueRehearsalAfterActorResponse();
      }
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
      toast({
        title: "Voice Recognition Error",
        description: error,
        variant: "destructive",
      });
    }
  });

  const startRehearsalMode = () => {
    if (!scriptContent) return;
    
    setCurrentLineIndex(0);
    setWaitingForActor(false);
    
    // Request microphone access
    if (isSupported) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('Microphone access granted for rehearsal');
          // Start with first line
          playCurrentLine();
        })
        .catch((error) => {
          console.error('Microphone access denied:', error);
          toast({
            title: "Microphone Access Required",
            description: "Please allow microphone access to use rehearsal mode.",
            variant: "destructive",
          });
          onStop();
        });
    }
  };

  const stopRehearsalMode = () => {
    console.log('Stopping rehearsal mode - clearing all operations');
    
    // Immediately set waiting state to false
    setWaitingForActor(false);
    
    // Clear all timeouts
    if (listeningTimeout) {
      clearTimeout(listeningTimeout);
      setListeningTimeout(null);
    }
    
    // Stop all audio/speech operations
    stopListening();
    stopTTS();
    
    // Call parent stop handler
    onStop();
  };

  const advanceToNextLine = () => {
    if (!isActive) return;
    
    setCurrentLineIndex(prevIndex => {
      const newIndex = prevIndex + 1;
      console.log(`Advanced from line ${prevIndex} to line ${newIndex}`);
      
      // Continue to next line after state update
      setTimeout(() => {
        if (isActive) playCurrentLine();
      }, 100);
      
      return newIndex;
    });
  };

  const playCurrentLine = async () => {
    if (!isActive) {
      console.log('Rehearsal not active - stopping playCurrentLine');
      return;
    }

    const lines = getScriptLines(scriptContent, characters, textFilter);
    if (currentLineIndex >= lines.length) {
      // Rehearsal complete
      toast({
        title: "Rehearsal Complete",
        description: "You've finished practicing the script!",
      });
      onComplete();
      return;
    }

    const lineObj = lines[currentLineIndex];
    console.log(`Processing line ${currentLineIndex}: ${lineObj.type} - "${lineObj.dialogue}"`);
    
    if (lineObj.type === 'actor') {
      // Actor line - wait for actor to speak
      console.log(`Waiting for actor line: ${lineObj.dialogue}`);
      setWaitingForActor(true);
      
      // Start listening for actor's words (last 1-2 words)
      const words = lineObj.dialogue.trim().split(/\s+/);
      const lastWords = words.slice(-2).join(' '); // Get last 2 words
      startListening(lastWords);
      
      // Set timeout for fallback (10 seconds)
      const timeout = setTimeout(() => {
        if (!isActive) return; // Check if still active
        console.log('Timeout waiting for actor response - stopping');
        if (listeningTimeout) {
          clearTimeout(listeningTimeout);
          setListeningTimeout(null);
        }
        setWaitingForActor(false);
        stopListening();
        // Don't auto-advance - just stop and wait
      }, 10000);
      setListeningTimeout(timeout);
    } else {
      // AI line - speak it only if rehearsal is still active
      if (!isActive) return;
      
      console.log(`AI speaking: ${lineObj.dialogue}`);
      
      // For bold/italic filters, extract the filtered text to speak
      let textToSpeak = lineObj.dialogue;
      if (textFilter === 'bold') {
        textToSpeak = extractFormattedText(lineObj.content, 'bold');
      } else if (textFilter === 'italic') {
        textToSpeak = extractFormattedText(lineObj.content, 'italic');
      }
      
      if (textToSpeak.trim()) {
        await speak(textToSpeak, {
          voiceId: selectedVoice,
          playbackSpeed: playbackSpeed,
          onComplete: () => {
            if (!isActive) {
              console.log('Rehearsal stopped during TTS - aborting');
              return;
            }
            console.log('AI finished speaking, advancing to next line');
            // Use the helper function to avoid stale closure
            advanceToNextLine();
          }
        });
      } else {
        // Skip empty lines - advance immediately
        console.log('Skipping empty AI line, moving to next');
        advanceToNextLine();
      }
    }
  };

  const continueRehearsalAfterActorResponse = () => {
    if (!isActive) {
      console.log('Rehearsal not active - not continuing after actor response');
      return;
    }
    
    console.log('Actor finished speaking, moving to next line');
    stopListening();
    
    // Use the same advance pattern to avoid stale closures
    advanceToNextLine();
  };

  // Auto-start when activated
  useEffect(() => {
    if (isActive) {
      startRehearsalMode();
    } else {
      stopRehearsalMode();
    }
  }, [isActive]);

  return {
    waitingForActor,
    currentLineIndex,
    stopRehearsalMode,
  };
};