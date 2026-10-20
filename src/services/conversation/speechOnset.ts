/**
 * Local "the actor started talking" detector.
 *
 * ElevenLabs only reports the user's words once they stop speaking, so the prompter would sit on the
 * first paragraph of a long speech until the end. A cheap loudness check on the mic chunks we already
 * send gives an immediate onset signal. It only marks onsets (after a quiet gap); words still come
 * from the server transcript.
 */
export const SPEECH_RMS_THRESHOLD = 0.02;
export const SPEECH_MIN_SILENCE_MS = 700;

export function pcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 0x8000;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

/** Returns a function that is fed each mic chunk and returns true on a fresh speech onset. */
export function createSpeechOnsetDetector(
  threshold = SPEECH_RMS_THRESHOLD,
  minSilenceMs = SPEECH_MIN_SILENCE_MS,
) {
  let lastLoudAt = -Infinity;
  return (samples: Int16Array, now: number): boolean => {
    if (pcm16Rms(samples) < threshold) return false;
    const onset = now - lastLoudAt >= minSilenceMs;
    lastLoudAt = now;
    return onset;
  };
}
