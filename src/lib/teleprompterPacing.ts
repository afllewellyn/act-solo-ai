/**
 * Teleprompter pacing: pure timeline maths for the time-driven rehearsal scroll.
 *
 * Every line gets a duration from its word count and the Speed setting. AI lines
 * additionally carry a measured response latency (`leadInMs`) and a measured speaking
 * rate (`aiWpmAt1x`), both learned from the real agent audio via `updateCalibration`.
 * Nothing here depends on a sample ever arriving: the defaults always work.
 */

import type { ScriptLine } from '@/components/practice/rehearsal/types';

/** Typical TTS pace at 1x (2.6 words/sec). */
export const BASE_WORDS_PER_MINUTE = 156;
/** No line is ever shorter than this. */
export const MIN_LINE_MS = 1200;

export interface PacingCalibration {
  /** Measured AI speaking rate at 1x speed, in words per minute. */
  aiWpmAt1x: number;
  /** Agent response latency: how long after an AI line starts on the clock its audio begins. */
  leadInMs: number;
}

export const DEFAULT_CALIBRATION: PacingCalibration = { aiWpmAt1x: 156, leadInMs: 800 };

export interface Timeline {
  /** Start time of each line, in ms from rehearsal start. */
  starts: number[];
  /** Duration of each line, in ms. */
  durations: number[];
  /** Total scene length, in ms. */
  total: number;
}

export interface ClockPosition {
  /** Integer line index. */
  index: number;
  /** 0..1 progress through that line. */
  fraction: number;
}

const LEAD_IN_MIN_MS = 0;
const LEAD_IN_MAX_MS = 4000;
const LEAD_IN_ALPHA = 0.5;

const AI_WPM_MIN = 90;
const AI_WPM_MAX = 260;
const AI_WPM_ALPHA = 0.4;
/** A rate sample from fewer words or a shorter clip than this is too noisy to use. */
const MIN_SAMPLE_WORDS = 3;
const MIN_SAMPLE_AUDIO_MS = 500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Whitespace-separated words. */
export function countWords(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function lineDuration(line: ScriptLine, speed: number, calibration: PacingCalibration): number {
  const words = countWords(line.dialogue);
  const ms =
    line.type === 'ai'
      ? calibration.leadInMs + (words / (calibration.aiWpmAt1x * speed)) * 60000
      : (words / (BASE_WORDS_PER_MINUTE * speed)) * 60000;
  return Math.max(MIN_LINE_MS, ms);
}

export function buildTimeline(
  lines: ScriptLine[],
  opts: { speed: number; calibration: PacingCalibration },
): Timeline {
  // A bad speed would make every duration Infinity/NaN; fall back to 1x.
  const speed = Number.isFinite(opts.speed) && opts.speed > 0 ? opts.speed : 1;
  const starts: number[] = [];
  const durations: number[] = [];
  let total = 0;
  for (const line of lines) {
    const duration = lineDuration(line, speed, opts.calibration);
    starts.push(total);
    durations.push(duration);
    total += duration;
  }
  return { starts, durations, total };
}

/**
 * Where the clock is at `elapsedMs`. At or past the end it parks on the last line at
 * fraction 1 with `done: true`. An empty timeline is always done.
 */
export function positionAt(
  t: Timeline,
  elapsedMs: number,
): ClockPosition & { done: boolean } {
  const count = t.durations.length;
  if (count === 0) return { index: 0, fraction: 0, done: true };

  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  if (elapsed <= 0) return { index: 0, fraction: 0, done: false };
  if (elapsed >= t.total) return { index: count - 1, fraction: 1, done: true };

  // Last line whose start is <= elapsed (binary search; scripts can be hundreds of lines).
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t.starts[mid] <= elapsed) lo = mid;
    else hi = mid - 1;
  }
  const fraction = clamp((elapsed - t.starts[lo]) / t.durations[lo], 0, 1);
  return { index: lo, fraction, done: false };
}

/**
 * Inverse of `positionAt`: the elapsed time at which the clock reads `pos`. Used to keep
 * the place when the timeline is rebuilt. `{ index: i, fraction: 1 }` is the same instant
 * as `{ index: i + 1, fraction: 0 }`, so it round-trips to the latter (except on the last line).
 */
export function elapsedAt(t: Timeline, pos: ClockPosition): number {
  const count = t.durations.length;
  if (count === 0) return 0;
  const index = clamp(Math.trunc(pos.index) || 0, 0, count - 1);
  const fraction = clamp(Number.isFinite(pos.fraction) ? pos.fraction : 0, 0, 1);
  return t.starts[index] + fraction * t.durations[index];
}

/** Start time of line `index` (clamped into range), for seeking. */
export function startOf(t: Timeline, index: number): number {
  const count = t.starts.length;
  if (count === 0) return 0;
  return t.starts[clamp(Math.trunc(index) || 0, 0, count - 1)];
}

/**
 * Blend one measurement into the calibration with an exponential moving average.
 * - `leadInMs`: clamped 0..4000, alpha 0.5.
 * - `words` + `audioMs` (clip length at 1x): rate = words / audioMs * 60000, only used when
 *   words >= 3 and audioMs >= 500, clamped 90..260 wpm, alpha 0.4.
 * Returns the SAME object when nothing in the sample was usable, so callers can use
 * reference equality to tell whether the calibration changed.
 */
export function updateCalibration(
  cal: PacingCalibration,
  sample: { leadInMs?: number; words?: number; audioMs?: number },
): PacingCalibration {
  let next = cal;

  const { leadInMs, words, audioMs } = sample;
  if (typeof leadInMs === 'number' && Number.isFinite(leadInMs)) {
    const value = clamp(leadInMs, LEAD_IN_MIN_MS, LEAD_IN_MAX_MS);
    next = { ...next, leadInMs: next.leadInMs + LEAD_IN_ALPHA * (value - next.leadInMs) };
  }

  if (
    typeof words === 'number' &&
    typeof audioMs === 'number' &&
    Number.isFinite(words) &&
    Number.isFinite(audioMs) &&
    words >= MIN_SAMPLE_WORDS &&
    audioMs >= MIN_SAMPLE_AUDIO_MS
  ) {
    const value = clamp((words / audioMs) * 60000, AI_WPM_MIN, AI_WPM_MAX);
    next = { ...next, aiWpmAt1x: next.aiWpmAt1x + AI_WPM_ALPHA * (value - next.aiWpmAt1x) };
  }

  return next;
}
