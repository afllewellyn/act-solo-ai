
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRehearsal } from '@/contexts/RehearsalContext';
import { 
  Settings,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Minimize,
  Volume2,
  ChevronDown,
  Filter,
  Mic,
  MicOff,
  Smartphone,
  Monitor,
  Square
} from 'lucide-react';


interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

type TextFilter = 'all' | 'italic';
type RehearsalState = 'IDLE' | 'WAITING_FOR_ACTOR_CUE' | 'AI_SPEAKING' | 'TRANSITIONING' | 'COMPLETE';

interface MobileControlsDrawerProps {
  // Script controls
  isRehearsalActive: boolean;
  scrollSpeed: number[];
  fontSize: number[];
  isFullscreen: boolean;
  onStartStopRehearsal: () => void;
  onReset: () => void;
  onScrollSpeedChange: (value: number[]) => void;
  onFontSizeChange: (value: number[]) => void;
  onToggleFullscreen: () => void;
  characters?: Character[];
  onRoleUpdate?: (characters: Character[]) => void;
  scriptContent?: string;
  
  // Voice control props
  voices?: Voice[];
  selectedVoice?: string;
  onVoiceChange?: (voiceId: string) => void;
  textFilter?: TextFilter;
  onTextFilterChange?: (filter: TextFilter) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  voiceActivated?: boolean;
  onVoiceActivatedChange?: (activated: boolean) => void;
  isListening?: boolean;
  isTTSPlaying?: boolean;
  isManualTTSPlaying?: boolean;
  rehearsalState?: RehearsalState;
  onTTSPlay?: () => void;
  
  // Audio manager props
  isMobile?: boolean;
  needsUserGesture?: boolean;
  waitingForUserTrigger?: boolean;
  onEnableAudio?: () => void;
  onManualTriggerListen?: () => void;
}

