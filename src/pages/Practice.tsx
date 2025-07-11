import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTTS } from '@/hooks/useTTS';
import { ScriptEditor } from '@/components/ScriptEditor';
import { RoleAssignmentDialog } from '@/components/RoleAssignmentDialog';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ArrowLeft, 
  Maximize, 
  Minimize,
  Volume2,
  Settings,
  Plus,
  Minus
} from 'lucide-react';
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

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

const Practice = () => {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { speak, pause: pauseTTS, resume: resumeTTS, stop: stopTTS, isPlaying: isTTSPlaying, isLoading: isTTSLoading } = useTTS();
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
  
  const [scriptContent, setScriptContent] = useState('');

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
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setScrollSpeed([Math.min(10, scrollSpeed[0] + 0.5)]);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setScrollSpeed([Math.max(0.5, scrollSpeed[0] - 0.5)]);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [scrollSpeed, isPlaying]);

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

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
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

  const handleTTSPlay = async () => {
    if (!script) return;
    
    const lines = scriptContent.split('\n').filter(line => line.trim());
    if (lines[currentLine]) {
      const currentLineText = lines[currentLine];
      
      // Check if this line belongs to a character
      const characterMatch = currentLineText.match(/^([A-Z][A-Z\s\-\'\.]+):/);
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const character = characters.find(c => c.name === characterName);
        
        if (character && !character.isUserRole) {
          // Use the character's assigned voice
          await speak(currentLineText, {
            voiceId: character.voice,
            onComplete: () => {
              if (currentLine < lines.length - 1) {
                setCurrentLine(prev => prev + 1);
              }
            }
          });
          return;
        } else if (character && character.isUserRole) {
          // Skip user lines and move to next
          if (currentLine < lines.length - 1) {
            setCurrentLine(prev => prev + 1);
          }
          return;
        }
      }
      
      // If no character detected, speak the line with default voice
      await speak(currentLineText, {
        voiceId: selectedVoice,
        onComplete: () => {
          if (currentLine < lines.length - 1) {
            setCurrentLine(prev => prev + 1);
          }
        }
      });
    }
  };

  const handleScriptUpdate = (updatedContent: string) => {
    setScriptContent(updatedContent);
    if (script) {
      setScript({ ...script, content: updatedContent });
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

  const voices = [
    { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (Female)' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Male)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (Female)' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Male)' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Male)' },
  ];

  const renderScriptContent = () => {
    if (!script) return null;

    // Split content by lines and render with character highlighting
    const lines = scriptContent.split('\n');
    
    return lines.map((line, index) => {
      let styledLine = line;
      const isCurrentLine = index === currentLine && (isTTSPlaying || isPlaying);
      
      // Apply character highlighting
      characters.forEach((char, charIndex) => {
        if (char.name && line.includes(char.name + ':')) {
          const colors = [
            'text-blue-500',
            'text-green-500', 
            'text-purple-500', 
            'text-orange-500',
            'text-red-500',
            'text-indigo-500'
          ];
          const colorClass = colors[charIndex % colors.length];
          
          // Add role indicator
          const roleIndicator = char.isUserRole ? ' (You)' : ' (AI)';
          styledLine = line.replace(
            char.name + ':',
            `<span class="${colorClass} font-semibold">${char.name}${roleIndicator}:</span>`
          );
        }
      });
      
      return (
        <p 
          key={index} 
          className={`mb-4 leading-relaxed transition-all duration-200 ${
            isCurrentLine ? 'bg-primary/10 border-l-4 border-primary pl-4 -ml-4 shadow-sm' : ''
          }`}
          style={{ fontSize: `${fontSize[0]}px` }}
          dangerouslySetInnerHTML={{ __html: styledLine }}
        />
      );
    });
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
            <div className="flex items-center justify-between">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/">Scripts</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Practice: {script.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden md:inline">Session: {formatTime(sessionTime)}</span>
                <span className="md:hidden">⏱ {formatTime(sessionTime)}</span>
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
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

          {/* Script Text */}
          <div 
            ref={scrollContainerRef}
            className="h-full overflow-y-auto p-8 pt-12 text-foreground"
            style={{ lineHeight: '1.8' }}
          >
            <div className="max-w-4xl mx-auto">
              {renderScriptContent()}
              <div className="h-96" /> {/* Bottom padding for scrolling */}
            </div>
          </div>

          {/* Floating Controls */}
          <div className="absolute bottom-4 sm:bottom-6 left-4 right-4">
            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="p-3 sm:p-4">
                {/* Script Management Row */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-4 pb-4 border-b">
                  {script && (
                    <>
                      <ScriptEditor
                        script={script}
                        onScriptUpdate={handleScriptUpdate}
                      />
                      <RoleAssignmentDialog
                        characters={characters}
                        onRoleUpdate={handleRoleUpdate}
                        content={scriptContent}
                      />
                    </>
                  )}
                </div>

                {/* Control Buttons - Evenly Distributed */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
                  {/* Basic Controls */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlayPause}
                    className="flex-1"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">
                      {isPlaying ? 'Pause' : 'Play'}
                    </span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Reset</span>
                  </Button>

                  {/* TTS Control */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTTSPlay}
                    disabled={isTTSLoading}
                    className="flex-1"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">
                      {isTTSLoading ? 'Loading...' : 'Speak'}
                    </span>
                  </Button>

                  {/* Font Size Controls */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFontSize([Math.max(12, fontSize[0] - 2)])}
                    className="flex-1"
                  >
                    <Minus className="h-4 w-4" />
                    <span className="ml-1 hidden lg:inline">Size</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFontSize([Math.min(32, fontSize[0] + 2)])}
                    className="flex-1"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="ml-1 hidden lg:inline">Size</span>
                  </Button>

                  {/* Speed Display */}
                  <div className="flex items-center justify-center px-2 py-1 bg-muted rounded text-sm">
                    <span className="font-mono">{scrollSpeed[0]}x</span>
                  </div>

                  {/* Fullscreen Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="flex-1"
                  >
                    {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">
                      {isFullscreen ? 'Exit' : 'Full'}
                    </span>
                  </Button>
                </div>

                {/* Speed Control Slider */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                  <Label className="text-sm whitespace-nowrap">Speed:</Label>
                  <div className="flex-1">
                    <Slider
                      value={scrollSpeed}
                      onValueChange={setScrollSpeed}
                      max={10}
                      min={0.5}
                      step={0.5}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-center font-mono">
                    {fontSize[0]}px
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      {!isFullscreen && (
        <div className="fixed bottom-4 right-4 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm p-2 rounded border max-w-xs">
          <div className="hidden sm:block">Space: Play/Pause • R: Reset • F: Fullscreen</div>
          <div className="hidden sm:block">↑/↓: Speed • Mouse: Manual scroll</div>
          <div className="sm:hidden">Space: Play • R: Reset • F: Full</div>
        </div>
      )}
    </div>
  );
};

export default Practice;