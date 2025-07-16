import React, { createContext, useContext, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ScriptRehearsalStateMachine, Character, TextFilter, RehearsalState, ScriptLine } from '@/services/ScriptRehearsalStateMachine';
import { useAudioManager } from '@/services/AudioManager';
import { ScriptParserService } from '@/services/ScriptParserService';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

// Default voices that work even if the API fails
const defaultVoices: Voice[] = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'asDeXBMC8hUkhqqL7agO', name: 'David', category: 'Generated', gender: 'Male', accent: 'American' },
];

interface RehearsalContextType {
  // State Machine
  stateMachine: ScriptRehearsalStateMachine | null;
  
  // Script State
  scriptContent: string;
  characters: Character[];
  
  // Rehearsal State
  rehearsalState: RehearsalState;
  currentCueWords: string[];
  textFilter: TextFilter;
  rehearsalMode: boolean;
  
  // Audio State  
  isListening: boolean;
  isTTSPlaying: boolean;
  
  // Voice Settings
  selectedVoice: string;
  voiceActivated: boolean;
  playbackSpeed: number;
  voices: Voice[];
  
  // Banner State
  noMatchesBanner: { show: boolean; filter: TextFilter } | null;
  
  // Actions
  setTextFilter: (filter: TextFilter) => void;
  setRehearsalMode: (enabled: boolean) => void;
  setSelectedVoice: (voiceId: string) => void;
  setVoiceActivated: (activated: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  handleActorLineDetected: (line: string) => void;
  handleMasterStop: () => void;
  handleTTSPlay: () => Promise<void>;
  reset: () => void;
  updateScript: (content: string) => void;
  updateCharacters: (characters: Character[]) => void;
  
  // Initialization
  initialize: (scriptContent: string, characters: Character[]) => void;
}

const RehearsalContext = createContext<RehearsalContextType | undefined>(undefined);

interface RehearsalProviderProps {
  children: React.ReactNode;
}

export const RehearsalProvider: React.FC<RehearsalProviderProps> = ({ children }) => {
  const { toast } = useToast();
  const stateMachineRef = useRef<ScriptRehearsalStateMachine | null>(null);
  const [scriptContent, setScriptContent] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  
  // Rehearsal State
  const [rehearsalState, setRehearsalState] = useState<RehearsalState>('IDLE');
  const [currentCueWords, setCurrentCueWords] = useState<string[]>([]);
  const [textFilter, setTextFilterState] = useState<TextFilter>('all');
  const [rehearsalMode, setRehearsalModeState] = useState(false);
  const [noMatchesBanner, setNoMatchesBanner] = useState<{ show: boolean; filter: TextFilter } | null>(null);
  
  // Voice Settings
  const [selectedVoice, setSelectedVoice] = useState('9BWtsMINqrJLrRacOk9x');
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [voices, setVoices] = useState<Voice[]>(defaultVoices);
  
  // Audio Manager with all callbacks
  const audioManager = useAudioManager({
    defaultVoiceId: selectedVoice,
    defaultPlaybackSpeed: playbackSpeed,
    onTTSComplete: () => {
      console.log('🔊 TTS complete - continuing rehearsal if active');
      if (stateMachineRef.current && rehearsalMode) {
        stateMachineRef.current.handleAISpeechComplete();
      }
    },
    onTTSError: (error) => {
      console.error('TTS Error:', error);
      toast({
        title: "Speech Error", 
        description: error,
        variant: "destructive",
      });
    },
    onCueDetected: () => {
      console.log('🎤 Cue detected');
      if (stateMachineRef.current && rehearsalMode) {
        stateMachineRef.current.handleActorCueDetected();
      }
    },
    onSpeechError: (error) => {
      console.error('Speech recognition error:', error);
      toast({
        title: "Voice Recognition Error",
        description: error,
        variant: "destructive",
      });
    }
  });

  // Initialize state machine when rehearsal mode is enabled
  useEffect(() => {
    if (rehearsalMode && scriptContent && characters.length > 0 && !stateMachineRef.current) {
      console.log('🎭 Initializing State Machine for rehearsal');
      
      const config = {
        scriptContent,
        characters,
        onStateChange: (state: RehearsalState) => {
          console.log('🎭 State machine state changed:', state);
          setRehearsalState(state);
        },
        onLineChange: async (lineIndex: number, line: ScriptLine | null) => {
          console.log('📝 Line changed:', lineIndex, line?.content?.substring(0, 50) + '...');
          
          // If this is an AI line, trigger TTS
          if (line?.type === 'ai' && line.dialogue) {
            try {
              console.log('🔊 Starting TTS for AI line:', line.dialogue.substring(0, 50) + '...');
              await audioManager.speakText(line.dialogue, {
                voiceId: selectedVoice,
                playbackSpeed: playbackSpeed,
                onComplete: () => {
                  console.log('🔊 TTS completed for AI line');
                  // Notify state machine that AI speech is complete
                  stateMachineRef.current?.handleAISpeechComplete();
                }
              });
            } catch (error) {
              console.error('Error speaking AI line:', error);
            }
          }
        },
        onCueWordsChange: (cueWords: string[]) => {
          console.log('🎤 Cue words changed:', cueWords);
          setCurrentCueWords(cueWords);
          
          // Start or stop listening based on cue words and voice activation
          if (cueWords.length > 0 && voiceActivated) {
            console.log('🎤 Starting to listen for cue:', cueWords.join(' '));
            audioManager.startListeningForCue(cueWords.join(' '));
            toast({
              title: "Listening for your line",
              description: `Say: "${cueWords.join(' ')}"`,
            });
          } else {
            console.log('🎤 Stopping listening for cues');
            audioManager.stopListening();
          }
        },
        onComplete: () => {
          console.log('🎯 Rehearsal complete!');
          setRehearsalModeState(false);
          toast({
            title: "Rehearsal Complete",
            description: "You've reached the end of the script.",
          });
        },
        onError: (error: string) => {
          console.error('State machine error:', error);
          toast({
            title: "Rehearsal Error",
            description: error,
            variant: "destructive",
          });
        },
        onScriptUpdated: (hasContent: boolean) => {
          console.log('📝 Script updated, has content:', hasContent);
          if (hasContent) {
            setNoMatchesBanner(null);
          }
        },
        onNoMatches: (filter: TextFilter) => {
          console.log('🚫 No matches found for filter:', filter);
          setNoMatchesBanner({ show: true, filter });
          
          toast({
            title: "No Content Found",
            description: `No ${filter} text found in the script. AI will remain silent.`,
            variant: "destructive",
          });
        }
      };

      stateMachineRef.current = new ScriptRehearsalStateMachine(config);
      stateMachineRef.current.setTextFilter(textFilter);
      stateMachineRef.current.start();
    } else if (!rehearsalMode && stateMachineRef.current) {
      console.log('🛑 Stopping State Machine');
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
      setRehearsalState('IDLE');
      setCurrentCueWords([]);
      setNoMatchesBanner(null);
    }
  }, [rehearsalMode, scriptContent, characters, selectedVoice, playbackSpeed, voiceActivated, textFilter]);

  // Request microphone access when voice activation is enabled
  useEffect(() => {
    if (voiceActivated && audioManager.isSpeechSupported) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('Microphone access granted');
          toast({
            title: "Voice Activation Ready",
            description: "Microphone access granted. Speak the last word of your lines to trigger AI responses.",
          });
        })
        .catch((error) => {
          console.error('Microphone access denied:', error);
          setVoiceActivated(false);
          toast({
            title: "Microphone Access Required",
            description: "Please allow microphone access to use voice activation.",
            variant: "destructive",
          });
        });
    }
  }, [voiceActivated, audioManager.isSpeechSupported]);

  // Load voices on mount
  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-voices');
      
      if (error) {
        console.error('Error fetching voices:', error);
        setVoices(defaultVoices);
        return;
      }

      if (data?.voices && data.voices.length > 0) {
        // Merge API voices with default voices, avoiding duplicates
        const apiVoices = data.voices;
        const mergedVoices = [...defaultVoices];
        
        apiVoices.forEach((apiVoice: Voice) => {
          if (!defaultVoices.find(defaultVoice => defaultVoice.id === apiVoice.id)) {
            mergedVoices.push(apiVoice);
          }
        });
        
        setVoices(mergedVoices);
      } else {
        setVoices(defaultVoices);
      }
    } catch (error) {
      console.error('Error loading voices:', error);
      setVoices(defaultVoices);
    }
  };

  // Initialize state machine
  const initialize = useCallback((scriptContent: string, characters: Character[]) => {
    setScriptContent(scriptContent);
    setCharacters(characters);
  }, []);

  // Update script content
  const updateScript = (content: string) => {
    setScriptContent(content);
  };

  // Update characters
  const updateCharacters = (characters: Character[]) => {
    setCharacters(characters);
  };

  // Actions
  const setTextFilter = (filter: TextFilter) => {
    setTextFilterState(filter);
    if (stateMachineRef.current) {
      stateMachineRef.current.setTextFilter(filter);
    }
  };

  const setRehearsalMode = (enabled: boolean) => {
    setRehearsalModeState(enabled);
  };

  const handleActorLineDetected = (line: string) => {
    if (!voiceActivated || !audioManager.isSpeechSupported || audioManager.isListening) return;
    
    // Start listening for cue in the line
    const characterMatch = line.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
    if (characterMatch) {
      const dialogue = characterMatch[2].trim();
      console.log(`Starting to listen for cue in: "${dialogue}"`);
      audioManager.startListeningForCue(dialogue);
    }
  };

  const handleMasterStop = () => {
    console.log('🛑 Master stop - halting all operations');
    setRehearsalModeState(false);
    audioManager.stopAll();
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
    }
  };

  const handleTTSPlay = async () => {
    if (!scriptContent) return;

    try {
      const { text, hasContent, fallbackApplied } = ScriptParserService.extractTextForTTS(
        scriptContent, 
        characters, 
        textFilter
      );

      if (!hasContent) {
        toast({
          title: "No Text Found",
          description: `No ${textFilter} text found to read.`,
          variant: "destructive",
        });
        return;
      }

      if (fallbackApplied) {
        toast({
          title: "Filter Fallback Applied",
          description: `No ${textFilter} text found. Reading all text instead.`,
        });
      }

      await audioManager.speakText(text, {
        voiceId: selectedVoice,
        playbackSpeed: playbackSpeed,
      });
    } catch (error) {
      console.error('TTS Error:', error);
      toast({
        title: "Speech Error",
        description: "Failed to generate speech. Check your connection.",
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
    }
    setRehearsalModeState(false);
    setNoMatchesBanner(null);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (stateMachineRef.current) {
        stateMachineRef.current.stop();
      }
    };
  }, []);

  const value: RehearsalContextType = useMemo(() => ({
    stateMachine: stateMachineRef.current,
    scriptContent,
    characters,
    rehearsalState,
    currentCueWords,
    textFilter,
    rehearsalMode,
    isListening: audioManager?.isListening ?? false,
    isTTSPlaying: audioManager?.isTTSPlaying ?? false,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    handleActorLineDetected,
    handleMasterStop,
    handleTTSPlay,
    reset,
    updateScript,
    updateCharacters,
    initialize,
  }), [
    stateMachineRef.current,
    scriptContent,
    characters,
    rehearsalState,
    currentCueWords,
    textFilter,
    rehearsalMode,
    audioManager?.isListening,
    audioManager?.isTTSPlaying,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    handleActorLineDetected,
    handleMasterStop,
    handleTTSPlay,
    reset,
    updateScript,
    updateCharacters,
    initialize,
  ]);

  return (
    <RehearsalContext.Provider value={value}>
      {children}
    </RehearsalContext.Provider>
  );
};

export const useRehearsal = () => {
  const context = useContext(RehearsalContext);
  if (context === undefined) {
    throw new Error('useRehearsal must be used within a RehearsalProvider');
  }
  return context;
};