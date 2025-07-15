import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { ScriptRehearsalStateMachine, Character, TextFilter, RehearsalState, ScriptLine } from '@/services/ScriptRehearsalStateMachine';
import { useAudioManager } from '@/services/AudioManager';
import { useToast } from '@/hooks/use-toast';

interface RehearsalContextType {
  // State Machine
  stateMachine: ScriptRehearsalStateMachine | null;
  
  // Rehearsal State
  rehearsalState: RehearsalState;
  currentCueWords: string[];
  textFilter: TextFilter;
  rehearsalMode: boolean;
  
  // Audio State
  isListening: boolean;
  
  // Banner State
  noMatchesBanner: { show: boolean; filter: TextFilter } | null;
  
  // Actions
  setTextFilter: (filter: TextFilter) => void;
  setRehearsalMode: (enabled: boolean) => void;
  handleActorLineDetected: (line: string) => void;
  handleMasterStop: () => void;
  reset: () => void;
  
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
  
  // State
  const [rehearsalState, setRehearsalState] = useState<RehearsalState>('IDLE');
  const [currentCueWords, setCurrentCueWords] = useState<string[]>([]);
  const [textFilter, setTextFilterState] = useState<TextFilter>('all');
  const [rehearsalMode, setRehearsalMode] = useState(false);
  const [noMatchesBanner, setNoMatchesBanner] = useState<{ show: boolean; filter: TextFilter } | null>(null);
  
  // Audio Manager
  const { isListening, stopAll } = useAudioManager();

  // Initialize state machine
  const initialize = (scriptContent: string, characters: Character[]) => {
    const config = {
      scriptContent,
      characters,
      onStateChange: (state: RehearsalState) => {
        setRehearsalState(state);
      },
      onLineChange: (lineIndex: number, line: ScriptLine | null) => {
        // Handle line changes if needed
      },
      onCueWordsChange: (cueWords: string[]) => {
        setCurrentCueWords(cueWords);
      },
      onComplete: () => {
        setRehearsalMode(false);
        toast({
          title: "Rehearsal Complete",
          description: "You've reached the end of the script!",
        });
      },
      onError: (error: string) => {
        toast({
          title: "Rehearsal Error",
          description: error,
          variant: "destructive",
        });
      },
      onScriptUpdated: (hasContent: boolean) => {
        if (hasContent) {
          setNoMatchesBanner(null);
        }
      },
      onNoMatches: (filter: TextFilter) => {
        setNoMatchesBanner({ show: true, filter });
      }
    };

    stateMachineRef.current = new ScriptRehearsalStateMachine(config);
  };

  // Actions
  const setTextFilter = (filter: TextFilter) => {
    setTextFilterState(filter);
    if (stateMachineRef.current) {
      stateMachineRef.current.setTextFilter(filter);
    }
  };

  const handleActorLineDetected = (line: string) => {
    if (stateMachineRef.current && rehearsalMode) {
      stateMachineRef.current.handleActorCueDetected();
    }
  };

  const handleMasterStop = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
    }
    stopAll();
    setRehearsalMode(false);
  };

  const reset = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
    }
    setRehearsalMode(false);
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

  const value: RehearsalContextType = {
    stateMachine: stateMachineRef.current,
    rehearsalState,
    currentCueWords,
    textFilter,
    rehearsalMode,
    isListening,
    noMatchesBanner,
    setTextFilter,
    setRehearsalMode,
    handleActorLineDetected,
    handleMasterStop,
    reset,
    initialize,
  };

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