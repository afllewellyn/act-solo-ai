import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import jamesSample from "@/assets/james.mp3.asset.json";
import liamSample from "@/assets/liam.mp3.asset.json";
import lauraSample from "@/assets/laura.mp3.asset.json";

const voices = [
  { id: "james", name: "James", tag: "Relaxed", src: jamesSample.url },
  { id: "liam", name: "Liam", tag: "Energetic", src: liamSample.url },
  { id: "laura", name: "Laura", tag: "Quirky", src: lauraSample.url },
];

export const VoiceSoundboard = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = (id: string, src: string) => {
    if (playing === id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(src);
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    audio.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  };

  return (
    <div className="mt-10">
      <p className="text-sm font-semibold uppercase tracking-wider mb-3 text-gray-900">Hear the AI readers</p>
      <div className="flex flex-wrap gap-3">
        {voices.map((v) => {
          const isPlaying = playing === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => toggle(v.id, v.src)}
              aria-pressed={isPlaying}
              aria-label={`${isPlaying ? "Pause" : "Play"} ${v.name} sample voice (${v.tag})`}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {v.name}
              <span className="text-gray-500">· {v.tag}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceSoundboard;
