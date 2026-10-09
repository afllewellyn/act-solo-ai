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
import { findSpokenAiLine } from '@/utils/lineMatching';

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
  isPaused: boolean;
  
  // Audio State  
  isListening: boolean;
  isTTSPlaying: boolean;
  isManualTTSPlaying: boolean;
  audioManager: ReturnType<typeof useAudioManager>;
  
  // Voice Settings
  selectedVoice: string;
  voiceActivated: boolean;
  playbackSpeed: number;
  voices: Voice[];
  
  // Banner State
  noMatchesBanner: { show: boolean; filter: TextFilter } | null;

  // Current position (drives highlight + eye-line scrolling)
  /** Source paragraph (among non-empty <p>) of the current line, or null when idle */
  currentParagraphIndex: number | null;
  showNames: boolean;
  
  // Conversation Engine (ElevenLabs AI)
  isUsingConversationEngine: boolean;
  conversationEngineStatus: string;
  
  // Actions
  setTextFilter: (filter: TextFilter) => void;
  setRehearsalMode: (enabled: boolean) => void;
  setSelectedVoice: (voiceId: string) => void;
  setVoiceActivated: (activated: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setShowNames: (show: boolean) => void;
  /** Skip to the next cue (rehearsal only) */
  nextCue: () => void;
  /** Jump to the line at or after a script paragraph (tap a line) */
  goToParagraph: (paragraphIndex: number) => void;
  handleActorLineDetected: (line: string) => void;
  handleMasterStop: () => void;
  handlePause: () => void;
  handleResume: () => void;
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
  const [textFilter, setTextFilterState] = useState<TextFilter>('italic');
  const [rehearsalMode, setRehearsalModeState] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
  const currentLineIndexRef = useRef(0);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number | null>(null);
  // Engine lines: stage notes are excluded, so they are never read or waited on
  const parsedLinesRef = useRef<ScriptLine[]>([]);

  // Show/hide "NAME:" prefixes in the script view (remembered per browser)
  const [showNames, setShowNamesState] = useState(() => {
    try {
      return localStorage.getItem('rehearsal_show_names') !== 'false';
    } catch {
      return true;
    }
  });
  const setShowNames = useCallback((show: boolean) => {
    setShowNamesState(show);
    try {
      localStorage.setItem('rehearsal_show_names', String(show));
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Single place that moves the current line, so state, ref and highlight stay in sync
  const setLine = useCallback((index: number) => {
    currentLineIndexRef.current = index;
    setCurrentLineIndex(index);
    setCurrentParagraphIndex(parsedLinesRef.current[index]?.paragraphIndex ?? null);
  }, []);

  // Not memoized on purpose: it reads the current engine state each render
  const syncEngineContext = (index: number) => {
    if (!conversationEngine.isActive) return;
    const context = buildScriptContext(
      scriptTitleRef.current,
      parsedLinesRef.current,
      index,
      textFilter,
      sessionStartRef.current
    );
    console.log('📝 [ConversationEngine] Updating context to line', index);
    conversationEngine.updateContext(context);
  };

  // Move to the line after `fromIndex` (reads refs, so it is safe from long-lived event handlers)
  const advanceFrom = (fromIndex: number) => {
    const nextIndex = fromIndex + 1;
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

    setLine(nextIndex);
    syncEngineContext(nextIndex);
  };

  const advanceToNextLine = () => {
    advanceFrom(currentLineIndexRef.current);
  };

  const conversationEngine = useConversationEngine({
    onUserSpeechStarted: () => {
      setRehearsalState('WAITING_FOR_ACTOR_CUE');
    },
    onUserSpeechEnded: () => {
      // When user finishes speaking, advance if current line is an actor line
      if (parsedLinesRef.current[currentLineIndexRef.current]?.type === 'actor') {
        advanceToNextLine();
      }
    },
    onAgentResponseStarted: () => {
      setRehearsalState('AI_SPEAKING');
    },
    onAgentResponseEnded: (fullText) => {
      // Match what was actually said to an upcoming AI line, so we catch up if a turn was missed
      const lines = parsedLinesRef.current;
      const current = currentLineIndexRef.current;
      const spokenIndex = findSpokenAiLine(lines, current, fullText);
      if (spokenIndex !== -1) {
        advanceFrom(spokenIndex);
      } else if (lines[current]?.type === 'ai') {
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
      const lines = getScriptLines(scriptContent, textFilter).filter(l => l.type !== 'note');
      parsedLinesRef.current = lines;
      setLine(0);
      
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
      parsedLinesRef.current = [];
      setLine(0);
      setCurrentParagraphIndex(null);
    }
  }, [useElevenEngine, rehearsalMode, scriptContent, textFilter]);

  // Update conversation engine context when script changes mid-rehearsal
  useEffect(() => {
    if (!useElevenEngine || !conversationEngine.isActive || !scriptContent) return;

    // Re-parse lines if script changes during rehearsal
    const lines = getScriptLines(scriptContent, textFilter).filter(l => l.type !== 'note');
    parsedLinesRef.current = lines;
    
    const context = buildScriptContext(
      scriptTitleRef.current,
      lines,
      currentLineIndexRef.current,
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
      console.log('🎭 Initializing State Machine for rehearsal (legacy path)');
      
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

          // Drive the highlight + eye-line scrolling on the legacy path too
          setCurrentParagraphIndex(line?.paragraphIndex ?? null);

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
          
          // Notify user of cue words (VAD removed - using ElevenLabs Conversational AI)
          if (cueWords.length > 0 && rehearsalMode) {
            // Auto-enable voice activation if not already enabled
            if (!voiceActivated) {
              console.log('🎤 Auto-enabling voice activation for cue detection');
              setVoiceActivated(true);
            }
            
            console.log('🎤 Cue words ready:', cueWords);
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
      console.log('🛑 Stopping State Machine');
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
      setRehearsalState('IDLE');
      setCurrentCueWords([]);
      setCurrentParagraphIndex(null);
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

  const nextCue = () => {
    if (!rehearsalMode) return;
    advanceToNextLine();
  };

  const goToParagraph = (paragraphIndex: number) => {
    const lines = parsedLinesRef.current;
    const target = lines.findIndex(l => l.paragraphIndex >= paragraphIndex);
    if (rehearsalMode && target !== -1) {
      setLine(target);
      syncEngineContext(target);
    } else {
      setCurrentParagraphIndex(paragraphIndex);
    }
  };

  const handleActorLineDetected = (line: string) => {
    if (!voiceActivated || !audioManager.isSpeechSupported || audioManager.isListening) return;
    
    // Start listening for cue in the line
    const characterMatch = line.match(/^([A-Z][A-Z\s\-'.]+):\s*(.+)$/);
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

  // Read-script (listen) mode plays one audio file, so line changes are estimated from word counts
  const listenLinesRef = useRef<ScriptLine[]>([]);
  const listenTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearListenTimers = () => {
    listenTimersRef.current.forEach(clearTimeout);
    listenTimersRef.current = [];
  };

  useEffect(() => {
    if (!isManualTTSPlaying) {
      clearListenTimers();
      return;
    }
    if (!audioManager.isTTSPlaying || listenTimersRef.current.length > 0) return;

    const WORDS_PER_SECOND = 2.6; // typical TTS pace at 1x
    let elapsedMs = 0;
    listenLinesRef.current.forEach((line, i) => {
      const startAt = elapsedMs;
      if (i === 0) {
        setCurrentParagraphIndex(line.paragraphIndex);
      } else {
        listenTimersRef.current.push(
          setTimeout(() => setCurrentParagraphIndex(line.paragraphIndex), startAt)
        );
      }
      const words = line.dialogue.split(/\s+/).filter(Boolean).length;
      elapsedMs += (words / (WORDS_PER_SECOND * playbackSpeed)) * 1000;
    });
    return clearListenTimers;
  }, [isManualTTSPlaying, audioManager.isTTSPlaying]);

  const handleTTSPlay = async () => {
    if (!scriptContent) return;

    // If TTS is already playing, stop it
    if (isManualTTSPlaying) {
      audioManager.stopTTS();
      setIsManualTTSPlaying(false);
      return;
    }

    // Lines that will actually be spoken (italic mode: italic lines only; all: everything)
    listenLinesRef.current = getScriptLines(scriptContent, textFilter)
      .filter(l => l.type === 'ai');

    try {
      const { text, hasContent } = ScriptParserService.extractTextForTTS(
        scriptContent, 
        textFilter,
        true // strict mode - no fallback
      );

      if (!hasContent) {
        // Show specific message for the filter type
        const filterLabel = textFilter === 'all' ? 'text' : 'italic text';
        
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
    clearListenTimers();
    audioManager.stopTTS();
    setIsManualTTSPlaying(false);
  };

  const reset = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
    }
    setRehearsalModeState(false);
    setIsPaused(false);
    setNoMatchesBanner(null);
  };

  // Pause rehearsal - interrupt AI and stop listening
  const handlePause = useCallback(() => {
    if (!rehearsalMode) return;
    
    console.log('⏸️ Pausing rehearsal');
    setIsPaused(true);
    
    // Interrupt AI if using conversation engine
    if (useElevenEngine && conversationEngine.isActive) {
      conversationEngine.sendControl({ type: 'pause_agent' });
    }
    
    // Stop TTS
    audioManager.stopTTS();
    
    toast({
      title: "Rehearsal Paused",
      description: "Tap Resume to continue",
      duration: 2000,
    });
  }, [rehearsalMode, useElevenEngine, conversationEngine, audioManager, toast]);

  // Resume rehearsal - restart listening
  const handleResume = useCallback(() => {
    if (!rehearsalMode || !isPaused) return;
    
    console.log('▶️ Resuming rehearsal');
    setIsPaused(false);
    
    // Resume agent (graceful no-op, agent resumes automatically)
    if (useElevenEngine && conversationEngine.isActive) {
      conversationEngine.sendControl({ type: 'resume_agent' });
    }
    
    toast({
      title: "Rehearsal Resumed",
      duration: 1500,
    });
  }, [rehearsalMode, isPaused, useElevenEngine, conversationEngine, toast]);

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
    isPaused,
    isListening: audioManager?.isListening ?? false,
    isTTSPlaying: audioManager?.isTTSPlaying ?? false,
    isManualTTSPlaying,
    audioManager,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    currentParagraphIndex,
    showNames,
    isUsingConversationEngine: useElevenEngine && conversationEngine.isActive,
    conversationEngineStatus: conversationEngine.status,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    setShowNames,
    nextCue,
    goToParagraph,
    handleActorLineDetected,
    handleMasterStop,
    handlePause,
    handleResume,
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
    isPaused,
    audioManager?.isListening,
    audioManager?.isTTSPlaying,
    isManualTTSPlaying,
    selectedVoice,
    voiceActivated,
    playbackSpeed,
    voices,
    noMatchesBanner,
    currentParagraphIndex,
    showNames,
    useElevenEngine,
    conversationEngine.isActive,
    conversationEngine.status,
    setTextFilter,
    setRehearsalMode,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    setShowNames,
    nextCue,
    goToParagraph,
    handleActorLineDetected,
    handleMasterStop,
    handlePause,
    handleResume,
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