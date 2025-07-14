import { useTTS } from '@/hooks/useTTS';
import { useToast } from '@/hooks/use-toast';

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

type TextFilter = 'all' | 'bold' | 'italic' | 'characters';

interface TTSManagerProps {
  scriptContent: string;
  characters: Character[];
  selectedVoice: string;
  playbackSpeed: number;
  textFilter: TextFilter;
}

export const useTTSManager = ({
  scriptContent,
  characters,
  selectedVoice,
  playbackSpeed,
  textFilter,
}: TTSManagerProps) => {
  const { speak, pause: pauseTTS, resume: resumeTTS, stop: stopTTS, isPlaying: isTTSPlaying, isPaused: isTTSPaused } = useTTS();
  const { toast } = useToast();

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
    console.log(`TTS: Extracting ${format} text from content length:`, content.length);
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    const selector = format === 'bold' ? 'b, strong' : 'i, em';
    const elements = tempDiv.querySelectorAll(selector);
    
    console.log(`TTS: Found ${elements.length} ${format} elements`);
    
    if (elements.length === 0) {
      console.log(`TTS: No ${format} elements found in content`);
      return '';
    }
    
    const extractedText = Array.from(elements)
      .map(element => {
        const text = element.textContent || '';
        return text.trim();
      })
      .filter(text => text.length > 0)
      .join(' ')
      .trim();
    
    console.log(`TTS: Extracted ${format} text:`, extractedText);
    
    return extractedText;
  };

  // Extract only character dialogue
  const extractCharacterDialogue = (content: string): string => {
    const lines = content.split('\n');
    const dialogueLines: string[] = [];
    
    lines.forEach(line => {
      const cleanLine = stripHtmlTags(line);
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const dialogue = characterMatch[2].trim();
        
        // Check if character should be spoken by AI
        const character = characters.find(c => c.name === characterName);
        if (!character || !character.isUserRole) {
          dialogueLines.push(dialogue);
        }
      }
    });
    
    return dialogueLines.join(' ').trim();
  };

  const handleTTSPlay = async () => {
    if (!scriptContent) return;

    // If currently playing, pause
    if (isTTSPlaying) {
      console.log('TTS: Pausing playback');
      pauseTTS();
      return;
    }

    // If paused, resume
    if (isTTSPaused) {
      console.log('TTS: Resuming playback');
      resumeTTS();
      return;
    }
    
    console.log('TTS: Starting speech generation for text length:', scriptContent.length);
    
    try {
      let textToSpeak = '';
      
      // Filter text based on selected filter
      switch (textFilter) {
        case 'all':
          textToSpeak = stripHtmlTags(scriptContent);
          break;
        case 'bold':
          textToSpeak = extractFormattedText(scriptContent, 'bold');
          break;
        case 'italic':
          textToSpeak = extractFormattedText(scriptContent, 'italic');
          break;
        case 'characters':
          textToSpeak = extractCharacterDialogue(scriptContent);
          break;
        default:
          textToSpeak = stripHtmlTags(scriptContent);
      }
      
      if (!textToSpeak.trim()) {
        toast({
          title: "No Text Found",
          description: `No ${textFilter} text found to read.`,
          variant: "destructive",
        });
        return;
      }

      await speak(textToSpeak, {
        voiceId: selectedVoice,
        playbackSpeed: playbackSpeed,
        onWordSpoken: (wordIndex) => {
          // Optional: highlight current word
        },
        onComplete: () => {
          console.log('TTS: Speech completed');
        }
      });
    } catch (error) {
      console.error('TTS Error:', error);
      toast({
        title: "Speech Error",
        description: "Failed to generate speech. Check your ElevenLabs API key.",
        variant: "destructive",
      });
    }
  };

  return {
    handleTTSPlay,
    isTTSPlaying,
    isTTSPaused,
    stopTTS,
  };
};