/**
 * useTeleprompterClock: requestAnimationFrame clock that drives the rehearsal scroll.
 *
 * The clock owns elapsed time in a ref (no React state per frame). Each frame it reports a
 * `{ index, fraction }` position through `onPosition`, and calls `onIndexChange` only when the
 * integer line changes. Elapsed time advances only while `running`, and goes back to 0 when
 * `resetKey` changes.
 *
 * AI lines are paced from the real agent audio: `noteAgentAudioStarted` samples the agent's
 * response latency and `noteAgentAudioEnded` samples its speaking rate. Whenever lines, speed or
 * the calibration change the timeline is rebuilt and the place is kept (index + fraction), so the
 * scroll changes rate but never jumps. A missing sample just leaves the defaults in place.
 *
 * Logs only indices, types, counts and timings through `rehearsalLog`, never script text.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { rehearsalLog } from '@/lib/rehearsalLog';
import {
  DEFAULT_CALIBRATION,
  buildTimeline,
  countWords,
  elapsedAt,
  positionAt,
  startOf,
  updateCalibration,
  type ClockPosition,
  type PacingCalibration,
  type Timeline,
} from '@/lib/teleprompterPacing';

/** How long after the last line ends the scene counts as complete. */
const COMPLETE_GRACE_MS = 2000;

export interface UseTeleprompterClockOptions {
  lines: ScriptLine[];
  speed: number;
  running: boolean;
  resetKey: number;
  onIndexChange: (index: number) => void;
  onPosition: (pos: ClockPosition) => void;
  onComplete: () => void;
}

export interface TeleprompterClock {
  seek: (index: number) => void;
  noteAgentAudioStarted: () => void;
  noteAgentAudioEnded: (info: { audioMs?: number; text?: string }) => void;
}

const sameDurations = (a: Timeline, b: Timeline) =>
  a.durations.length === b.durations.length && a.durations.every((d, i) => d === b.durations[i]);

