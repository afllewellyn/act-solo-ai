import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Plus, Minus, Maximize, Minimize, Square } from 'lucide-react';

/**
 * Props for ScriptControls component
 * Manages script playback, font sizing, and fullscreen controls
 */
interface ScriptControlsProps {
  isPlaying: boolean; // Whether script playback is currently active
  scrollSpeed: number[]; // Current auto-scroll speed as array for slider compatibility
  fontSize: number[]; // Current font size as array for slider compatibility  
  isFullscreen: boolean; // Whether the view is in fullscreen mode
  onPlayPause: () => void; // Callback to toggle script playback (rehearsal or TTS)
  onReset: () => void; // Callback to reset playback to beginning
  onScrollSpeedChange: (speed: number[]) => void; // Callback when scroll speed changes
  onFontSizeChange: (size: number[]) => void; // Callback when font size changes (min: 12px, max: 32px)
  onToggleFullscreen: () => void; // Callback to toggle fullscreen mode
  onMasterStop?: () => void; // Master stop button to halt all AI operations
  showMasterStop?: boolean; // Whether to show the master stop button
  rehearsalState?: string; // Current rehearsal state for display
  cueWords?: string[]; // Current cue words being listened for
}

/**
 * ScriptControls Component
 * 
 * Provides controls for script rehearsal and viewing preferences.
 * Includes play/pause/reset buttons for script playback, font size adjustment
 * buttons (±2px increments), and fullscreen toggle functionality.
 */
export const ScriptControls = ({
  isPlaying,
  scrollSpeed,
  fontSize,
  isFullscreen,
  onPlayPause,
  onReset,
  onScrollSpeedChange,
  onFontSizeChange,
  onToggleFullscreen,
  onMasterStop,
  showMasterStop = false,
  rehearsalState,
  cueWords = [],
}: ScriptControlsProps) => {
  return (
    <>
      {/* Rehearse Script Section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Rehearse Script
        </Label>
        
        {/* Rehearsal State and Cue Words Display */}
        {showMasterStop && (rehearsalState || cueWords.length > 0) && (
          <div className="space-y-1">
            {rehearsalState && (
              <div className="text-xs text-muted-foreground">
                Status: <span className="font-medium">{rehearsalState}</span>
              </div>
            )}
            {cueWords.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground">Listening for:</span>
                {cueWords.map((word, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    "{word}"
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPlayPause}
            className="flex-1"
            aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="ml-1">{isPlaying ? 'Pause' : 'Play'}</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex-1"
            aria-label="Reset playback to beginning"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="ml-1">Reset</span>
          </Button>

          {/* Master Stop Button - Emergency stop for all AI operations */}
          {showMasterStop && onMasterStop && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onMasterStop}
              className="flex-1"
              aria-label="Emergency stop all AI operations"
            >
              <Square className="h-4 w-4" />
              <span className="ml-1">Stop All</span>
            </Button>
          )}

          {/* Speed Display */}
          <div className="flex items-center justify-center px-2 py-1 bg-muted rounded text-sm min-w-[48px]">
            <span className="font-mono text-xs">{scrollSpeed[0]}x</span>
          </div>
        </div>
      </div>

      {/* Screen and Text Sizing Section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Screen and Text Sizing
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFontSizeChange([Math.max(12, fontSize[0] - 2)])}
            className="flex-1"
            aria-label="Decrease font size"
          >
            <Minus className="h-4 w-4" />
            <span className="ml-1">Size</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onFontSizeChange([Math.min(32, fontSize[0] + 2)])}
            className="flex-1"
            aria-label="Increase font size"
          >
            <Plus className="h-4 w-4" />
            <span className="ml-1">Size</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onToggleFullscreen}
            className="flex-1"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="ml-1">{isFullscreen ? 'Exit' : 'Full'}</span>
          </Button>
        </div>
      </div>
    </>
  );
};