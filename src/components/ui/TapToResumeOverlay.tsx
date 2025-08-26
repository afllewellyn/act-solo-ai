/**
 * Tap to Resume Audio Overlay
 * Phase 1 - Mobile Audio Optimization
 */

import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface TapToResumeOverlayProps {
  isVisible: boolean;
  onTap: () => void;
  className?: string;
}

export function TapToResumeOverlay({ isVisible, onTap, className = '' }: TapToResumeOverlayProps) {
  if (!isVisible || !isFeatureEnabled('mobile_audio_optimization')) {
    return null;
  }

  return (
    <div className={`fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center ${className}`}>
      <div className="bg-card border rounded-lg p-6 mx-4 text-center shadow-lg">
        <Volume2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Audio Paused</h3>
        <p className="text-muted-foreground mb-4">
          Tap to resume audio playback
        </p>
        <Button 
          onClick={onTap}
          size="lg"
          className="w-full"
        >
          <Volume2 className="w-4 h-4 mr-2" />
          Resume Audio
        </Button>
      </div>
    </div>
  );
}