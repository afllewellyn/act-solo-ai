import { describe, expect, it } from 'vitest';
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import {
  BASE_WORDS_PER_MINUTE,
  DEFAULT_CALIBRATION,
  MIN_LINE_MS,
  buildTimeline,
  countWords,
  elapsedAt,
  positionAt,
  startOf,
  updateCalibration,
  type PacingCalibration,
  type Timeline,
} from '@/lib/teleprompterPacing';

/** A script line of exactly `words` words. */
function line(type: ScriptLine['type'], words: number, paragraphIndex = 0): ScriptLine {
  const dialogue = Array.from({ length: words }, () => 'word').join(' ');
  return { type, content: dialogue, dialogue, paragraphIndex };
}

const ms = (words: number, wpm: number, speed: number) => (words / (wpm * speed)) * 60000;

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('  padded   with\n\nlots\tof   space ')).toBe(5);
  });

  it('is 0 for empty or blank text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
  });
});

describe('buildTimeline durations', () => {
  const noLeadIn: PacingCalibration = { aiWpmAt1x: 156, leadInMs: 0 };

  it('uses the shared 156 wpm base: 26 words take 10 s at 1x', () => {
    expect(BASE_WORDS_PER_MINUTE).toBe(156);
    const t = buildTimeline([line('actor', 26)], { speed: 1, calibration: DEFAULT_CALIBRATION });
    expect(t.durations[0]).toBeCloseTo(10000, 6);
  });

  it('scales durations with speed', () => {
    const lines = [line('actor', 60), line('note', 40), line('ai', 50)];
    const at1 = buildTimeline(lines, { speed: 1, calibration: noLeadIn });
    const at12 = buildTimeline(lines, { speed: 1.2, calibration: noLeadIn });
    const at07 = buildTimeline(lines, { speed: 0.7, calibration: noLeadIn });
    for (let i = 0; i < lines.length; i++) {
      expect(at12.durations[i]).toBeCloseTo(at1.durations[i] / 1.2, 6);
      expect(at07.durations[i]).toBeCloseTo(at1.durations[i] / 0.7, 6);
    }
    expect(at12.total).toBeLessThan(at1.total);
    expect(at07.total).toBeGreaterThan(at1.total);
  });

  it('never makes a line shorter than the minimum', () => {
    const lines = [line('actor', 1), line('note', 0), line('ai', 1), line('ai', 0)];
    const t = buildTimeline(lines, { speed: 1.2, calibration: DEFAULT_CALIBRATION });
    expect(t.durations).toEqual([MIN_LINE_MS, MIN_LINE_MS, MIN_LINE_MS, MIN_LINE_MS]);
  });

  it('adds leadInMs to AI lines but not to user or note lines', () => {
    const lines = [line('actor', 26), line('note', 26), line('ai', 26)];
    const t = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    expect(t.durations[0]).toBeCloseTo(10000, 6); // actor: no lead-in
    expect(t.durations[1]).toBeCloseTo(10000, 6); // note: no lead-in
    expect(t.durations[2]).toBeCloseTo(DEFAULT_CALIBRATION.leadInMs + 10000, 6);

    // A different lead-in moves only the AI line.
    const slow = buildTimeline(lines, { speed: 1, calibration: { aiWpmAt1x: 156, leadInMs: 2000 } });
    expect(slow.durations[0]).toBeCloseTo(10000, 6);
    expect(slow.durations[1]).toBeCloseTo(10000, 6);
    expect(slow.durations[2]).toBeCloseTo(12000, 6);
  });

  it('paces AI lines with the measured rate, user lines with the base rate', () => {
    const cal: PacingCalibration = { aiWpmAt1x: 200, leadInMs: 1500 };
    const t = buildTimeline([line('ai', 26), line('actor', 26)], { speed: 1, calibration: cal });
    expect(t.durations[0]).toBeCloseTo(1500 + ms(26, 200, 1), 6);
    expect(t.durations[1]).toBeCloseTo(ms(26, BASE_WORDS_PER_MINUTE, 1), 6);
  });

  it('scales only the speaking part of an AI line with speed, not the lead-in', () => {
    const cal: PacingCalibration = { aiWpmAt1x: 200, leadInMs: 1500 };
    const at1 = buildTimeline([line('ai', 60)], { speed: 1, calibration: cal });
    const at2 = buildTimeline([line('ai', 60)], { speed: 2, calibration: cal });
    expect(at2.durations[0] - 1500).toBeCloseTo((at1.durations[0] - 1500) / 2, 6);
  });

  it('lays lines end to end', () => {
    const lines = [line('ai', 20), line('actor', 30), line('note', 5), line('ai', 12)];
    const t = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    expect(t.starts[0]).toBe(0);
    for (let i = 1; i < lines.length; i++) {
      expect(t.starts[i]).toBeCloseTo(t.starts[i - 1] + t.durations[i - 1], 9);
    }
    expect(t.total).toBeCloseTo(t.durations.reduce((sum, d) => sum + d, 0), 6);
  });

  it('handles an empty script', () => {
    expect(buildTimeline([], { speed: 1, calibration: DEFAULT_CALIBRATION })).toEqual({
      starts: [],
      durations: [],
      total: 0,
    });
  });

  it('falls back to 1x for an unusable speed', () => {
    const lines = [line('actor', 26)];
    const at1 = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    for (const speed of [0, -1, NaN, Infinity]) {
      expect(buildTimeline(lines, { speed, calibration: DEFAULT_CALIBRATION })).toEqual(at1);
    }
  });
});