export function useTeleprompterClock(opts: UseTeleprompterClockOptions): TeleprompterClock {
  const { lines, speed, running, resetKey } = opts;

  // Latest options, so the stable callbacks and the frame loop never see stale props.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const calibrationRef = useRef<PacingCalibration>(DEFAULT_CALIBRATION);
  const timelineRef = useRef<Timeline | null>(null);
  if (timelineRef.current === null) {
    timelineRef.current = buildTimeline(lines, { speed, calibration: calibrationRef.current });
  }
  const elapsedRef = useRef(0);
  /** Last index reported through onIndexChange since the reset (-1 = none yet). */
  const lastIndexRef = useRef(-1);
  const completedRef = useRef(false);
  const lastFrameRef = useRef(0);

  /** Rebuild the timeline from the current lines, speed and calibration, keeping the place. */
  const rebuild = useCallback(() => {
    const prev = timelineRef.current;
    const { lines: currentLines, speed: currentSpeed } = optsRef.current;
    const next = buildTimeline(currentLines, {
      speed: currentSpeed,
      calibration: calibrationRef.current,
    });
    if (prev && sameDurations(prev, next)) return;
    if (prev && prev.durations.length > 0) {
      const elapsed = elapsedRef.current;
      // Time spent in the post-scene grace period carries over untouched.
      const tail = Math.max(0, elapsed - prev.total);
      const place = positionAt(prev, elapsed);
      elapsedRef.current = next.durations.length > 0 ? elapsedAt(next, place) + tail : 0;
    }
    timelineRef.current = next;
  }, []);

  /** Report a position: line change (once per line, with its log) then the per-frame position. */
  const publish = useCallback((pos: ClockPosition) => {
    const { lines: currentLines, onIndexChange, onPosition } = optsRef.current;
    if (pos.index !== lastIndexRef.current) {
      lastIndexRef.current = pos.index;
      const line = currentLines[pos.index];
      rehearsalLog.log('line_change', {
        index: pos.index,
        lineType: line?.type,
        words: line ? countWords(line.dialogue) : 0,
        clockMs: Math.round(elapsedRef.current),
      });
      onIndexChange(pos.index);
    }
    onPosition({ index: pos.index, fraction: pos.fraction });
  }, []);

  /** Adopt a new calibration: rebuild at the same place and log how it settled. */
  const applyCalibration = useCallback(
    (next: PacingCalibration, kind: 'lead_in' | 'ai_rate', value: number) => {
      calibrationRef.current = next;
      rebuild();
      rehearsalLog.log('pacing_sample', {
        kind,
        value: Math.round(value),
        leadInMs: Math.round(next.leadInMs),
        aiWpmAt1x: Math.round(next.aiWpmAt1x),
      });
    },
    [rebuild],
  );

  // New lines (script edited mid-rehearsal) or a new Speed: same place, new rate.
  useEffect(() => {
    rebuild();
  }, [lines, speed, rebuild]);

  // Start of a rehearsal (Start / Restart): back to the top. The first running frame then
  // reports line 0 again.
  useEffect(() => {
    elapsedRef.current = 0;
    lastIndexRef.current = -1;
    completedRef.current = false;
  }, [resetKey]);

  // The frame loop. Elapsed time is frozen whenever `running` is false (the loop is not scheduled).
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    lastFrameRef.current = performance.now();

    const frame = () => {
      // Schedule first so a throwing callback cannot stall the clock.
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.max(0, now - lastFrameRef.current);
      lastFrameRef.current = now;

      const timeline = timelineRef.current;
      if (!timeline || timeline.durations.length === 0 || completedRef.current) return;

      elapsedRef.current += dt;
      publish(positionAt(timeline, elapsedRef.current));

      if (elapsedRef.current >= timeline.total + COMPLETE_GRACE_MS) {
        completedRef.current = true;
        rehearsalLog.log('complete');
        optsRef.current.onComplete();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, publish]);

  const seek = useCallback(
    (index: number) => {
      const timeline = timelineRef.current;
      const count = timeline ? timeline.durations.length : 0;
      if (!timeline || count === 0 || !Number.isFinite(index)) return;
      const target = Math.min(count - 1, Math.max(0, Math.trunc(index)));
      elapsedRef.current = startOf(timeline, target);
      completedRef.current = false;
      rehearsalLog.log('seek', { toIndex: target });
      // Report right away: while paused there is no frame to do it.
      publish({ index: target, fraction: 0 });
    },
    [publish],
  );

  const noteAgentAudioStarted = useCallback(() => {
    const timeline = timelineRef.current;
    const { lines: currentLines, running: isRunning } = optsRef.current;
    // A frozen or finished clock says nothing about when the voice should have started.
    if (!timeline || !isRunning || completedRef.current || currentLines.length === 0) return;

    const elapsed = elapsedRef.current;
    const { index } = positionAt(timeline, elapsed);

    let sample: number | null = null;
    if (currentLines[index]?.type === 'ai') {
      // Voice started this long after its line reached the eye-line.
      sample = elapsed - startOf(timeline, index);
    } else if (currentLines.slice(index + 1).some((line) => line.type === 'ai')) {
      // Voice started before the clock reached the next AI line: no lead-in needed.
      sample = 0;
    }
    if (sample === null) return;

    const prev = calibrationRef.current;
    const next = updateCalibration(prev, { leadInMs: sample });
    if (next !== prev) applyCalibration(next, 'lead_in', sample);
  }, [applyCalibration]);

  const noteAgentAudioEnded = useCallback(
    (info: { audioMs?: number; text?: string }) => {
      const { audioMs, text } = info ?? {};
      if (!text || typeof audioMs !== 'number') return; // no usable sample: keep what we have

      const words = countWords(text);
      const prev = calibrationRef.current;
      const next = updateCalibration(prev, { words, audioMs });
      if (next !== prev) applyCalibration(next, 'ai_rate', (words / audioMs) * 60000);
    },
    [applyCalibration],
  );

  return useMemo(
    () => ({ seek, noteAgentAudioStarted, noteAgentAudioEnded }),
    [seek, noteAgentAudioStarted, noteAgentAudioEnded],
  );
}
