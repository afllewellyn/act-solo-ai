import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Volume2, ChevronDown, Filter, Mic, MicOff } from 'lucide-react';
import { useRehearsal } from '@/contexts/RehearsalContext';

export const VoiceControls = () => {
  const { 
    selectedVoice, 
    voiceActivated, 
    playbackSpeed, 
    textFilter, 
    isTTSPlaying,
    isManualTTSPlaying,
    isListening,
    voices,
    rehearsalState,
    audioManager,
    setSelectedVoice,
    setVoiceActivated,
    setPlaybackSpeed,
    setTextFilter,
    handleTTSPlay
  } = useRehearsal();
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
                    onClick={() => setSelectedVoice(voice.id)}
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
                  onClick={() => setTextFilter(option.value)}
                  className={`cursor-pointer text-sm ${textFilter === option.value ? 'bg-accent' : ''}`}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-1 gap-1">
          <Button
            variant={isManualTTSPlaying ? "destructive" : "default"}
            size="sm"
            onClick={handleTTSPlay}
            className="flex-1"
            disabled={rehearsalState !== 'IDLE'}
            aria-label={isManualTTSPlaying ? 'Stop speech' : 'Read script'}
          >
            <Volume2 className="h-4 w-4" />
            <span className="ml-1">{isManualTTSPlaying ? 'Stop' : 'Read Script'}</span>
          </Button>
          
          {audioManager?.needsUserGesture && (
            <Button 
              onClick={audioManager.enableAudio}
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

      {/* Playback Speed Control - Moved outside dropdown for better UX */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Speed:</Label>
        <div className="grid grid-cols-4 gap-1">
          {speedOptions.map((speed) => (
            <Button
              key={speed}
              variant={playbackSpeed === speed ? "default" : "outline"}
              size="sm"
              onClick={() => setPlaybackSpeed(speed)}
              className="text-xs px-2 py-1 h-8"
            >
              {speed}x
            </Button>
          ))}
        </div>
      </div>

      {/* Voice Activation with Listening Status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice-activation" className="text-sm">Voice Activation</Label>
          <div className="flex items-center gap-2">
            {/* Mic Listening Active Badge */}
            {voiceActivated && isListening && (
              <Badge variant="default" className="text-xs flex items-center gap-1 animate-pulse bg-green-600 hover:bg-green-700">
                <Mic className="h-3 w-3" />
                Mic Listening Active
              </Badge>
            )}
            {voiceActivated && !isListening && rehearsalState === 'WAITING_FOR_ACTOR_CUE' && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <MicOff className="h-3 w-3" />
                Voice Ready
              </Badge>
            )}
            {audioManager?.needsUserGesture && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <Volume2 className="h-3 w-3" />
                Audio Blocked
              </Badge>
            )}
            <Switch
              id="voice-activation"
              checked={voiceActivated}
              onCheckedChange={setVoiceActivated}
              disabled={rehearsalState !== 'IDLE'}
            />
          </div>
        </div>
        {voiceActivated && (
          <p className="text-xs text-muted-foreground">
            {isListening 
              ? "🎤 Microphone is actively listening for your cues..." 
              : audioManager?.needsUserGesture 
                ? "⚠️ Click 'Enable Audio' button to allow audio playback" 
                : "Microphone ready for rehearsal mode"}
          </p>
        )}
      </div>
    </div>
  );
};