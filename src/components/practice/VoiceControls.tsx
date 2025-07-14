import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Volume2, ChevronDown, Filter } from 'lucide-react';

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

type TextFilter = 'all' | 'bold' | 'italic' | 'characters';

interface VoiceControlsProps {
  selectedVoice: string;
  voices: Voice[];
  textFilter: TextFilter;
  voiceActivated: boolean;
  playbackSpeed: number;
  onVoiceChange: (voiceId: string) => void;
  onTextFilterChange: (filter: TextFilter) => void;
  onVoiceActivatedChange: (activated: boolean) => void;
  onPlaybackSpeedChange: (speed: number) => void;
  isPlaying: boolean;
  onTTSPlay: () => void;
}

export const VoiceControls = ({
  selectedVoice,
  voices,
  textFilter,
  voiceActivated,
  playbackSpeed,
  onVoiceChange,
  onTextFilterChange,
  onVoiceActivatedChange,
  onPlaybackSpeedChange,
  isPlaying,
  onTTSPlay,
}: VoiceControlsProps) => {
  const filterOptions = [
    { value: 'all' as const, label: 'All Text' },
    { value: 'bold' as const, label: 'Bold Text Only' },
    { value: 'italic' as const, label: 'Italic Text Only' },
    { value: 'characters' as const, label: 'Character Dialogue' },
  ];

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        AI Reader Voice Selection
      </Label>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 bg-background border-border" aria-label="Select voice for text-to-speech">
              <Volume2 className="h-4 w-4" />
              <span className="ml-1 truncate">
                {voices.find(v => v.id === selectedVoice)?.name || 'Voice'}
              </span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-background border-border shadow-lg z-50">
            <div className="p-2">
              <p className="text-xs text-muted-foreground mb-2">Select Voice:</p>
              {voices.length > 0 ? (
                voices.map((voice) => (
                  <DropdownMenuItem 
                    key={voice.id}
                    onClick={() => onVoiceChange(voice.id)}
                    className={`cursor-pointer p-2 rounded text-sm hover:bg-accent ${selectedVoice === voice.id ? 'bg-accent' : ''}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{voice.name}</span>
                      <span className="text-xs text-muted-foreground">{voice.gender} • {voice.accent}</span>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="p-2 text-xs text-muted-foreground">No voices available</div>
              )}
            </div>
            
            <DropdownMenuSeparator />
            
            <div className="p-2">
              <p className="text-xs text-muted-foreground mb-2">Playback Speed:</p>
              <div className="grid grid-cols-4 gap-1">
                {speedOptions.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onPlaybackSpeedChange(speed)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      playbackSpeed === speed 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted hover:bg-accent'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1" aria-label="Filter text to read">
              <Filter className="h-4 w-4" />
              <span className="ml-1 truncate">
                {filterOptions.find(f => f.value === textFilter)?.label || 'Read'}
              </span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-background border-border shadow-lg z-50">
            <div className="p-1">
              {filterOptions.map((option) => (
                <DropdownMenuItem 
                  key={option.value}
                  onClick={() => onTextFilterChange(option.value)}
                  className={`cursor-pointer text-sm ${textFilter === option.value ? 'bg-accent' : ''}`}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={isPlaying ? "destructive" : "default"}
          size="sm"
          onClick={onTTSPlay}
          className="flex-1"
          aria-label={isPlaying ? 'Stop speech' : 'Start speech'}
        >
          <Volume2 className="h-4 w-4" />
          <span className="ml-1">{isPlaying ? 'Stop' : 'Speak'}</span>
        </Button>
      </div>

      {/* Voice Activation */}
      <div className="flex items-center justify-between">
        <Label htmlFor="voice-activation" className="text-sm">Voice Activation</Label>
        <Switch
          id="voice-activation"
          checked={voiceActivated}
          onCheckedChange={onVoiceActivatedChange}
        />
      </div>
    </div>
  );
};