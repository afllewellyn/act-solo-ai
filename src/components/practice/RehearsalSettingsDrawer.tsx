import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRehearsal } from '@/contexts/RehearsalContext';
import { useTTS } from '@/hooks/useTTS';
import type { Character } from '@/services/ScriptRehearsalStateMachine';
import { Play, Loader2, Volume2 } from 'lucide-react';

interface RehearsalSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists character voice changes (updates DB) */
  onCharactersChange: (characters: Character[]) => void;
}

const RehearsalSettingsDrawer = ({
  open,
  onOpenChange,
  onCharactersChange,
}: RehearsalSettingsDrawerProps) => {
  const {
    textFilter,
    setTextFilter,
    characters,
    voices,
    playbackSpeed,
    rehearsalState,
  } = useRehearsal();

  const { speak, stop, isPlaying, isLoading } = useTTS();
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  const handleCharacterVoiceChange = (index: number, voiceId: string) => {
    const updated = characters.map((c, i) =>
      i === index ? { ...c, voice: voiceId } : c
    );
    onCharactersChange(updated);
  };

  const handleTestVoice = async (voiceId: string, characterName: string) => {
    if (isPlaying) {
      stop();
      setTestingVoice(null);
      return;
    }
    setTestingVoice(voiceId);
    await speak(`Hi, I'm ${characterName}. This is how I'll sound in your scene.`, {
      voiceId,
      playbackSpeed,
      onComplete: () => setTestingVoice(null),
    });
    setTestingVoice(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Rehearsal Settings</SheetTitle>
          <SheetDescription>
            Choose what the AI reads and assign a voice to each character.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* AI reads filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              AI reads
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={textFilter === 'italic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTextFilter('italic')}
                disabled={rehearsalState !== 'IDLE'}
                className="h-auto py-2 flex-col items-start"
              >
                <span className="font-medium">Italic only</span>
                <span className="text-xs opacity-80 font-normal">
                  Scene partner mode
                </span>
              </Button>
              <Button
                variant={textFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTextFilter('all')}
                disabled={rehearsalState !== 'IDLE'}
                className="h-auto py-2 flex-col items-start"
              >
                <span className="font-medium">Full script</span>
                <span className="text-xs opacity-80 font-normal">
                  Listen &amp; learn
                </span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {textFilter === 'italic'
                ? 'The AI reads the italic lines and waits for you to say your bold lines.'
                : 'The AI reads every line aloud so you can listen to the whole scene.'}
            </p>
          </div>

          {/* Per-character voices */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Character voices
            </Label>
            {characters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No characters detected yet. Add lines like{' '}
                <span className="font-mono text-xs">NAME: dialogue</span> to your
                script.
              </p>
            ) : (
              characters.map((character, index) => (
                <div
                  key={`${character.name}-${index}`}
                  className="flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate mb-1">
                      {character.name}
                    </p>
                    <Select
                      value={character.voice}
                      onValueChange={(v) => handleCharacterVoiceChange(index, v)}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Voice for ${character.name}`}
                      >
                        <SelectValue placeholder="Select voice">
                          <span className="truncate">
                            {voices.find((v) => v.id === character.voice)?.name ||
                              'Select voice'}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {voices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            <span className="font-medium">{voice.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {voice.gender} • {voice.accent}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 mt-5"
                    onClick={() => handleTestVoice(character.voice, character.name)}
                    disabled={isLoading}
                    aria-label={`Test voice for ${character.name}`}
                  >
                    {isLoading && testingVoice === character.voice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isPlaying && testingVoice === character.voice ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RehearsalSettingsDrawer;
