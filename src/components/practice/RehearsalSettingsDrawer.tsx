import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useRehearsal } from '@/contexts/RehearsalContext';
import { useTTS } from '@/hooks/useTTS';
import type { Character } from '@/services/ScriptRehearsalStateMachine';
import { detectCharacterRoles } from '@/lib/scriptMeta';
import { cn } from '@/lib/utils';
import { Play, Loader2, Square, Volume2 } from 'lucide-react';
import { VoicePicker } from '@/components/practice/VoicePicker';
import { ScriptViewOptions } from '@/components/practice/ScriptViewOptions';

interface RehearsalSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCharactersChange: (characters: Character[]) => void;
  onReadScript: () => void;
}

const label = 'text-xs font-semibold tracking-[0.15em] uppercase text-studio-muted';

/** 0.95 -> "0.95", 1 -> "1.0" (toFixed(1) alone shows both 0.9 and 0.95 as "0.9") */
const formatSpeed = (speed: number) => {
  const rounded = Math.round(speed * 100) / 100;
  return Math.round(rounded * 10) / 10 === rounded ? rounded.toFixed(1) : rounded.toFixed(2);
};

const RehearsalSettingsDrawer = ({ open, onOpenChange, onCharactersChange, onReadScript }: RehearsalSettingsDrawerProps) => {
  const {
    textFilter, setTextFilter, characters, voices, playbackSpeed, setPlaybackSpeed,
    rehearsalState, rehearsalMode, scriptContent, isManualTTSPlaying, selectedVoice, setSelectedVoice,
  } = useRehearsal();
  const { speak, stop, isPlaying, isLoading } = useTTS();
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  const roles = detectCharacterRoles(scriptContent);
  const userNames = roles.filter((r) => r.role === 'you').map((r) => r.name);
  const fallbackUser = characters.filter((c) => c.isUserRole).map((c) => c.name.toUpperCase());
  const yourRole = userNames.length ? userNames : fallbackUser;
  const aiChars = characters
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => textFilter === 'all' || !yourRole.includes(c.name.toUpperCase()));

  const changeVoice = (index: number, voiceId: string) =>
    onCharactersChange(characters.map((c, i) => (i === index ? { ...c, voice: voiceId } : c)));

  const testVoice = async (voiceId: string, name: string) => {
    if (isPlaying) { stop(); setTestingVoice(null); return; }
    setTestingVoice(voiceId);
    await speak(`Hi, I'm ${name}. This is how I'll sound in your scene.`, {
      voiceId, playbackSpeed, onComplete: () => setTestingVoice(null),
    });
    setTestingVoice(null);
  };

  const locked = rehearsalState !== 'IDLE';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="dark w-full sm:max-w-md overflow-y-auto bg-studio text-studio-fg border-studio-border [&>button]:text-studio-fg">
        <SheetTitle className="text-2xl font-bold text-studio-fg">Rehearsal settings</SheetTitle>
        <SheetDescription className="sr-only">Choose what the AI reads, voices and speed.</SheetDescription>

        <div className="space-y-8 py-6">
          <section className="space-y-3">
            <p className={label}>Scene partner voice</p>
            <VoicePicker
              voices={voices}
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
              previewDisabled={locked || rehearsalMode || isManualTTSPlaying}
              disabled={locked || rehearsalMode}
              menuClassName="dark"
            />
          </section>

          <section className="space-y-3">
            <p className={label}>Script view</p>
            <ScriptViewOptions />
          </section>

          <section className="space-y-3">
            <p className={label}>AI reads</p>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-studio-surface p-1.5">
              {([
                ['italic', 'Italic only', 'Scene partner'],
                ['all', 'Full script', 'Listen & learn'],
              ] as const).map(([value, title, sub]) => (
                <button
                  key={value}
                  type="button"
                  disabled={locked}
                  onClick={() => setTextFilter(value)}
                  aria-pressed={textFilter === value}
                  className={cn(
                    'rounded-xl py-3 px-2 text-center transition-colors disabled:opacity-60',
                    textFilter === value ? 'bg-studio-fg text-studio' : 'text-studio-fg hover:bg-studio-border',
                  )}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-xs opacity-70">{sub}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-studio-muted">
              {textFilter === 'italic'
                ? 'AI reads the italic lines and listens for you on bold lines.'
                : 'AI reads every line aloud so you can hear the whole scene.'}
              {locked && ' Stop the rehearsal to change this.'}
            </p>
          </section>

          <section className="space-y-3">
            <p className={label}>Your role</p>
            <div className="rounded-2xl bg-studio-surface px-5 py-4 text-lg font-semibold">
              {yourRole.length ? yourRole.join(', ') : <span className="text-studio-muted text-sm font-normal">Make your lines bold to set your role</span>}
            </div>
          </section>

          <section className="space-y-3">
            <p className={label}>AI voices</p>
            {aiChars.length === 0 ? (
              <p className="text-sm text-studio-muted">No AI characters found. Start lines with <span className="font-mono">NAME:</span> and make them italic.</p>
            ) : (
              aiChars.map(({ c, index }) => (
                <div key={`${c.name}-${index}`} className="flex items-center gap-2 rounded-2xl bg-studio-surface pl-5 pr-2 py-2">
                  <span className="flex-1 min-w-0 truncate font-semibold">{c.name.toUpperCase()}</span>
                  <Select value={c.voice} onValueChange={(v) => changeVoice(index, v)}>
                    <SelectTrigger aria-label={`Voice for ${c.name}`} className="w-32 border-0 bg-transparent text-studio-fg focus:ring-0">
                      <SelectValue placeholder="Voice">{voices.find((v) => v.id === c.voice)?.name || 'Voice'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="dark max-h-72">
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <span className="font-medium">{v.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{v.gender} • {v.accent}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => testVoice(c.voice, c.name)}
                    disabled={isLoading}
                    aria-label={`Test voice for ${c.name}`}
                    className="h-10 rounded-full border border-studio-border px-4 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-studio-border disabled:opacity-60"
                  >
                    {isLoading && testingVoice === c.voice ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : isPlaying && testingVoice === c.voice ? <Volume2 className="h-3.5 w-3.5" />
                      : <Play className="h-3.5 w-3.5 fill-current" />}
                    Test
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className={label}>Speed</p>
              <span className="text-sm font-mono text-studio-muted">{formatSpeed(playbackSpeed)}x</span>
            </div>
            <Slider value={[playbackSpeed]} min={0.7} max={1.2} step={0.05} onValueChange={([v]) => setPlaybackSpeed(v)} aria-label="AI speaking speed" />
          </section>

          <button
            type="button"
            onClick={() => { onReadScript(); onOpenChange(false); }}
            className="w-full h-14 rounded-full border border-studio-border text-lg font-medium inline-flex items-center justify-center gap-2 hover:bg-studio-surface"
          >
            {isManualTTSPlaying ? <><Square className="h-4 w-4 fill-current" /> Stop reading</> : <><Volume2 className="h-5 w-5" /> Read script aloud (no mic)</>}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RehearsalSettingsDrawer;