describe('positionAt', () => {
  const t: Timeline = { starts: [0, 2000, 5000], durations: [2000, 3000, 1500], total: 6500 };

  it('is the top of line 0 at and before time 0', () => {
    expect(positionAt(t, 0)).toEqual({ index: 0, fraction: 0, done: false });
    expect(positionAt(t, -250)).toEqual({ index: 0, fraction: 0, done: false });
  });

  it('interpolates inside a line', () => {
    expect(positionAt(t, 1000)).toEqual({ index: 0, fraction: 0.5, done: false });
    expect(positionAt(t, 3500)).toEqual({ index: 1, fraction: 0.5, done: false });
    expect(positionAt(t, 5750)).toEqual({ index: 2, fraction: 0.5, done: false });
  });

  it('switches to the next line exactly on a boundary', () => {
    expect(positionAt(t, 2000)).toEqual({ index: 1, fraction: 0, done: false });
    expect(positionAt(t, 5000)).toEqual({ index: 2, fraction: 0, done: false });
    const justBefore = positionAt(t, 1999.999);
    expect(justBefore.index).toBe(0);
    expect(justBefore.fraction).toBeGreaterThan(0.9999);
    expect(justBefore.done).toBe(false);
  });

  it('is done on the last line at fraction 1 at and past the end', () => {
    expect(positionAt(t, 6499).done).toBe(false);
    expect(positionAt(t, 6500)).toEqual({ index: 2, fraction: 1, done: true });
    expect(positionAt(t, 99999)).toEqual({ index: 2, fraction: 1, done: true });
  });

  it('treats a non-finite time as 0', () => {
    expect(positionAt(t, NaN)).toEqual({ index: 0, fraction: 0, done: false });
  });

  it('is done immediately for an empty timeline', () => {
    const empty = { starts: [], durations: [], total: 0 };
    expect(positionAt(empty, 0)).toEqual({ index: 0, fraction: 0, done: true });
    expect(positionAt(empty, 1000)).toEqual({ index: 0, fraction: 0, done: true });
  });

  it('visits lines in order and never goes backwards as time advances', () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(i % 3 === 0 ? 'ai' : 'actor', 3 + (i % 11)));
    const timeline = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    let prev = -1;
    for (let e = 0; e <= timeline.total; e += 37) {
      const p = positionAt(timeline, e);
      const place = p.index + p.fraction;
      expect(place).toBeGreaterThanOrEqual(prev);
      prev = place;
    }
  });
});

