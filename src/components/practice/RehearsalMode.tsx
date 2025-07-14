import { useEffect, useState } from 'react';
import { useTTS } from '@/hooks/useTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useToast } from '@/hooks/use-toast';

/**
 * Character data structure for script roles
 */
interface Character {
  name: string; // Character name (must match script format: "NAME:")
  voice: string; // Assigned ElevenLabs voice ID for this character
  isUserRole: boolean; // Whether this character is played by the user (not AI)
}

/**
 * Props for RehearsalMode hook
 * Manages interactive back-and-forth script rehearsal with voice recognition
 */
/**
 * Text filter options for selective script reading
 */
type TextFilter = 'all' | 'bold' | 'italic' | 'characters';

interface RehearsalModeProps {
  scriptContent: string; // Full script content with HTML formatting
  characters: Character[]; // Character assignments for voice roles
  selectedVoice: string; // Default ElevenLabs voice for AI lines
  playbackSpeed: number; // TTS playback speed (0.5x - 2x)
  textFilter: TextFilter; // Which parts of the script to read aloud
  isActive: boolean; // Whether rehearsal mode is currently active
  onComplete: () => void; // Callback when script rehearsal is finished
  onStop: () => void; // Callback when rehearsal is stopped/cancelled
}

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
      if (isActive && waitingForActor) {
        // Clear the listening timeout
        if (listeningTimeout) {
          clearTimeout(listeningTimeout);
          setListeningTimeout(null);
        }
        // Continue to next AI line
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

  // Function to strip HTML tags and clean text for TTS
  const stripHtmlTags = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    let cleanText = tempDiv.textContent || tempDiv.innerText || '';
    cleanText = cleanText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    return cleanText;
  };

  // Extract formatted text (bold or italic)
  const extractFormattedText = (content: string, format: 'bold' | 'italic'): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    const selector = format === 'bold' ? 'b, strong' : 'i, em';
    const elements = tempDiv.querySelectorAll(selector);
    
    if (elements.length === 0) {
      return '';
    }
    
    return Array.from(elements)
      .map(element => element.textContent || '')
      .filter(text => text.trim().length > 0)
      .join(' ')
      .trim();
  };

  // Parse script lines for rehearsal mode with text filtering
  const getScriptLines = () => {
    if (!scriptContent) return [];
    
    const allLines = scriptContent.split('\n').filter(line => {
      const cleanLine = stripHtmlTags(line).trim();
      return cleanLine.length > 0;
    });
    
    // For rehearsal mode, we need to preserve the actor/AI sequence
    // But only include AI lines that match the text filter
    return allLines.map(line => {
      const cleanLine = stripHtmlTags(line).trim();
      
      // Check if this is a character line
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const character = characters.find(c => c.name === characterName);
        
        if (character && character.isUserRole) {
          // This is an actor line - always include it
          return { type: 'actor', content: line, dialogue: characterMatch[2].trim() };
        } else {
          // This is an AI line - check if it should be included based on filter
          const shouldInclude = checkLineMatchesFilter(line);
          return shouldInclude ? { type: 'ai', content: line, dialogue: characterMatch[2].trim() } : null;
        }
      } else {
        // Non-character line (stage direction, etc.) - check if it should be included
        const shouldInclude = checkLineMatchesFilter(line);
        return shouldInclude ? { type: 'ai', content: line, dialogue: cleanLine } : null;
      }
    }).filter(Boolean) as Array<{ type: 'actor' | 'ai'; content: string; dialogue: string }>; // Remove null entries
  };
  
  // Helper function to check if a line matches the current text filter
  const checkLineMatchesFilter = (line: string): boolean => {
    switch (textFilter) {
      case 'bold':
        return extractFormattedText(line, 'bold').length > 0;
      case 'italic':
        return extractFormattedText(line, 'italic').length > 0;
      case 'characters':
        // For characters filter, only include AI character lines
        const cleanLine = stripHtmlTags(line).trim();
        const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
        if (characterMatch) {
          const characterName = characterMatch[1].trim();
          const character = characters.find(c => c.name === characterName);
          return !character || !character.isUserRole; // Only AI characters
        }
        return false;
      case 'all':
      default:
        return true; // Include all lines
    }
  };

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
    setWaitingForActor(false);
    if (listeningTimeout) {
      clearTimeout(listeningTimeout);
      setListeningTimeout(null);
    }
    stopListening();
    stopTTS();
    onStop();
  };

  const playCurrentLine = async () => {
    if (!isActive) return; // Stop if rehearsal is not active

    const lines = getScriptLines();
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
            if (!isActive) return; // Check if still active after speaking
            // After AI finishes speaking, move to next line and wait for actor input
            setCurrentLineIndex(prev => prev + 1);
            // Don't automatically continue - wait for next actor response
            setTimeout(() => {
              if (isActive) playCurrentLine();
            }, 500);
          }
        });
      } else {
        // Skip empty lines
        setCurrentLineIndex(prev => prev + 1);
        setTimeout(() => {
          if (isActive) playCurrentLine();
        }, 100);
      }
    }
  };

  const continueRehearsalAfterActorResponse = () => {
    if (!isActive) return; // Only continue if rehearsal is still active
    
    // Move to next line after actor response
    setCurrentLineIndex(prev => prev + 1);
    stopListening();
    
    // Continue with next line
    setTimeout(() => {
      if (isActive) playCurrentLine();
    }, 500);
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