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
import { RehearsalProvider, useRehearsal } from '@/contexts/RehearsalContext';

interface Script {
  id: string;
  title: string;
  content: string;
  characters: any;
  created_at: string;
  updated_at: string;
  user_id: string;
}

import type { Character } from '@/services/ScriptRehearsalStateMachine';

// Component that contains all rehearsal logic and UI - must be inside RehearsalProvider
const PracticeWithRehearsal = ({ script }: { script: Script }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState([2]);
  const [fontSize, setFontSize] = useState([18]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  
  const [currentActorLine, setCurrentActorLine] = useState<string | null>(null);
  const [scriptContent, setScriptContent] = useState('');

  // Get rehearsal context - this is now safely inside RehearsalProvider
  const { 
    rehearsalMode, 
    setRehearsalMode, 
    handleMasterStop: contextMasterStop,
    handleTTSPlay: contextTTSPlay,
    textFilter,
    setTextFilter,
    noMatchesBanner,
    selectedVoice,
    playbackSpeed,
    voiceActivated,
    setVoiceActivated,
    isTTSPlaying,
    isListening,
    rehearsalState,
    handleActorLineDetected: contextHandleActorLineDetected,
    initialize
  } = useRehearsal();

  // Initialize script content and characters
  useEffect(() => {
    if (script) {
      setScriptContent(script.content);
      const charactersData = Array.isArray(script.characters) ? script.characters : [];
      const parsedCharacters: Character[] = charactersData.map((char: any) => ({
        name: char?.name || '',
        voice: char?.voice || '9BWtsMINqrJLrRacOk9x',
        isUserRole: char?.isUserRole || false
      }));
      setCharacters(parsedCharacters);
      
      // Initialize rehearsal context
      if (script.content && parsedCharacters.length > 0) {
        initialize(script.content, parsedCharacters);
      }
    }
  }, [script, initialize]);

  // Master stop function for all AI operations
  const handleMasterStop = () => {
    console.log('🛑 Master stop - halting all operations');
    setIsPlaying(false);
    contextMasterStop();
  };

  // Handle actor line detection (for backward compatibility, but now handled by state machine)
  const handleActorLineDetected = (line: string) => {
    setCurrentActorLine(line);
    contextHandleActorLineDetected(line);
  };

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
          contextTTSPlay();
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
  }, [scrollSpeed, isPlaying, rehearsalMode, contextTTSPlay]);

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
    if (isTTSPlaying) {
      contextMasterStop();
    }
    
    // Stop voice recognition when editing
    if (isListening) {
      contextMasterStop();
      setCurrentActorLine(null);
    }
    
    setScriptContent(updatedContent);
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
  };

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
              {/* No Matches Banner */}
              {noMatchesBanner?.show && (
                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="text-yellow-600 dark:text-yellow-400">⚠️</div>
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        No {noMatchesBanner.filter} text found
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        AI will remain silent until you change the filter or add {noMatchesBanner.filter} text to your script.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <InlineScriptEditor
                scriptId={script.id}
                content={scriptContent}
                characters={characters}
                fontSize={fontSize[0]}
                onContentChange={handleScriptUpdate}
                onAutoSave={handleAutoSave}
              />
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
                    />
                  </div>

                  {/* Visual Separator */}
                  <Separator orientation="vertical" className="h-24 mx-3" />

                  {/* AI Reader Voice Selection Section */}
                  <div className="flex flex-col gap-3 flex-1">
                    <VoiceControls />

                    {/* Voice Activation Status */}
                    {isListening && (
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
      {isTTSPlaying && (
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
        isSupported={true}
        onActorLineDetected={handleActorLineDetected}
      />
    </div>
  );
};

const Practice = () => {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (scriptId && user) {
      fetchScript();
    }
  }, [scriptId, user]);

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
    <RehearsalProvider>
      <PracticeWithRehearsal script={script} />
    </RehearsalProvider>
  );
};

export default Practice;