describe('elapsedAt', () => {
  const lines = [line('ai', 20), line('actor', 30), line('note', 5), line('ai', 12), line('actor', 8)];
  const t = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });

  it('round-trips with positionAt across the whole scene', () => {
    for (let e = 0; e < t.total; e += 113) {
      const p = positionAt(t, e);
      expect(elapsedAt(t, { index: p.index, fraction: p.fraction })).toBeCloseTo(e, 6);
    }
  });

  it('round-trips a position', () => {
    for (const pos of [
      { index: 0, fraction: 0 },
      { index: 1, fraction: 0.25 },
      { index: 3, fraction: 0.999 },
      { index: 4, fraction: 0.5 },
    ]) {
      const back = positionAt(t, elapsedAt(t, pos));
      expect(back.index).toBe(pos.index);
      expect(back.fraction).toBeCloseTo(pos.fraction, 6);
    }
  });

  it('treats the end of a line as the start of the next', () => {
    expect(elapsedAt(t, { index: 1, fraction: 1 })).toBeCloseTo(t.starts[2], 6);
  });

  it('puts the end of the last line at the total', () => {
    expect(elapsedAt(t, { index: 4, fraction: 1 })).toBeCloseTo(t.total, 6);
  });

  it('clamps an out-of-range position', () => {
    expect(elapsedAt(t, { index: -3, fraction: -1 })).toBe(0);
    expect(elapsedAt(t, { index: 99, fraction: 5 })).toBeCloseTo(t.total, 6);
    expect(elapsedAt(t, { index: 2, fraction: NaN })).toBe(t.starts[2]);
  });

  it('is 0 for an empty timeline', () => {
    expect(elapsedAt({ starts: [], durations: [], total: 0 }, { index: 3, fraction: 0.5 })).toBe(0);
  });

  it('keeps the place when the timeline is rebuilt at a new speed', () => {
    const at1 = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    const place = positionAt(at1, at1.starts[3] + at1.durations[3] * 0.4);
    expect(place.index).toBe(3);

    const at12 = buildTimeline(lines, { speed: 1.2, calibration: DEFAULT_CALIBRATION });
    const after = positionAt(at12, elapsedAt(at12, place));
    expect(after.index).toBe(3);
    expect(after.fraction).toBeCloseTo(place.fraction, 6);
  });

  it('keeps the place when the calibration changes', () => {
    const before = buildTimeline(lines, { speed: 1, calibration: DEFAULT_CALIBRATION });
    const place = positionAt(before, before.starts[3] + before.durations[3] * 0.4);
    const calibrated = updateCalibration(DEFAULT_CALIBRATION, { leadInMs: 2500, words: 10, audioMs: 2500 });
    const after = buildTimeline(lines, { speed: 1, calibration: calibrated });
    const kept = positionAt(after, elapsedAt(after, place));
    expect(kept.index).toBe(3);
    expect(kept.fraction).toBeCloseTo(place.fraction, 6);
  });
});

describe('startOf (seeking)', () => {
  const t = buildTimeline([line('ai', 20), line('actor', 30), line('ai', 12)], {
    speed: 1,
    calibration: DEFAULT_CALIBRATION,
  });

  it('returns the start of each line', () => {
    expect(startOf(t, 0)).toBe(0);
    expect(startOf(t, 1)).toBe(t.starts[1]);
    expect(startOf(t, 2)).toBe(t.starts[2]);
  });

  it('lands the clock exactly at the top of the sought line', () => {
    for (let i = 0; i < 3; i++) {
      expect(positionAt(t, startOf(t, i))).toEqual({ index: i, fraction: 0, done: false });
    }
  });

  it('clamps an out-of-range index', () => {
    expect(startOf(t, -4)).toBe(0);
    expect(startOf(t, 50)).toBe(t.starts[2]);
  });

  it('is 0 for an empty timeline', () => {
    expect(startOf({ starts: [], durations: [], total: 0 }, 2)).toBe(0);
  });
});

