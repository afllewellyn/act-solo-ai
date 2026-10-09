import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Check, Play, Square, Volume2 } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

interface VoicePickerProps {
  voices: Voice[];
  selectedVoice: string;
  onVoiceChange?: (voiceId: string) => void;
  /** Disable previews (e.g. while a rehearsal is running and the AI is speaking) */
  previewDisabled?: boolean;
  compact?: boolean;
}

const PREVIEW_TEXT = "Whenever you're ready, I'll be your scene partner. Let's take it from the top.";

/**
 * The AI scene-partner voice: a dropdown of every voice, a Test button, and a
 * browsable list where each voice can be previewed before it is chosen.
 */
export const VoicePicker = ({
  voices,
  selectedVoice,
  onVoiceChange,
  previewDisabled = false,
  compact = false,
}: VoicePickerProps) => {
  // Separate TTS instance so previews never trigger rehearsal side effects
  const { speak, stop, isLoading, isPlaying } = useTTS();
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlaying && !isLoading) setPreviewingId(null);
  }, [isPlaying, isLoading]);

  // Stop any preview when the picker goes away
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (previewDisabled) {
      stop();
      setPreviewingId(null);
    }
  }, [previewDisabled, stop]);

  const togglePreview = (voiceId: string) => {
    if (previewingId === voiceId) {
      stop();
      setPreviewingId(null);
      return;
    }
    stop();
    setPreviewingId(voiceId);
    speak(PREVIEW_TEXT, { voiceId, onComplete: () => setPreviewingId(null) });
  };

  const previewButton = (voiceId: string, label: string) => {
    const active = previewingId === voiceId;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 px-2 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          togglePreview(voiceId);
        }}
        disabled={previewDisabled || (isLoading && !active)}
        aria-label={active ? `Stop ${label} preview` : `Preview ${label}`}
      >
        {active ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {voiceId === selectedVoice && !compact && <span className="ml-1 text-xs">{active ? 'Stop' : 'Test'}</span>}
      </Button>
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">AI voice</Label>
      <div className="flex items-center gap-2">
        <Select value={selectedVoice} onValueChange={onVoiceChange}>
          <SelectTrigger className="flex-1 bg-background border-border" aria-label="Select the AI scene partner voice">
            <div className="flex items-center min-w-0">
              <Volume2 className="h-4 w-4 shrink-0" />
              <SelectValue placeholder="Select Voice">
                <span className="ml-1 truncate">
                  {voices.find(v => v.id === selectedVoice)?.name || 'Voice'}
                </span>
              </SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72 bg-background border-border shadow-lg">
            {voices.length > 0 ? (
              voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id} className="cursor-pointer p-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{voice.name}</span>
                    <span className="text-xs text-muted-foreground">{voice.gender} • {voice.accent}</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <SelectItem value="no-voices" disabled>No voices available</SelectItem>
            )}
          </SelectContent>
        </Select>
        {previewButton(selectedVoice, voices.find(v => v.id === selectedVoice)?.name || 'selected voice')}
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-xs text-muted-foreground">
            Browse voices ({voices.length})
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {voices.map((voice) => {
              const selected = voice.id === selectedVoice;
              return (
                <li key={voice.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onVoiceChange?.(voice.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onVoiceChange?.(voice.id);
                      }
                    }}
                    aria-pressed={selected}
                    className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-accent ${selected ? 'bg-accent/60' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{voice.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{voice.gender} • {voice.accent}</div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" aria-label="Selected" />}
                    {previewButton(voice.id, voice.name)}
                  </div>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
