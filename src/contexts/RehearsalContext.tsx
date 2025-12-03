import React, { createContext, useContext, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ScriptRehearsalStateMachine, Character, TextFilter, RehearsalState, ScriptLine } from '@/services/ScriptRehearsalStateMachine';
import { useAudioManager } from '@/services/EnhancedAudioManager';
import { ScriptParserService } from '@/services/ScriptParserService';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useConversationEngine } from '@/hooks/useConversationEngine';
import { isFeatureEnabled } from '@/lib/featureFlags';
import type { ScriptContext } from '@/services/conversation/domain';
import { getScriptLines } from '@/components/practice/rehearsal/scriptParser';
import { buildScriptContext, buildCuesFromLines, getCueContext } from '@/utils/scriptCueBuilder';

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
  isManualTTSPlaying: boolean;
  audioManager: any; // AudioManagerReturn type
  
  // Voice Settings
  selectedVoice: string;
  voiceActivated: boolean;
  playbackSpeed: number;
  voices: Voice[];
  
  // Banner State
  noMatchesBanner: { show: boolean; filter: TextFilter } | null;
  
  // Conversation Engine (ElevenLabs AI)
  isUsingConversationEngine: boolean;
  conversationEngineStatus: string;
  
  // Actions
  setTextFilter: (filter: TextFilter) => void;
  setRehearsalMode: (enabled: boolean) => void;
  setSelectedVoice: (voiceId: string) => void;
  setVoiceActivated: (activated: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  handleActorLineDetected: (line: string) => void;
  handleMasterStop: () => void;
  handleTTSPlay: () => Promise<void>;
  handleTTSStop: () => void;
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
  const [isManualTTSPlaying, setIsManualTTSPlaying] = useState(false);
  
  // Audio Manager with all callbacks
  const audioManager = useAudioManager({
    defaultVoice: selectedVoice,
    onTTSComplete: () => {
      console.log('🔊 TTS Complete callback triggered');
      setIsManualTTSPlaying(false);
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
    onCueDetected: (cue: string) => {
      console.log('🎤 Cue detected:', cue);
      toast({
        title: "Cue Detected",
        description: `Heard: "${cue}"`,
        duration: 2000,
      });
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
    },
    onMobileListenRequest: () => {
      console.log('📱 Mobile listen request - showing tap to listen UI');
      toast({
        title: "Ready to Listen",
        description: "Tap the 'Tap to Listen' button when you're ready to speak your line",
        duration: 3000,
      });
    }
  });

  // Conversation Engine integration (feature-flagged)
  const useElevenEngine = isFeatureEnabled('conversation_engine_eleven');
  const scriptTitleRef = useRef<string>('Untitled Script');
  const sessionStartRef = useRef<number>(Date.now());
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const parsedLinesRef = useRef<ScriptLine[]>([]);

  // Helper to advance to next line and update context
  const advanceToNextLine = useCallback(() => {
    const nextIndex = currentLineIndex + 1;
    const lines = parsedLinesRef.current;
    
    if (nextIndex >= lines.length) {
      console.log('🎯 [ConversationEngine] Script complete!');
      setRehearsalModeState(false);
      toast({
        title: "Rehearsal Complete",
        description: "You've reached the end of the script.",
      });
      return;
    }
    
    setCurrentLineIndex(nextIndex);
    
    // Update conversation engine with new context
    if (conversationEngine.isActive) {
      const context = buildScriptContext(
        scriptTitleRef.current,
        lines,
        nextIndex,
        textFilter,
        sessionStartRef.current
      );
      console.log('📝 [ConversationEngine] Updating context to line', nextIndex);
      conversationEngine.updateContext(context);
    }
  }, [currentLineIndex, textFilter, toast]);

  const conversationEngine = useConversationEngine({
    onUserSpeechStarted: () => {
      console.log('🎤 [ConversationEngine] User speech started');
      setRehearsalState('WAITING_FOR_ACTOR_CUE');
    },
    onUserSpeechEnded: (transcript) => {
      console.log('🎤 [ConversationEngine] User speech ended:', transcript);
      // When user finishes speaking, advance if current line is an actor line
      const lines = parsedLinesRef.current;
      if (lines[currentLineIndex]?.type === 'actor') {
        console.log('🎤 [ConversationEngine] User finished actor line, advancing');
        advanceToNextLine();
      }
    },
    onAgentResponseStarted: () => {
      console.log('🤖 [ConversationEngine] Agent response started');
      setRehearsalState('AI_SPEAKING');
    },
    onAgentResponseEnded: (fullText) => {
      console.log('🤖 [ConversationEngine] Agent response ended:', fullText);
      // When agent finishes speaking, advance if current line is an AI line
      const lines = parsedLinesRef.current;
      if (lines[currentLineIndex]?.type === 'ai') {
        console.log('🤖 [ConversationEngine] Agent finished AI line, advancing');
        advanceToNextLine();
      }
      setRehearsalState('WAITING_FOR_ACTOR_CUE');
    },
    onAgentAudioStarted: () => {
      console.log('🔊 [ConversationEngine] Agent audio started');
    },
    onAgentAudioEnded: () => {
      console.log('🔊 [ConversationEngine] Agent audio ended');
      setRehearsalState('WAITING_FOR_ACTOR_CUE');
    },
    onError: (error) => {
      console.error('❌ [ConversationEngine] Error:', error);
      toast({
        title: "Conversation Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onStatusChange: (status) => {
      console.log('📡 [ConversationEngine] Status:', status);
      if (status === 'ready') {
        toast({
          title: "AI Partner Connected",
          description: "Ready for conversation",
          duration: 2000,
        });
      } else if (status === 'disconnected' || status === 'error') {
        setRehearsalModeState(false);
      }
    },
  });

  // Effect: Start/stop conversation engine when rehearsal mode changes (feature flagged)
  useEffect(() => {
    if (!useElevenEngine) return;

    if (rehearsalMode && scriptContent) {
      console.log('🎭 [ConversationEngine] Starting ElevenLabs Conversational AI');
      sessionStartRef.current = Date.now();
      
      // Parse script lines based on text filter
      const lines = getScriptLines(scriptContent, textFilter);
      parsedLinesRef.current = lines;
      setCurrentLineIndex(0);
      
      console.log('📝 [ConversationEngine] Parsed', lines.length, 'lines with filter:', textFilter);
      console.log('📝 [ConversationEngine] AI lines:', lines.filter(l => l.type === 'ai').length);
      console.log('📝 [ConversationEngine] Actor lines:', lines.filter(l => l.type === 'actor').length);
      
      // Log each parsed line for debugging
      lines.forEach((line, i) => {
        console.log(`📝 Line ${i}: [${line.type}] "${line.dialogue.substring(0, 60)}..."`);
      });
      
      // Build initial context with actual script content
      const initialContext = buildScriptContext(
        scriptTitleRef.current,
        lines,
        0,
        textFilter,
        sessionStartRef.current
      );
      
      console.log('📝 [ConversationEngine] Initial context:', {
        totalLines: initialContext.totalLines,
        currentCue: initialContext.currentCue?.text?.substring(0, 50),
        nextCue: initialContext.nextCue?.text?.substring(0, 50),
        upcomingCuesCount: initialContext.upcomingCues.length,
      });
      console.log('📝 [ConversationEngine] Custom instructions preview:', 
        initialContext.customInstructions?.substring(0, 500));

      conversationEngine.start({
        voiceId: selectedVoice,
        language: 'en',
        enableTranscription: true,
        enableInterruption: true,
        initialContext,
      });
    } else if (!rehearsalMode && conversationEngine.isActive) {
      console.log('🛑 [ConversationEngine] Stopping');
      conversationEngine.stop();
      setRehearsalState('IDLE');
      setCurrentLineIndex(0);
      parsedLinesRef.current = [];
    }
  }, [useElevenEngine, rehearsalMode, scriptContent, textFilter]);

  // Update conversation engine context when script changes mid-rehearsal
  useEffect(() => {
    if (!useElevenEngine || !conversationEngine.isActive || !scriptContent) return;

    // Re-parse lines if script changes during rehearsal
    const lines = getScriptLines(scriptContent, textFilter);
    parsedLinesRef.current = lines;
    
    const context = buildScriptContext(
      scriptTitleRef.current,
      lines,
      currentLineIndex,
      textFilter,
      sessionStartRef.current
    );

    conversationEngine.updateContext(context);
  }, [useElevenEngine, scriptContent, conversationEngine.isActive, textFilter]);

  // Initialize state machine when rehearsal mode is enabled (legacy path when feature flag disabled)
  useEffect(() => {
    // Skip if using ElevenLabs Conversation Engine
    if (useElevenEngine) return;

    if (rehearsalMode && scriptContent && !stateMachineRef.current) {
      console.log('🎭 Initializing State Machine + VAD connection for rehearsal (legacy)');
      
      // Initialize persistent VAD connection
      audioManager.initializeVADConnection().catch((error) => {
        console.error('❌ [CRITICAL] Failed to initialize VAD connection');
        console.error('❌ Error:', error);
        console.error('❌ Error stack:', error instanceof Error ? error.stack : '(no stack trace)');
        console.error('❌ Time:', new Date().toISOString());
        
        // Only show error toast if microphone permission is denied
        if (error instanceof Error && (error.message?.includes('permission') || error.message?.includes('NotAllowedError') || error.name === 'NotAllowedError')) {
          toast({
            title: "Microphone Error",
            description: "Could not access microphone. Please check permissions.",
            variant: "destructive",
          });
        }
        // Otherwise, errors are logged but don't interrupt user experience
      });
      
      const config = {
        scriptContent,
        characters,
        textFilter,
        onStateChange: (state: RehearsalState) => {
          console.log('🎭 State machine state changed:', state);
          setRehearsalState(state);
          
          // Auto-enable voice activation when entering WAITING_FOR_ACTOR_CUE
          if (state === 'WAITING_FOR_ACTOR_CUE' && !voiceActivated) {
            console.log('🎤 Auto-enabling voice activation for rehearsal');
            setVoiceActivated(true);
          }
          
          // Show state change toast for debugging
          toast({
            title: "Rehearsal State",
            description: `State: ${state}`,
            duration: 1000,
          });
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
          
          // Update VAD connection with new cue words
          if (cueWords.length > 0 && rehearsalMode) {
            // Auto-enable voice activation if not already enabled
            if (!voiceActivated) {
              console.log('🎤 Auto-enabling voice activation for cue detection');
              setVoiceActivated(true);
            }
            
            console.log('🎤 Updating VAD cue words:', cueWords);
            audioManager.updateVADCueWords(cueWords);
            toast({
              title: "Listening for your line",
              description: `Say: "${cueWords.join(' ')}"`,
            });
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
            description: `No ${filter} text found in the script. Please update your script or switch filters.`,
            variant: "destructive",
          });
        }
      };

      stateMachineRef.current = new ScriptRehearsalStateMachine(config);
      stateMachineRef.current.start();
    } else if (!rehearsalMode && stateMachineRef.current) {
      console.log('🛑 Stopping State Machine and VAD connection');
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
      audioManager.stopVADConnection();
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
    console.log('🎭 Setting rehearsal mode:', enabled);
    setRehearsalModeState(enabled);
    
    // Auto-enable voice activation when starting rehearsal
    if (enabled && !voiceActivated) {
      console.log('🎤 Auto-enabling voice activation for rehearsal mode');
      setVoiceActivated(true);
    }
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
    
    // Stop conversation engine if active
    if (conversationEngine.isActive) {
      conversationEngine.stop();
    }
    
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
    }
  };

  const handleTTSPlay = async () => {
    if (!scriptContent) return;

    // If TTS is already playing, stop it
    if (isManualTTSPlaying) {
      audioManager.stopTTS();
      setIsManualTTSPlaying(false);
      return;
    }

    try {
      const { text, hasContent } = ScriptParserService.extractTextForTTS(
        scriptContent, 
        textFilter,
        true // strict mode - no fallback
      );

      if (!hasContent) {
        // Show specific message for the filter type
        const filterLabel = textFilter === 'all' ? 'text' : 
                           textFilter === 'bold' ? 'bold text' : 'italic text';
        
        toast({
          title: "No Content Found",
          description: `No ${filterLabel} found in the script. Please update your script or switch filters.`,
          variant: "destructive",
        });
        return;
      }

      console.log('🔊 Starting manual TTS playback');
      setIsManualTTSPlaying(true);
      
      await audioManager.speakText(text, {
        voiceId: selectedVoice,
        playbackSpeed: playbackSpeed,
      });
    } catch (error) {
      console.error('TTS Error:', error);
      setIsManualTTSPlaying(false);
      toast({
        title: "Speech Error",
        description: "Failed to generate speech. Check your connection.",
        variant: "destructive",
      });
    }
  };

  const handleTTSStop = () => {
    console.log('🛑 Manual TTS stop requested');
    audioManager.stopTTS();
    setIsManualTTSPlaying(false);
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
    isManualTTSPlaying,
    audioManager,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    isUsingConversationEngine: useElevenEngine && conversationEngine.isActive,
    conversationEngineStatus: conversationEngine.status,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    handleActorLineDetected,
    handleMasterStop,
    handleTTSPlay,
    handleTTSStop,
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
    isManualTTSPlaying,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    useElevenEngine,
    conversationEngine.isActive,
    conversationEngine.status,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    handleActorLineDetected,
    handleMasterStop,
    handleTTSPlay,
    handleTTSStop,
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