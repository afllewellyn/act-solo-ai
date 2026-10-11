import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Square, Volume2 } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';
import { cn } from '@/lib/utils';

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
  disabled?: boolean;
  compact?: boolean;
  /** Extra classes for the dropdown menu (it renders in a portal, outside any themed parent) */
  menuClassName?: string;
}

const PREVIEW_TEXT = "Whenever you're ready, I'll be your scene partner. Let's take it from the top.";

/**
 * The AI scene-partner voice: a single dropdown of every voice with a Test
 * button beside it to preview the selected voice.
 */
export const VoicePicker = ({
  voices,
  selectedVoice,
  onVoiceChange,
  previewDisabled = false,
  disabled = false,
  compact = false,
  menuClassName,
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

  const selectedName = voices.find(v => v.id === selectedVoice)?.name || 'selected voice';
  const previewing = previewingId === selectedVoice;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">AI voice</Label>
      <div className="flex items-center gap-2">
        <Select value={selectedVoice} onValueChange={onVoiceChange} disabled={disabled}>
          <SelectTrigger className="flex-1 min-w-0 bg-background border-border" aria-label="Select the AI scene partner voice">
            <div className="flex items-center min-w-0">
              <Volume2 className="h-4 w-4 shrink-0" />
              <SelectValue placeholder="Select Voice">
                <span className="ml-1 truncate">
                  {voices.find(v => v.id === selectedVoice)?.name || 'Voice'}
                </span>
              </SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent className={cn('max-h-72 bg-background border-border shadow-lg', menuClassName)}>
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
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 shrink-0"
          onClick={() => togglePreview(selectedVoice)}
          disabled={previewDisabled || (isLoading && !previewing)}
          aria-label={previewing ? `Stop ${selectedName} preview` : `Preview ${selectedName}`}
        >
          {previewing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {!compact && <span className="ml-1.5 text-sm">{previewing ? 'Stop' : 'Test'}</span>}
        </Button>
      </div>
    </div>
  );
};
