import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Volume2, ChevronDown, Filter } from 'lucide-react';

/**
 * Voice data structure for ElevenLabs TTS voices
 */
interface Voice {
  id: string; // ElevenLabs voice ID
  name: string; // Display name for the voice
  category: string; // Voice category/type
  gender: string; // Voice gender
  accent: string; // Voice accent/language
}

/**
 * Text filter options for reading different parts of the script
 */
type TextFilter = 'all' | 'bold' | 'italic';

/**
 * Props for VoiceControls component
 * Manages AI voice selection, text filtering, playback speed, and voice activation
 */
interface VoiceControlsProps {
  selectedVoice: string; // Currently selected ElevenLabs voice ID
  voices: Voice[]; // Available voices from ElevenLabs API
  textFilter: TextFilter; // Current text filter setting
  voiceActivated: boolean; // Whether voice activation (rehearsal mode) is enabled
  playbackSpeed: number; // TTS playback speed (0.5x - 2x)
  onVoiceChange: (voiceId: string) => void; // Callback when voice selection changes
  onTextFilterChange: (filter: TextFilter) => void; // Callback when text filter changes
  onVoiceActivatedChange: (activated: boolean) => void; // Callback when voice activation toggles
  onPlaybackSpeedChange: (speed: number) => void; // Callback when playback speed changes
  isPlaying: boolean; // Whether TTS is currently playing
  onTTSPlay: () => void; // Callback to start/stop TTS playback
}

/**
 * VoiceControls Component
 * 
 * Provides controls for AI voice selection, text filtering, playback speed,
 * and voice activation (rehearsal mode) toggle. Includes dropdown menus for
 * voice selection and text filtering, plus a switch for voice activation.
 */
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
  // Available text filter options for reading different parts of the script
  const filterOptions = [
    { value: 'all' as const, label: 'All Text' },
    { value: 'bold' as const, label: 'Bold Text Only' },
    { value: 'italic' as const, label: 'Italic Text Only' },
  ];

  // Available playback speeds for TTS (0.5x to 2x)
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  
  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        AI Reader Voice Selection
      </Label>
      
      {/* Voice and Filter Controls */}
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

      {/* Playback Speed Control - Moved outside dropdown for better UX */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Speed:</Label>
        <div className="grid grid-cols-4 gap-1">
          {speedOptions.map((speed) => (
            <Button
              key={speed}
              variant={playbackSpeed === speed ? "default" : "outline"}
              size="sm"
              onClick={() => onPlaybackSpeedChange(speed)}
              className="text-xs px-2 py-1 h-8"
            >
              {speed}x
            </Button>
          ))}
        </div>
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