import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackVoicePreviewClick, type PreviewVoice } from "@/lib/voicePreviewTracking";
import jamesSample from "@/assets/james.mp3.asset.json";
import liamSample from "@/assets/liam.mp3.asset.json";
import lauraSample from "@/assets/laura.mp3.asset.json";

const voices = [
  { id: "james", name: "James", voiceId: "EkK5I93UQWFDigLMpZcX", tag: "Relaxed", src: jamesSample.url },
  { id: "liam", name: "Liam", voiceId: "TX3LPaxmHKxFdv7VOQHJ", tag: "Energetic", src: liamSample.url },
  { id: "laura", name: "Laura", voiceId: "FGY2WhTYpPnrIDTdsKH5", tag: "Quirky", src: lauraSample.url },
];

export const VoiceSoundboard = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = (voice: PreviewVoice & { src: string }) => {
    const { id, src } = voice;
    trackVoicePreviewClick(voice, playing === id ? 'pause' : 'play');
    if (playing === id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(src);
    audio.onended = () => { if (audioRef.current === audio) setPlaying(null); };
    audio.onerror = () => { if (audioRef.current === audio) setPlaying(null); };
    audioRef.current = audio;
    setPlaying(id);
    audio.play().catch(() => { if (audioRef.current === audio) setPlaying(null); });
  };

  return (
    <div className="mt-10">
      <p className="text-sm font-semibold uppercase tracking-wider mb-3 text-gray-900">Hear the AI readers</p>
      <div className="flex flex-wrap gap-3">
        {voices.map((v) => {
          const isPlaying = playing === v.id;
          return (
            <Button
              key={v.id}
              variant="outline"
              id={`voice-preview-${v.id}`}
              data-voice-name={v.name}
              data-voice-id={v.voiceId}
              data-preview-action={isPlaying ? "pause" : "play"}
              type="button"
              onClick={() => toggle(v)}
              aria-pressed={isPlaying}
              aria-label={`${isPlaying ? "Pause" : "Play"} ${v.name} sample voice (${v.tag})`}
              className="rounded-full px-4 py-2 shadow-sm"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {v.name}
              <span className="text-muted-foreground pointer-events-none">· {v.tag}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceSoundboard;
