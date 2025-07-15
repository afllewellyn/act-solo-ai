import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { RoleAssignmentDialog } from '@/components/RoleAssignmentDialog';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { InlineScriptEditor } from '@/components/InlineScriptEditor';
import { ActorLineDetector } from '@/components/ActorLineDetector';
import { VoiceControls } from '@/components/practice/VoiceControls';
import { ScriptControls } from '@/components/practice/ScriptControls';
import { MobileControlsDrawer } from '@/components/practice/MobileControlsDrawer';
// import { useRehearsalMode } from '@/components/practice/RehearsalMode'; // REMOVED: Replaced with ScriptRehearsalStateMachine
// import { useTTSManager } from '@/components/practice/TTSManager'; // REMOVED: Replaced with useAudioManager
import { ScriptRehearsalStateMachine } from '@/services/ScriptRehearsalStateMachine';
import { useAudioManager } from '@/services/AudioManager';
import { ScriptParserService } from '@/services/ScriptParserService';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface Script {
  id: string;
  title: string;
  content: string;
  characters: any;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Remove local interface - now imported from services
import type { Character } from '@/services/ScriptRehearsalStateMachine';

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

type TextFilter = 'all' | 'bold' | 'italic';

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

const Practice = () => {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState([2]);
  const [fontSize, setFontSize] = useState([18]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('9BWtsMINqrJLrRacOk9x');
  const [currentLine, setCurrentLine] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [textFilter, setTextFilter] = useState<TextFilter>('all');
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [rehearsalMode, setRehearsalMode] = useState(false);
  
  const [scriptContent, setScriptContent] = useState('');
  const [currentActorLine, setCurrentActorLine] = useState<string | null>(null);

  // Initialize State Machine
  const stateMachineRef = useRef<ScriptRehearsalStateMachine | null>(null);
  const [rehearsalState, setRehearsalState] = useState('IDLE');
  const [currentCueWords, setCurrentCueWords] = useState<string[]>([]);

  // Initialize Audio Manager (replaces useTTSManager)
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
    onCueDetected: (cue) => {
      console.log('🎤 Cue detected:', cue);
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

  // Initialize state machine when needed
  useEffect(() => {
    if (rehearsalMode && scriptContent && characters.length > 0 && !stateMachineRef.current) {
      console.log('🎭 Initializing State Machine for rehearsal');
      
      stateMachineRef.current = new ScriptRehearsalStateMachine({
        scriptContent,
        characters,
        textFilter,
        onStateChange: (state) => {
          console.log('🎭 State machine state changed:', state);
          setRehearsalState(state);
        },
        onLineChange: async (lineIndex, line) => {
          console.log('📝 Line changed:', lineIndex, line?.content?.substring(0, 50) + '...');
          
          // If this is an AI line, trigger TTS
          if (line?.type === 'ai' && line.dialogue) {
            try {
              await audioManager.speakText(line.dialogue, {
                voiceId: selectedVoice,
                playbackSpeed: playbackSpeed,
              });
            } catch (error) {
              console.error('Error speaking AI line:', error);
              toast({
                title: "Speech Error",
                description: "Failed to speak AI line",
                variant: "destructive",
              });
            }
          }
          
          // If this is an actor line, start listening for cue
          if (line?.type === 'actor' && voiceActivated) {
            const cueWords = stateMachineRef.current?.getCurrentCueWords() || [];
            if (cueWords.length > 0) {
              audioManager.startListeningForCue(cueWords.join(' '));
            }
          }
        },
        onCueWordsChange: (cueWords) => {
          console.log('🎤 Cue words changed:', cueWords);
          setCurrentCueWords(cueWords);
        },
        onComplete: () => {
          console.log('🎯 Rehearsal complete!');
          setRehearsalMode(false);
          toast({
            title: "Rehearsal Complete",
            description: "You've reached the end of the script.",
          });
        },
        onError: (error) => {
          console.error('State machine error:', error);
          toast({
            title: "Rehearsal Error",
            description: error,
            variant: "destructive",
          });
        }
      });

      // Start the rehearsal
      stateMachineRef.current.start();
    } else if (!rehearsalMode && stateMachineRef.current) {
      console.log('🛑 Stopping State Machine');
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
      setRehearsalState('IDLE');
      setCurrentCueWords([]);
    }
  }, [rehearsalMode, scriptContent, characters, textFilter]);

  // Master stop function for all AI operations
  const handleMasterStop = () => {
    console.log('🛑 Master stop - halting all operations');
    setIsPlaying(false);
    setRehearsalMode(false);
    audioManager.stopAll();
    if (stateMachineRef.current) {
      stateMachineRef.current.stop();
      stateMachineRef.current = null;
    }
  };

  // Handle TTS for standalone usage (non-rehearsal)
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

  // Handle actor line detection (for backward compatibility, but now handled by state machine)
  const handleActorLineDetected = (line: string) => {
    if (!voiceActivated || !audioManager.isSpeechSupported || audioManager.isListening) return;
    
    setCurrentActorLine(line);
    
    // Start listening for cue in the line
    const characterMatch = line.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
    if (characterMatch) {
      const dialogue = characterMatch[2].trim();
      console.log(`Starting to listen for cue in: "${dialogue}"`);
      audioManager.startListeningForCue(dialogue);
    }
  };

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

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Load voices on component mount
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

  useEffect(() => {
    if (scriptId && user) {
      fetchScript();
    }
  }, [scriptId, user]);

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto-scroll functionality
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const scrollTop = container.scrollTop;
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;
          
          if (scrollTop < scrollHeight - clientHeight) {
            container.scrollTop += scrollSpeed[0];
            setCurrentPosition((scrollTop / (scrollHeight - clientHeight)) * 100);
          } else {
            // Reached end
            setIsPlaying(false);
          }
        }
      }, 50);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, scrollSpeed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if user is currently editing in the script editor
      const activeElement = document.activeElement;
      const isEditingScript = activeElement?.closest('[data-tiptap-editor]') || 
                             activeElement?.tagName === 'INPUT' || 
                             activeElement?.tagName === 'TEXTAREA' ||
                             (activeElement as HTMLElement)?.contentEditable === 'true';
      
      // If editing, don't handle keyboard shortcuts
      if (isEditingScript) {
        return;
      }

      if (e.code === 'Space' && !e.shiftKey) {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'Space' && e.shiftKey) {
        // Shift+Space for TTS
        e.preventDefault();
        if (rehearsalMode) {
          setRehearsalMode(false);
        } else {
          handleTTSPlay();
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setScrollSpeed([Math.min(5, scrollSpeed[0] + 0.5)]);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setScrollSpeed([Math.max(0.5, scrollSpeed[0] - 0.5)]);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [scrollSpeed, isPlaying, audioManager.isTTSPlaying, rehearsalMode]);

  const fetchScript = async () => {
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', scriptId)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setScript(data);
      setScriptContent(data.content);
      // Parse characters data safely
      const charactersData = Array.isArray(data.characters) ? data.characters : [];
      const parsedCharacters: Character[] = charactersData.map((char: any) => ({
        name: char?.name || '',
        voice: char?.voice || '9BWtsMINqrJLrRacOk9x',
        isUserRole: char?.isUserRole || false
      }));
      setCharacters(parsedCharacters);
    } catch (error) {
      console.error('Error fetching script:', error);
      toast({
        title: "Error",
        description: "Failed to load script",
        variant: "destructive",
      });
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Handle script rehearsal play/pause (master control)
  const handlePlayPause = () => {
    if (voiceActivated) {
      // Toggle rehearsal mode when voice activation is enabled
      setRehearsalMode(!rehearsalMode);
    } else {
      // Toggle regular script scrolling when voice activation is disabled
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentPosition(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleScriptUpdate = (updatedContent: string) => {
    // Auto-stop TTS when script is edited
    if (audioManager.isTTSPlaying) {
      audioManager.stopTTS();
    }
    
    // Stop voice recognition when editing
    if (audioManager.isListening) {
      audioManager.stopListening();
      setCurrentActorLine(null);
    }
    
    setScriptContent(updatedContent);
    if (script) {
      setScript({ ...script, content: updatedContent });
    }
  };

  const handleAutoSave = (success: boolean) => {
    if (success) {
      // Optionally show a subtle success indicator
    } else {
      toast({
        title: "Auto-save Error",
        description: "Failed to save changes automatically. Please try manual save.",
        variant: "destructive",
      });
    }
  };

  const handleRoleUpdate = (updatedCharacters: Character[]) => {
    setCharacters(updatedCharacters);
    if (script) {
      // Update the script's characters in the database
      supabase
        .from('scripts')
        .update({ characters: updatedCharacters as any })
        .eq('id', script.id)
        .then(({ error }) => {
          if (error) {
            console.error('Error updating characters:', error);
          }
        });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Loading script...</p>
        </div>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Script not found</p>
          <Button onClick={() => navigate('/')} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header - Hidden in fullscreen */}
      {!isFullscreen && (
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-4 md:gap-8">
              <div className="flex items-center gap-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/">Scripts</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="truncate max-w-[120px] md:max-w-[200px]">
                        {script.title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              
              {sessionTime > 0 && (
                <div className="text-sm text-muted-foreground font-mono hidden sm:block">
                  Session: {formatTime(sessionTime)}
                </div>
              )}
              
              <div className="flex items-center gap-2 md:gap-4">
                <ThemeToggle />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/')}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className={`flex ${isFullscreen ? 'h-screen' : 'h-[calc(100vh-73px)]'}`}>
        {/* Script Content */}
        <div className="flex-1 relative">
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
            <div 
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${currentPosition}%` }}
            />
          </div>

          {/* Script Editor */}
          <div 
            ref={scrollContainerRef}
            className="h-full overflow-y-auto"
          >
            <div className="max-w-4xl mx-auto p-4">
              {script && (
                <InlineScriptEditor
                  scriptId={script.id}
                  content={scriptContent}
                  characters={characters}
                  fontSize={fontSize[0]}
                  onContentChange={handleScriptUpdate}
                  onAutoSave={handleAutoSave}
                />
              )}
              <div className="h-96" /> {/* Bottom padding for scrolling */}
            </div>
          </div>

          {/* Mobile Controls Drawer */}
          <div className="block sm:hidden">
            <MobileControlsDrawer
              // Script controls
              isPlaying={voiceActivated ? rehearsalMode : isPlaying}
              scrollSpeed={scrollSpeed}
              fontSize={fontSize}
              isFullscreen={isFullscreen}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onScrollSpeedChange={setScrollSpeed}
              onFontSizeChange={setFontSize}
              onToggleFullscreen={toggleFullscreen}
              
              // Voice controls
              selectedVoice={selectedVoice}
              voices={voices}
              textFilter={textFilter}
              voiceActivated={voiceActivated}
              playbackSpeed={playbackSpeed}
              onVoiceChange={setSelectedVoice}
              onTextFilterChange={setTextFilter}
              onVoiceActivatedChange={setVoiceActivated}
              onPlaybackSpeedChange={setPlaybackSpeed}
              isTTSPlaying={audioManager.isTTSPlaying}
              onTTSPlay={handleTTSPlay}
              
              // Status
              isListening={audioManager.isListening}
              waitingForActor={rehearsalState === 'WAITING_FOR_ACTOR_CUE'}
            />
          </div>

          {/* Desktop Controls */}
          <div className="hidden sm:block absolute bottom-4 left-4 right-4">
            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-6">
                  {/* Rehearse Script Section */}
                  <div className="flex flex-col gap-3 min-w-[200px]">
                    <ScriptControls
                      isPlaying={voiceActivated ? rehearsalMode : isPlaying}
                      scrollSpeed={scrollSpeed}
                      fontSize={fontSize}
                      isFullscreen={isFullscreen}
                      onPlayPause={handlePlayPause}
                      onReset={handleReset}
                      onScrollSpeedChange={setScrollSpeed}
                      onFontSizeChange={setFontSize}
                      onToggleFullscreen={toggleFullscreen}
                       onMasterStop={handleMasterStop}
                       showMasterStop={voiceActivated && rehearsalMode}
                       rehearsalState={voiceActivated ? rehearsalState : undefined}
                       cueWords={voiceActivated ? currentCueWords : []}
                    />
                  </div>

                  {/* Visual Separator */}
                  <Separator orientation="vertical" className="h-24 mx-3" />

                  {/* AI Reader Voice Selection Section */}
                  <div className="flex flex-col gap-3 flex-1">
                    <VoiceControls
                      selectedVoice={selectedVoice}
                      voices={voices}
                      textFilter={textFilter}
                      voiceActivated={voiceActivated}
                      playbackSpeed={playbackSpeed}
                      onVoiceChange={setSelectedVoice}
                      onTextFilterChange={setTextFilter}
                      onVoiceActivatedChange={setVoiceActivated}
                      onPlaybackSpeedChange={setPlaybackSpeed}
                      isPlaying={audioManager.isTTSPlaying}
                      onTTSPlay={handleTTSPlay}
                    />

                    {/* Voice Activation Status */}
                    {audioManager.isListening && (
                      <div className="text-center">
                        <span className="text-xs text-muted-foreground animate-pulse">
                          {rehearsalState === 'WAITING_FOR_ACTOR_CUE' ? 'Still listening...' : 'Listening...'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Script Speed Control Slider - Only show when not using voice activation */}
                {!voiceActivated && (
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                    <Label className="text-sm whitespace-nowrap">Scroll Speed:</Label>
                    <div className="flex-1">
                      <Slider
                        value={scrollSpeed}
                        onValueChange={setScrollSpeed}
                        max={5}
                        min={0.5}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                     <span className="text-sm text-muted-foreground w-12 text-center font-mono">
                       {scrollSpeed[0]}x
                     </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>


      {/* TTS Visual Indicator */}
      {audioManager.isTTSPlaying && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground px-3 py-2 rounded-full text-sm font-medium shadow-lg animate-pulse z-50">
          🔊 {rehearsalMode ? 'Rehearsal Mode' : 'AI Reading...'}
        </div>
      )}

      {/* Rehearsal Status Indicator */}
      {rehearsalMode && rehearsalState === 'WAITING_FOR_ACTOR_CUE' && (
        <div className="fixed top-16 right-4 bg-orange-500 text-white px-3 py-2 rounded-full text-sm font-medium shadow-lg z-50">
          🎭 Your turn to speak
        </div>
      )}

      {/* Actor Line Detector for Voice Activation */}
      <ActorLineDetector
        scriptContent={scriptContent}
        characters={characters}
        voiceActivated={voiceActivated}
        isSupported={audioManager.isSpeechSupported}
        onActorLineDetected={handleActorLineDetected}
      />
    </div>
  );
};

export default Practice;