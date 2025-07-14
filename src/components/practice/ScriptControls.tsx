import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Play, Pause, RotateCcw, Plus, Minus, Maximize, Minimize } from 'lucide-react';

interface ScriptControlsProps {
  isPlaying: boolean;
  scrollSpeed: number[];
  fontSize: number[];
  isFullscreen: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onScrollSpeedChange: (speed: number[]) => void;
  onFontSizeChange: (size: number[]) => void;
  onToggleFullscreen: () => void;
}

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
}: ScriptControlsProps) => {
  return (
    <>
      {/* Rehearse Script Section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Rehearse Script
        </Label>
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