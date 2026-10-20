import { describe, it, expect } from 'vitest';
import { createSpeechOnsetDetector, SPEECH_MIN_SILENCE_MS } from '../speechOnset';

const tone = (amp: number) => Int16Array.from({ length: 1024 }, (_, i) => (i % 2 ? amp : -amp));

describe('speech onset detector', () => {
  it('flags the first loud chunk and ignores silence', () => {
    const detect = createSpeechOnsetDetector();
    expect(detect(tone(50), 0)).toBe(false);
    expect(detect(tone(8000), 100)).toBe(true);
  });

  it('needs a 700 ms quiet gap before a new onset', () => {
    const detect = createSpeechOnsetDetector();
    expect(SPEECH_MIN_SILENCE_MS).toBe(700);
    expect(detect(tone(8000), 0)).toBe(true);
    expect(detect(tone(8000), 300)).toBe(false);
    expect(detect(tone(8000), 300 + 699)).toBe(false);
    expect(detect(tone(8000), 300 + 699 + 700)).toBe(true);
  });
});
