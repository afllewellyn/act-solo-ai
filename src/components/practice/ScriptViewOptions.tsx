import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useRehearsal } from '@/contexts/RehearsalContext';

/**
 * Script view options: show/hide optional "NAME:" prefixes.
 * (Next cue lives on the Practice screen, where it resyncs the teleprompter clock.)
 */
export const ScriptViewOptions = () => {
  const { showNames, setShowNames } = useRehearsal();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-character-names" className="text-sm">
          Show character names
        </Label>
        <Switch id="show-character-names" checked={showNames} onCheckedChange={setShowNames} />
      </div>
    </div>
  );
};
