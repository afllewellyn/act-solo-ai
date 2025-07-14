import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { ScriptControls } from './ScriptControls';
import { VoiceControls } from './VoiceControls';

/**
 * Voice data structure for ElevenLabs TTS voices
 */
interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

/**
 * Character data structure for script roles
 */
interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

/**
 * Text filter options for reading different parts of the script
 */
type TextFilter = 'all' | 'bold' | 'italic' | 'characters';

/**
 * Props for MobileControlsDrawer component
 * Mobile-specific drawer UI for practice mode controls
 */
interface MobileControlsDrawerProps {
  // Script controls props
  isPlaying: boolean;
  scrollSpeed: number[];
  fontSize: number[];
  isFullscreen: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onScrollSpeedChange: (speed: number[]) => void;
  onFontSizeChange: (size: number[]) => void;
  onToggleFullscreen: () => void;
  
  // Voice controls props
  selectedVoice: string;
  voices: Voice[];
  textFilter: TextFilter;
  voiceActivated: boolean;
  playbackSpeed: number;
  onVoiceChange: (voiceId: string) => void;
  onTextFilterChange: (filter: TextFilter) => void;
  onVoiceActivatedChange: (activated: boolean) => void;
  onPlaybackSpeedChange: (speed: number) => void;
  isTTSPlaying: boolean;
  onTTSPlay: () => void;
  
  // Status indicators
  isListening: boolean;
  waitingForActor: boolean;
}

/**
 * MobileControlsDrawer Component
 * 
 * Provides a collapsible drawer interface for mobile devices to save
 * vertical space. Shows a minimal grab handle when collapsed and full
 * controls when expanded. Designed to match competitor UI patterns.
 */
export const MobileControlsDrawer = ({
  // Script controls
  isPlaying,
  scrollSpeed,
  fontSize,
  isFullscreen,
  onPlayPause,
  onReset,
  onScrollSpeedChange,
  onFontSizeChange,
  onToggleFullscreen,
  
  // Voice controls
  selectedVoice,
  voices,
  textFilter,
  voiceActivated,
  playbackSpeed,
  onVoiceChange,
  onTextFilterChange,
  onVoiceActivatedChange,
  onPlaybackSpeedChange,
  isTTSPlaying,
  onTTSPlay,
  
  // Status
  isListening,
  waitingForActor,
}: MobileControlsDrawerProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Collapsed State - Grab Handle */}
      {!isExpanded && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <Card className="rounded-t-xl rounded-b-none border-b-0 bg-background/95 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                {/* Essential controls visible in collapsed state */}
                <div className="flex items-center gap-2 flex-1">
                  <Button
                    variant={isPlaying ? "default" : "outline"}
                    size="sm"
                    onClick={onPlayPause}
                    className="flex-1"
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  
                  <Button
                    variant={isTTSPlaying ? "destructive" : "default"}
                    size="sm"
                    onClick={onTTSPlay}
                    className="flex-1"
                  >
                    {isTTSPlaying ? 'Stop' : 'Speak'}
                  </Button>
                </div>

                {/* Expand Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(true)}
                  className="ml-2 px-3"
                  aria-label="Expand controls"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Grab handle visual indicator */}
              <div className="flex justify-center mt-1">
                <div className="w-8 h-1 bg-muted-foreground/20 rounded-full"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expanded State - Full Controls */}
      {isExpanded && (
        <div className="fixed bottom-0 left-0 right-0 z-40 max-h-[80vh] overflow-y-auto">
          <Card className="rounded-t-xl rounded-b-none border-b-0 bg-background/95 backdrop-blur-sm">
            <CardContent className="p-4 space-y-4">
              {/* Header with collapse button */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Practice Controls</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(false)}
                  className="px-3"
                  aria-label="Collapse controls"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Script Controls */}
              <ScriptControls
                isPlaying={isPlaying}
                scrollSpeed={scrollSpeed}
                fontSize={fontSize}
                isFullscreen={isFullscreen}
                onPlayPause={onPlayPause}
                onReset={onReset}
                onScrollSpeedChange={onScrollSpeedChange}
                onFontSizeChange={onFontSizeChange}
                onToggleFullscreen={onToggleFullscreen}
              />

              {/* Voice Controls */}
              <VoiceControls
                selectedVoice={selectedVoice}
                voices={voices}
                textFilter={textFilter}
                voiceActivated={voiceActivated}
                playbackSpeed={playbackSpeed}
                onVoiceChange={onVoiceChange}
                onTextFilterChange={onTextFilterChange}
                onVoiceActivatedChange={onVoiceActivatedChange}
                onPlaybackSpeedChange={onPlaybackSpeedChange}
                isPlaying={isTTSPlaying}
                onTTSPlay={onTTSPlay}
              />

              {/* Voice Activation Status */}
              {isListening && (
                <div className="text-center">
                  <span className="text-xs text-muted-foreground animate-pulse">
                    {waitingForActor ? 'Still listening...' : 'Listening...'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};