export function MobileControlsDrawer({
  // Script controls
  isRehearsalActive,
  scrollSpeed,
  fontSize,
  isFullscreen,
  onStartStopRehearsal,
  onReset,
  onScrollSpeedChange,
  onFontSizeChange,
  onToggleFullscreen,
  characters = [],
  onRoleUpdate,
  scriptContent = '',
  
  // Voice control props
  voices = [],
  selectedVoice = '',
  onVoiceChange,
  textFilter = 'all',
  onTextFilterChange,
  playbackSpeed = 1,
  onPlaybackSpeedChange,
  voiceActivated = false,
  onVoiceActivatedChange,
  isListening = false,
  isTTSPlaying = false,
  isManualTTSPlaying = false,
  rehearsalState = 'IDLE',
  onTTSPlay,
  
  // Audio manager props
  isMobile = true,
  needsUserGesture = false,
  waitingForUserTrigger = false,
  onEnableAudio,
  onManualTriggerListen
}: MobileControlsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isPaused, handlePause, handleResume } = useRehearsal();
  const filterOptions = [
    { value: 'italic' as const, label: 'Italic' },
    { value: 'all' as const, label: 'Full Script' },
  ];

  // Available playback speeds for TTS (0.5x to 2x)
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <Button 
            size={isFullscreen ? "default" : "lg"} 
            className={`rounded-full shadow-lg transition-all duration-300 ${
              isFullscreen ? 'bg-background/70 backdrop-blur-md' : ''
            }`}
            aria-label="Open practice controls"
          >
            <Settings className={isFullscreen ? "h-4 w-4" : "h-5 w-5"} />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <div className="p-4 space-y-4 overflow-y-auto">
            <h3 className="text-lg font-semibold text-center">Practice Controls</h3>
            
            {/* Rehearsal Controls */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Script Controls</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={onStartStopRehearsal}
                  variant={isRehearsalActive ? "destructive" : "default"}
                  size="sm"
                  className="flex-1"
                >
                  {isRehearsalActive ? (
                    <>
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </>
                  )}
                </Button>
                
                <Button onClick={onReset} variant="outline" size="sm" className="flex-1">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                
                {/* Pause/Resume Button - Only show during active rehearsal */}
                {isRehearsalActive ? (
                  <Button
                    variant={isPaused ? "default" : "outline"}
                    size="sm"
                    onClick={isPaused ? handleResume : handlePause}
                    className="flex-1"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        Pause
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={onToggleFullscreen} variant="outline" size="sm" className="flex-1">
                    {isFullscreen ? (
                      <>
                        <Minimize className="h-3 w-3 mr-1" />
                        Exit
                      </>
                    ) : (
                      <>
                        <Maximize className="h-3 w-3 mr-1" />
                        Full
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Voice Controls Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                AI Voice Controls
              </Label>
              
              {/* Voice Selection */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Voice Selection</Label>
                <Select value={selectedVoice} onValueChange={onVoiceChange}>
                  <SelectTrigger className="bg-background border-border">
                    <div className="flex items-center">
                      <Volume2 className="h-4 w-4" />
                      <SelectValue placeholder="Select Voice" className="ml-1">
                        <span className="ml-1 truncate">
                          {voices.find(v => v.id === selectedVoice)?.name || 'Voice'}
                        </span>
                      </SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-48 bg-background border-border shadow-lg">
                    {voices.length > 0 ? (
                      voices.map((voice) => (
                        <SelectItem 
                          key={voice.id}
                          value={voice.id}
                          className="cursor-pointer p-2"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{voice.name}</span>
                            <span className="text-xs text-muted-foreground">{voice.gender} • {voice.accent}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-voices" disabled>
                        No voices available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Text Filter and TTS Button */}
              <div className="grid grid-cols-2 gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Filter className="h-3 w-3" />
                      <span className="ml-1 truncate text-xs">
                        {filterOptions.find(f => f.value === textFilter)?.label || 'Read'}
                      </span>
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-40 bg-background border-border shadow-lg z-50">
                    <div className="p-1">
                      {filterOptions.map((option) => (
                        <DropdownMenuItem 
                          key={option.value}
                          onClick={() => onTextFilterChange?.(option.value)}
                          className={`cursor-pointer text-xs ${textFilter === option.value ? 'bg-accent' : ''}`}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex gap-1">
                  <Button
                    variant={isManualTTSPlaying ? "destructive" : "default"}
                    size="sm"
                    onClick={onTTSPlay}
                    className="flex-1"
                    disabled={rehearsalState !== 'IDLE'}
                  >
                    <Volume2 className="h-3 w-3" />
                    <span className="ml-1 text-xs">{isManualTTSPlaying ? 'Stop' : 'Read'}</span>
                  </Button>
                  
                  {needsUserGesture && (
                    <Button 
                      onClick={onEnableAudio}
                      variant="outline"
                      size="sm"
                      className="px-2"
                      aria-label="Enable audio playback"
                    >
                      <Volume2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Playback Speed Control */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Playback Speed</Label>
                <div className="grid grid-cols-4 gap-1">
                  {speedOptions.map((speed) => (
                    <Button
                      key={speed}
                      variant={playbackSpeed === speed ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPlaybackSpeedChange?.(speed)}
                      className="text-xs px-1 py-1 h-7"
                    >
                      {speed}x
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Voice Activation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  Voice Activation
                  {/* Device Type Indicator */}
                  {isMobile ? (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Smartphone className="h-3 w-3" />
                      Mobile
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      Desktop
                    </Badge>
                  )}
                </Label>
                <Switch
                  checked={voiceActivated}
                  onCheckedChange={onVoiceActivatedChange}
                  disabled={rehearsalState !== 'IDLE'}
                />
              </div>

              {/* Voice Status Indicators */}
              <div className="flex flex-wrap gap-1">
                {voiceActivated && isListening && (
                  <Badge variant="default" className="text-xs flex items-center gap-1 animate-pulse bg-green-600 hover:bg-green-700">
                    <Mic className="h-3 w-3" />
                    Listening
                  </Badge>
                )}
                {voiceActivated && !isListening && rehearsalState === 'WAITING_FOR_ACTOR_CUE' && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <MicOff className="h-3 w-3" />
                    Voice Ready
                  </Badge>
                )}
                {needsUserGesture && (
                  <Badge variant="destructive" className="text-xs flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    Audio Blocked
                  </Badge>
                )}
              </div>

              {/* Mobile-specific Tap to Listen Button */}
              {voiceActivated && isMobile && waitingForUserTrigger && (
                <Button
                  onClick={onManualTriggerListen}
                  variant="default"
                  size="sm"
                  className="w-full animate-pulse bg-green-600 hover:bg-green-700"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Tap to Listen
                </Button>
              )}
              
              {voiceActivated && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isListening 
                    ? `🎤 Listening for your cues...` 
                    : waitingForUserTrigger && isMobile
                      ? "📱 Ready - tap the button above when ready to speak"
                    : needsUserGesture 
                      ? "⚠️ Tap 'Enable Audio' to allow audio playback" 
                      : `📱 Mobile mode - tap to listen when prompted`}
                </p>
              )}
            </div>

            <Separator />

            {/* Script Speed and Font Size */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Display Settings</Label>
              
              {/* Scroll Speed */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Scroll Speed: {scrollSpeed[0]}x</Label>
                <Slider
                  value={scrollSpeed}
                  onValueChange={onScrollSpeedChange}
                  max={5}
                  min={0.5}
                  step={0.5}
                  className="w-full"
                />
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Font Size: {fontSize[0]}px</Label>
                <Slider
                  value={fontSize}
                  onValueChange={onFontSizeChange}
                  max={24}
                  min={12}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
