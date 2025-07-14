import { useEffect, useState } from 'react';
import { useTTS } from '@/hooks/useTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useToast } from '@/hooks/use-toast';

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

interface RehearsalModeProps {
  scriptContent: string;
  characters: Character[];
  selectedVoice: string;
  playbackSpeed: number;
  isActive: boolean;
  onComplete: () => void;
  onStop: () => void;
}

export const useRehearsalMode = ({
  scriptContent,
  characters,
  selectedVoice,
  playbackSpeed,
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

  // Parse script lines for rehearsal mode
  const getScriptLines = () => {
    if (!scriptContent) return [];
    return scriptContent.split('\n').filter(line => {
      const cleanLine = stripHtmlTags(line).trim();
      if (!cleanLine) return false;
      
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      const hasFormatting = line.includes('<b>') || line.includes('<strong>') || 
                           line.includes('<i>') || line.includes('<em>');
      
      return characterMatch || hasFormatting;
    });
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
    setCurrentLineIndex(0);
    if (listeningTimeout) {
      clearTimeout(listeningTimeout);
      setListeningTimeout(null);
    }
    stopListening();
    stopTTS();
    onStop();
  };

  const playCurrentLine = async () => {
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

    const line = lines[currentLineIndex];
    const cleanLine = stripHtmlTags(line).trim();
    
    // Check if this is a character line
    const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
    
    if (characterMatch) {
      const characterName = characterMatch[1].trim();
      const dialogue = characterMatch[2].trim();
      
      // Check if character should be spoken by AI
      const character = characters.find(c => c.name === characterName);
      if (!character || !character.isUserRole) {
        // AI line - speak it
        console.log(`AI speaking: ${characterName}: ${dialogue}`);
        await speak(dialogue, {
          voiceId: selectedVoice,
          playbackSpeed: playbackSpeed,
          onComplete: () => {
            // After AI finishes, move to next line
            setCurrentLineIndex(prev => prev + 1);
            setTimeout(() => playCurrentLine(), 500); // Brief pause before next line
          }
        });
      } else {
        // Actor line - wait for actor to speak
        console.log(`Waiting for actor line: ${characterName}: ${dialogue}`);
        setWaitingForActor(true);
        
        // Start listening for actor's words
        startListening(dialogue);
        
        // Set timeout for "still listening" indicator
        const timeout = setTimeout(() => {
          console.log('Still waiting for actor response...');
          // Don't auto-advance - just continue listening
        }, 10000);
        setListeningTimeout(timeout);
      }
    } else {
      // Formatted line (stage direction/narration) - speak it
      console.log(`AI speaking narration: ${cleanLine}`);
      await speak(cleanLine, {
        voiceId: selectedVoice,
        playbackSpeed: playbackSpeed,
        onComplete: () => {
          // After AI finishes, move to next line
          setCurrentLineIndex(prev => prev + 1);
          setTimeout(() => playCurrentLine(), 500); // Brief pause before next line
        }
      });
    }
  };

  const continueRehearsalAfterActorResponse = () => {
    // Move to next line after actor response
    setCurrentLineIndex(prev => prev + 1);
    stopListening();
    
    // Continue with next line
    setTimeout(() => playCurrentLine(), 500); // Brief pause before next line
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