describe('updateCalibration', () => {
  const base: PacingCalibration = { aiWpmAt1x: 156, leadInMs: 800 };

  it('has the documented defaults', () => {
    expect(DEFAULT_CALIBRATION).toEqual({ aiWpmAt1x: 156, leadInMs: 800 });
  });

  describe('lead-in samples', () => {
    it('blends with an exponential moving average (alpha 0.5)', () => {
      expect(updateCalibration(base, { leadInMs: 1200 }).leadInMs).toBe(1000);
      // Repeated samples converge on the measured value.
      let cal = base;
      for (let i = 0; i < 12; i++) cal = updateCalibration(cal, { leadInMs: 2000 });
      expect(cal.leadInMs).toBeCloseTo(2000, 0);
    });

    it('clamps a huge sample to 4000 ms before blending', () => {
      expect(updateCalibration(base, { leadInMs: 60000 }).leadInMs).toBe(2400); // 800 + 0.5 * (4000 - 800)
    });

    it('clamps a negative sample to 0 ms before blending', () => {
      expect(updateCalibration(base, { leadInMs: -500 }).leadInMs).toBe(400);
    });

    it('accepts a zero sample (voice started early)', () => {
      expect(updateCalibration(base, { leadInMs: 0 }).leadInMs).toBe(400);
    });

    it('does not touch the speaking rate', () => {
      expect(updateCalibration(base, { leadInMs: 1500 }).aiWpmAt1x).toBe(156);
    });
  });

  describe('speaking-rate samples', () => {
    it('measures words per minute from the clip and blends (alpha 0.4)', () => {
      // 10 words in 3 s = 200 wpm; 156 + 0.4 * 44
      const next = updateCalibration(base, { words: 10, audioMs: 3000 });
      expect(next.aiWpmAt1x).toBeCloseTo(173.6, 9);
      expect(next.leadInMs).toBe(800);
    });

    it('converges on a steady measured rate', () => {
      let cal = base;
      for (let i = 0; i < 20; i++) cal = updateCalibration(cal, { words: 17, audioMs: 6000 }); // 170 wpm
      expect(cal.aiWpmAt1x).toBeCloseTo(170, 1);
    });

    it('clamps a very fast sample to 260 wpm', () => {
      // 100 words in 1 s = 6000 wpm -> 260
      expect(updateCalibration(base, { words: 100, audioMs: 1000 }).aiWpmAt1x).toBeCloseTo(
        156 + 0.4 * (260 - 156),
        9,
      );
    });

    it('clamps a very slow sample to 90 wpm', () => {
      // 3 words in 20 s = 9 wpm -> 90
      expect(updateCalibration(base, { words: 3, audioMs: 20000 }).aiWpmAt1x).toBeCloseTo(
        156 + 0.4 * (90 - 156),
        9,
      );
    });

    it('uses a sample right at the thresholds (3 words, 500 ms)', () => {
      const next = updateCalibration(base, { words: 3, audioMs: 500 }); // 360 wpm -> 260
      expect(next).not.toBe(base);
      expect(next.aiWpmAt1x).toBeCloseTo(156 + 0.4 * (260 - 156), 9);
    });
  });

  describe('skipped samples leave the calibration unchanged', () => {
    it.each([
      ['too few words', { words: 2, audioMs: 3000 }],
      ['zero words', { words: 0, audioMs: 3000 }],
      ['tiny audioMs', { words: 10, audioMs: 499 }],
      ['zero audioMs', { words: 10, audioMs: 0 }],
      ['negative audioMs', { words: 10, audioMs: -1000 }],
      ['missing audioMs', { words: 10 }],
      ['missing words', { audioMs: 3000 }],
      ['NaN audioMs', { words: 10, audioMs: NaN }],
      ['infinite words', { words: Infinity, audioMs: 3000 }],
      ['non-finite lead-in', { leadInMs: NaN }],
      ['empty sample', {}],
    ])('%s', (_name, sample) => {
      const cal: PacingCalibration = { aiWpmAt1x: 180, leadInMs: 1100 };
      const next = updateCalibration(cal, sample);
      expect(next).toEqual({ aiWpmAt1x: 180, leadInMs: 1100 });
      expect(next).toBe(cal); // same object, so callers can tell nothing changed
    });
  });

  it('applies both parts of a combined sample', () => {
    const next = updateCalibration(base, { leadInMs: 1200, words: 10, audioMs: 3000 });
    expect(next.leadInMs).toBe(1000);
    expect(next.aiWpmAt1x).toBeCloseTo(173.6, 9);
  });

  it('still applies a usable part when the other part is skipped', () => {
    const next = updateCalibration(base, { leadInMs: 1200, words: 2, audioMs: 3000 });
    expect(next.leadInMs).toBe(1000);
    expect(next.aiWpmAt1x).toBe(156);
  });

  it('never mutates its input', () => {
    const cal: PacingCalibration = { aiWpmAt1x: 156, leadInMs: 800 };
    updateCalibration(cal, { leadInMs: 3000, words: 20, audioMs: 4000 });
    expect(cal).toEqual({ aiWpmAt1x: 156, leadInMs: 800 });
    expect(DEFAULT_CALIBRATION).toEqual({ aiWpmAt1x: 156, leadInMs: 800 });
  });

  it('feeds back into AI line durations', () => {
    const lines = [line('ai', 30)];
    const before = buildTimeline(lines, { speed: 1, calibration: base }).durations[0];
    const faster = updateCalibration(base, { words: 30, audioMs: 7500 }); // 240 wpm
    const after = buildTimeline(lines, { speed: 1, calibration: faster }).durations[0];
    expect(after).toBeLessThan(before);
  });
});
