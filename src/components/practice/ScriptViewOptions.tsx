import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SkipForward } from 'lucide-react';
import { useRehearsal } from '@/contexts/RehearsalContext';

/**
 * Script view options: show/hide optional "NAME:" prefixes, and skip to the next cue.
 */
export const ScriptViewOptions = () => {
  const { showNames, setShowNames, rehearsalMode, isUsingConversationEngine, nextCue } = useRehearsal();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-character-names" className="text-sm">
          Show character names
        </Label>
        <Switch id="show-character-names" checked={showNames} onCheckedChange={setShowNames} />
      </div>
      {rehearsalMode && isUsingConversationEngine && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={nextCue}>
          <SkipForward className="h-4 w-4 mr-1" />
          Next cue
        </Button>
      )}
    </div>
  );
};
