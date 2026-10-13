import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

vi.mock('@/lib/rehearsalLog', () => ({
  rehearsalLog: {
    start: vi.fn(),
    log: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    end: vi.fn(),
  },
}));

import { rehearsalLog } from '@/lib/rehearsalLog';
import {
  DEFAULT_CALIBRATION,
  buildTimeline,
  type ClockPosition,
} from '@/lib/teleprompterPacing';
import { useTeleprompterClock, type TeleprompterClock } from '../useTeleprompterClock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- Deterministic time: a fake performance.now() and a manually driven requestAnimationFrame ----

let now = 0;
let nextFrameId = 1;
let frameCallbacks = new Map<number, () => void>();

/** Run every frame callback that is queued right now, `dt` ms after the previous frame. */
function runFrame(dt: number) {
  now += dt;
  const queued = [...frameCallbacks.values()];
  frameCallbacks.clear();
  queued.forEach((callback) => callback());
}

/** Advance the clock by `totalMs` in `stepMs` frames. */
function advance(totalMs: number, stepMs = 20) {
  let left = totalMs;
  while (left > 0) {
    const dt = Math.min(stepMs, left);
    runFrame(dt);
    left -= dt;
  }
}

beforeEach(() => {
  now = 5000; // not 0, so a clock that confuses "time 0" with "unset" would show up
  nextFrameId = 1;
  frameCallbacks = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    const id = nextFrameId++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frameCallbacks.delete(id);
  });
  vi.mocked(rehearsalLog.log).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---- Fixtures and harness ----

/** A script line of `words` words. `tag` makes the text recognisable in the logging test. */
function line(type: ScriptLine['type'], words: number, tag = 'word'): ScriptLine {
  const dialogue = Array.from({ length: words }, () => tag).join(' ');
  return { type, content: dialogue, dialogue, paragraphIndex: 0 };
}

interface HarnessProps {
  lines: ScriptLine[];
  speed?: number;
  running?: boolean;
  resetKey?: number;
}

function setup(initial: HarnessProps) {
  const indices: number[] = [];
  const positions: ClockPosition[] = [];
  const onComplete = vi.fn();
  let clock!: TeleprompterClock;

  const Harness = ({ lines, speed = 1, running = true, resetKey = 0 }: HarnessProps) => {
    clock = useTeleprompterClock({
      lines,
      speed,
      running,
      resetKey,
      onIndexChange: (index) => indices.push(index),
      onPosition: (pos) => positions.push(pos),
      onComplete,
    });
    return null;
  };

  const root: Root = createRoot(document.createElement('div'));
  let current: HarnessProps = initial;
  const render = async (patch: Partial<HarnessProps> = {}) => {
    current = { ...current, ...patch };
    await act(async () => root.render(<Harness {...current} />));
  };
  const last = () => positions[positions.length - 1];
  const loggedPacing = () =>
    vi.mocked(rehearsalLog.log).mock.calls.filter(([event]) => event === 'pacing_sample');

  return {
    render,
    unmount: () => act(async () => root.unmount()),
    clock: () => clock,
    indices,
    positions,
    onComplete,
    last,
    loggedPacing,
  };
}

/** index + fraction as one number: the "place" in the script. */
const place = (pos: ClockPosition) => pos.index + pos.fraction;

/** The place never decreases across a list of reported positions. */
function expectNeverBackwards(positions: ClockPosition[]) {
  for (let i = 1; i < positions.length; i++) {
    expect(place(positions[i])).toBeGreaterThanOrEqual(place(positions[i - 1]) - 1e-9);
  }
}

// Durations at 1x with the default calibration: AI = 800 + words/156 min, actor = words/156 min.
//   10 words: actor 3846 ms, ai 4646 ms
const SCENE: ScriptLine[] = [line('ai', 10), line('actor', 10), line('ai', 10)];
const SCENE_TOTAL = buildTimeline(SCENE, { speed: 1, calibration: DEFAULT_CALIBRATION }).total;

describe('useTeleprompterClock indexes', () => {
  it('fires onIndexChange in order, once per line', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(SCENE_TOTAL + 1000);
    expect(h.indices).toEqual([0, 1, 2]);
    await h.unmount();
  });

  it('reports line 0 on the first running frame', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    expect(h.indices).toEqual([]); // nothing before the first frame
    advance(20);
    expect(h.indices).toEqual([0]);
    expect(h.last()).toMatchObject({ index: 0 });
    await h.unmount();
  });

  it('calls onPosition every frame with an increasing place', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(2000, 20);
    expect(h.positions).toHaveLength(100);
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('moves through a line at the line duration', async () => {
    const h = setup({ lines: [line('actor', 26), line('actor', 26)] }); // 10 s each at 1x
    await h.render();
    advance(2500);
    expect(h.last().index).toBe(0);
    expect(h.last().fraction).toBeCloseTo(0.25, 5);
    advance(10000);
    expect(h.last().index).toBe(1);
    expect(h.last().fraction).toBeCloseTo(0.25, 5);
    await h.unmount();
  });

  it('logs each line change with its type, word count and clock time (never its text)', async () => {
    const h = setup({ lines: [line('ai', 10, 'secret'), line('actor', 10, 'secret')] });
    await h.render();
    advance(6000);
    const changes = vi
      .mocked(rehearsalLog.log)
      .mock.calls.filter(([event]) => event === 'line_change')
      .map(([, data]) => data);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ index: 0, lineType: 'ai', words: 10 });
    expect(changes[1]).toMatchObject({ index: 1, lineType: 'actor', words: 10 });
    expect(changes[1]!.clockMs).toBeGreaterThanOrEqual(4600);
    expect(changes[1]!.clockMs).toBeLessThan(4700);
    expect(JSON.stringify(vi.mocked(rehearsalLog.log).mock.calls)).not.toContain('secret');
    await h.unmount();
  });

  it('does nothing for an empty script', async () => {
    const h = setup({ lines: [] });
    await h.render();
    advance(10000);
    expect(h.indices).toEqual([]);
    expect(h.positions).toEqual([]);
    expect(h.onComplete).not.toHaveBeenCalled();
    await h.unmount();
  });
});

describe('useTeleprompterClock running', () => {
  it('stays frozen while running is false', async () => {
    const h = setup({ lines: SCENE, running: false });
    await h.render();
    advance(10000);
    expect(h.indices).toEqual([]);
    expect(h.positions).toEqual([]);
    expect(frameCallbacks.size).toBe(0); // no frame loop at all
    await h.unmount();
  });

  it('starts counting when running turns on, not from when it was mounted', async () => {
    const h = setup({ lines: [line('actor', 26)], running: false }); // 10 s
    await h.render();
    advance(8000); // connecting...
    await h.render({ running: true });
    advance(2000);
    expect(h.last().index).toBe(0);
    expect(h.last().fraction).toBeCloseTo(0.2, 5);
    await h.unmount();
  });

  it('freezes on pause and continues from the same place on resume', async () => {
    const h = setup({ lines: [line('actor', 26)] }); // 10 s
    await h.render();
    advance(3000);
    const beforePause = h.last();
    expect(beforePause.fraction).toBeCloseTo(0.3, 5);

    await h.render({ running: false });
    const framesAtPause = h.positions.length;
    advance(60000); // a long pause
    expect(h.positions).toHaveLength(framesAtPause);
    expect(frameCallbacks.size).toBe(0);

    await h.render({ running: true });
    advance(1000);
    expect(h.last().fraction).toBeCloseTo(0.4, 5);
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('stops scheduling frames on unmount', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(100);
    expect(frameCallbacks.size).toBe(1);
    await h.unmount();
    expect(frameCallbacks.size).toBe(0);
    advance(1000);
    expect(h.positions.length).toBeLessThanOrEqual(5);
  });
});

describe('useTeleprompterClock resetKey', () => {
  it('goes back to the top and reports line 0 again', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(6000); // into line 1
    expect(h.last().index).toBe(1);

    await h.render({ resetKey: 1 });
    advance(20);
    expect(h.indices).toEqual([0, 1, 0]);
    expect(h.last().index).toBe(0);
    expect(h.last().fraction).toBeLessThan(0.01);
    await h.unmount();
  });

  it('resets while paused, so the next resume starts from the top', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(6000);
    await h.render({ running: false });
    await h.render({ resetKey: 1 });
    await h.render({ running: true });
    advance(20);
    expect(h.indices).toEqual([0, 1, 0]);
    await h.unmount();
  });

  it('lets the scene complete again after a reset', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(SCENE_TOTAL + 2500);
    expect(h.onComplete).toHaveBeenCalledTimes(1);

    await h.render({ resetKey: 1 });
    advance(SCENE_TOTAL + 2500);
    expect(h.onComplete).toHaveBeenCalledTimes(2);
    await h.unmount();
  });
});

describe('useTeleprompterClock seek', () => {
  it('jumps to a line and carries on from its start', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(500);
    act(() => h.clock().seek(2));
    expect(h.indices).toEqual([0, 2]);
    expect(h.last()).toEqual({ index: 2, fraction: 0 });

    advance(1000);
    expect(h.last().index).toBe(2);
    expect(h.last().fraction).toBeGreaterThan(0.15);
    expect(h.last().fraction).toBeLessThan(0.25);
    await h.unmount();
  });

  it('can jump back to an earlier line', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(6000);
    expect(h.last().index).toBe(1);
    act(() => h.clock().seek(0));
    expect(h.last()).toEqual({ index: 0, fraction: 0 });
    advance(100);
    expect(h.indices).toEqual([0, 1, 0]);
    await h.unmount();
  });

  it('reports a seek immediately even while paused', async () => {
    const h = setup({ lines: SCENE, running: false });
    await h.render();
    act(() => h.clock().seek(1));
    expect(h.indices).toEqual([1]);
    expect(h.last()).toEqual({ index: 1, fraction: 0 });

    await h.render({ running: true });
    advance(1000);
    expect(h.last().index).toBe(1);
    expect(h.last().fraction).toBeGreaterThan(0.2);
    await h.unmount();
  });

  it('clamps an out-of-range index', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(20);
    act(() => h.clock().seek(99));
    expect(h.last().index).toBe(2);
    act(() => h.clock().seek(-5));
    expect(h.last().index).toBe(0);
    await h.unmount();
  });

  it('logs the seek', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(20);
    act(() => h.clock().seek(2));
    expect(rehearsalLog.log).toHaveBeenCalledWith('seek', { toIndex: 2 });
    await h.unmount();
  });

  it('does not repeat a line change when seeking to the line already showing', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(1000);
    act(() => h.clock().seek(0));
    expect(h.indices).toEqual([0]);
    expect(h.last()).toEqual({ index: 0, fraction: 0 });
    await h.unmount();
  });

  it('has a stable identity across renders', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    const first = h.clock();
    await h.render({ speed: 1.1 });
    expect(h.clock()).toBe(first);
    await h.unmount();
  });
});

describe('useTeleprompterClock completion', () => {
  it('fires onComplete once, about 2 s after the last line ends', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(SCENE_TOTAL + 1900);
    expect(h.onComplete).not.toHaveBeenCalled();
    advance(200);
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    advance(10000);
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    expect(rehearsalLog.log).toHaveBeenCalledWith('complete');
    await h.unmount();
  });

  it('parks on the end of the last line while waiting', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(SCENE_TOTAL + 1000);
    expect(h.last()).toEqual({ index: 2, fraction: 1 });
    await h.unmount();
  });

  it('does not complete while paused', async () => {
    const h = setup({ lines: SCENE });
    await h.render();
    advance(SCENE_TOTAL);
    await h.render({ running: false });
    advance(60000);
    expect(h.onComplete).not.toHaveBeenCalled();
    await h.render({ running: true });
    advance(2100);
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    await h.unmount();
  });

  it('uses the latest onComplete callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const lines = [line('actor', 3)];
    const Harness = ({ onComplete }: { onComplete: () => void }) => {
      useTeleprompterClock({
        lines,
        speed: 1,
        running: true,
        resetKey: 0,
        onIndexChange: () => {},
        onPosition: () => {},
        onComplete,
      });
      return null;
    };
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Harness onComplete={first} />));
    await act(async () => root.render(<Harness onComplete={second} />));
    advance(1200 + 2100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});

describe('useTeleprompterClock keeps its place', () => {
  // Two long actor lines around an AI line, so a mid-line moment is far from any boundary.
  const LINES = [line('actor', 52), line('ai', 52), line('actor', 52)];

  it('changing speed mid-line keeps the same line and fraction, and only changes the rate', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(20000); // actor line is 20 s, so now at the top of line 1 (the AI line)
    advance(5000);
    const before = h.last();
    expect(before.index).toBe(1);

    await h.render({ speed: 1.2 });
    advance(1); // one tick so the new timeline reports
    const after = h.last();
    expect(after.index).toBe(before.index);
    expect(after.fraction).toBeGreaterThanOrEqual(before.fraction - 1e-9);
    expect(after.fraction - before.fraction).toBeLessThan(0.001);

    // From here the line is crossed 1.2x faster in its speaking part: compare progress over 1 s.
    const f0 = after.fraction;
    advance(1000, 1000);
    const fastGain = h.last().fraction - f0;

    await h.render({ speed: 1 });
    const g0 = h.last().fraction;
    advance(1000, 1000);
    const slowGain = h.last().fraction - g0;

    expect(fastGain).toBeGreaterThan(slowGain);
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('speeding up never moves the place backwards, however often it changes', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(7000);
    for (const speed of [1.2, 0.7, 1.1, 0.9, 1.2, 1]) {
      await h.render({ speed });
      advance(1500);
    }
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('is not moved at all by a speed change while paused', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(25000);
    await h.render({ running: false });
    const frozen = h.last();
    await h.render({ speed: 0.7 });
    await h.render({ running: true });
    advance(1);
    expect(h.last().index).toBe(frozen.index);
    expect(h.last().fraction).toBeGreaterThanOrEqual(frozen.fraction - 1e-9);
    expect(h.last().fraction - frozen.fraction).toBeLessThan(0.001);
    await h.unmount();
  });

  it('keeps the place when the script is edited mid-rehearsal', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(30000); // inside line 1
    const before = h.last();
    expect(before.index).toBe(1);

    // Line 0 gets much longer: the timeline shifts, the place does not.
    await h.render({ lines: [line('actor', 200), line('ai', 52), line('actor', 52)] });
    advance(1);
    expect(h.last().index).toBe(1);
    expect(h.last().fraction).toBeGreaterThanOrEqual(before.fraction - 1e-9);
    expect(h.last().fraction - before.fraction).toBeLessThan(0.001);
    await h.unmount();
  });

  it('does not disturb the place when the lines array is replaced by an identical one', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(12345);
    const before = h.last();
    await h.render({ lines: LINES.map((l) => ({ ...l })) });
    advance(1);
    expect(h.last().index).toBe(before.index);
    expect(h.last().fraction - before.fraction).toBeGreaterThanOrEqual(-1e-12);
    expect(h.last().fraction - before.fraction).toBeLessThan(0.001);
    await h.unmount();
  });

  it('keeps going if the script shrinks below the current line', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(45000); // line 2
    expect(h.last().index).toBe(2);
    await h.render({ lines: [line('actor', 10)] });
    advance(20);
    expect(h.last().index).toBe(0);
    await h.unmount();
  });
});

describe('useTeleprompterClock AI audio calibration', () => {
  // AI line first, then two more lines, so the clock stays inside line 0 for a long while.
  const LINES = [line('ai', 52), line('actor', 52), line('ai', 52)]; // AI line 800 + 20000 ms

  it('samples the response latency when audio starts inside an AI line', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(1500);
    act(() => h.clock().noteAgentAudioStarted());
    // 800 + 0.5 * (1500 - 800)
    expect(rehearsalLog.log).toHaveBeenCalledWith('pacing_sample', {
      kind: 'lead_in',
      value: 1500,
      leadInMs: 1150,
      aiWpmAt1x: 156,
    });
    await h.unmount();
  });

  it('keeps the same line and fraction when the lead-in sample lands, and never moves backwards', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(3000);
    const before = h.last();
    expect(before.index).toBe(0);

    act(() => h.clock().noteAgentAudioStarted()); // lead-in 800 -> 1900
    advance(1);
    const after = h.last();
    expect(after.index).toBe(0);
    expect(after.fraction).toBeGreaterThanOrEqual(before.fraction - 1e-9);
    expect(after.fraction - before.fraction).toBeLessThan(0.001);

    advance(5000);
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('a slower voice start stretches the AI line (the highlight waits for the voice)', async () => {
    const slow = setup({ lines: LINES });
    await slow.render();
    advance(3000);
    act(() => slow.clock().noteAgentAudioStarted());
    advance(1);
    const f0 = slow.last().fraction;
    advance(1000, 1000);
    const slowGain = slow.last().fraction - f0;
    await slow.unmount();

    const plain = setup({ lines: LINES });
    await plain.render();
    advance(3000);
    advance(1);
    const g0 = plain.last().fraction;
    advance(1000, 1000);
    const plainGain = plain.last().fraction - g0;
    await plain.unmount();

    expect(slowGain).toBeLessThan(plainGain);
  });

  it('samples 0 when audio starts before the clock reaches the next AI line', async () => {
    const lines = [line('actor', 52), line('ai', 10)];
    const h = setup({ lines });
    await h.render();
    advance(5000); // inside the actor line (20 s)
    act(() => h.clock().noteAgentAudioStarted());
    expect(rehearsalLog.log).toHaveBeenCalledWith('pacing_sample', {
      kind: 'lead_in',
      value: 0,
      leadInMs: 400, // 800 + 0.5 * (0 - 800)
      aiWpmAt1x: 156,
    });
    await h.unmount();
  });

  it('ignores audio that starts with no AI line at or ahead of the clock', async () => {
    const lines = [line('ai', 5), line('actor', 52)];
    const h = setup({ lines });
    await h.render();
    advance(5000); // past the AI line, inside the actor line
    expect(h.last().index).toBe(1);
    act(() => h.clock().noteAgentAudioStarted());
    expect(h.loggedPacing()).toHaveLength(0);
    await h.unmount();
  });

  it('ignores audio that starts while the clock is not running', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(1500);
    await h.render({ running: false });
    act(() => h.clock().noteAgentAudioStarted());
    expect(h.loggedPacing()).toHaveLength(0);
    await h.unmount();
  });

  it('clamps an extreme latency sample at 4 s', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(9000);
    act(() => h.clock().noteAgentAudioStarted());
    expect(rehearsalLog.log).toHaveBeenCalledWith('pacing_sample', {
      kind: 'lead_in',
      value: 9000, // the raw sample is logged ...
      leadInMs: 2400, // ... but only 4000 is blended in: 800 + 0.5 * 3200
      aiWpmAt1x: 156,
    });
    await h.unmount();
  });

  it('samples the speaking rate when audio ends', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(2000);
    // 10 words over 3 s = 200 wpm; 156 + 0.4 * 44 = 173.6
    act(() =>
      h.clock().noteAgentAudioEnded({ audioMs: 3000, text: 'one two three four five six seven eight nine ten' }),
    );
    expect(rehearsalLog.log).toHaveBeenCalledWith('pacing_sample', {
      kind: 'ai_rate',
      value: 200,
      leadInMs: 800,
      aiWpmAt1x: 174,
    });
    await h.unmount();
  });

  it('keeps the same line and fraction when a rate sample lands, and never moves backwards', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(8000);
    const before = h.last();
    expect(before.index).toBe(0);

    // A much faster voice than the default: the AI line shrinks, the place stays.
    act(() =>
      h.clock().noteAgentAudioEnded({ audioMs: 2000, text: 'one two three four five six seven eight nine ten' }),
    );
    advance(1);
    const after = h.last();
    expect(after.index).toBe(0);
    expect(after.fraction).toBeGreaterThanOrEqual(before.fraction - 1e-9);
    expect(after.fraction - before.fraction).toBeLessThan(0.001);

    advance(10000);
    expectNeverBackwards(h.positions);
    await h.unmount();
  });

  it('a faster measured voice makes the AI line finish sooner', async () => {
    const h = setup({ lines: [line('ai', 52), line('actor', 10)] });
    await h.render();
    advance(100);
    for (let i = 0; i < 6; i++) {
      act(() =>
        h.clock().noteAgentAudioEnded({ audioMs: 3000, text: 'one two three four five six seven eight nine ten' }),
      ); // 200 wpm
    }
    // Default: 800 + 20000 ms. Calibrated near 200 wpm: about 800 + 15600 ms.
    advance(17000);
    expect(h.last().index).toBe(1);
    await h.unmount();
  });

  it('skips a rate sample with no text, no duration, too few words or a tiny clip', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(2000);
    const clock = h.clock();
    act(() => clock.noteAgentAudioEnded({}));
    act(() => clock.noteAgentAudioEnded({ text: 'one two three four' }));
    act(() => clock.noteAgentAudioEnded({ audioMs: 3000 }));
    act(() => clock.noteAgentAudioEnded({ audioMs: 3000, text: '' }));
    act(() => clock.noteAgentAudioEnded({ audioMs: 3000, text: 'just two' }));
    act(() => clock.noteAgentAudioEnded({ audioMs: 300, text: 'one two three four' }));
    act(() => clock.noteAgentAudioEnded(undefined as never));
    expect(h.loggedPacing()).toHaveLength(0);
    await h.unmount();
  });

  it('still counts a rate sample while paused (it measures the clip, not the clock)', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(2000);
    await h.render({ running: false });
    act(() =>
      h.clock().noteAgentAudioEnded({ audioMs: 3000, text: 'one two three four five six seven eight nine ten' }),
    );
    expect(h.loggedPacing()).toHaveLength(1);
    await h.unmount();
  });

  it('settles on the measured values over repeated samples', async () => {
    const h = setup({ lines: LINES });
    await h.render();
    advance(1000);
    for (let i = 0; i < 12; i++) {
      act(() =>
        h.clock().noteAgentAudioEnded({ audioMs: 3000, text: 'one two three four five six seven eight nine ten' }),
      );
    }
    const samples = h.loggedPacing();
    expect(samples).toHaveLength(12);
    const lastData = samples[samples.length - 1][1]!;
    expect(lastData.kind).toBe('ai_rate');
    expect(lastData.aiWpmAt1x).toBe(200);
    await h.unmount();
  });

  it('keeps the learned calibration across a restart', async () => {
    const h = setup({ lines: [line('ai', 52), line('actor', 10)] });
    await h.render();
    advance(100);
    for (let i = 0; i < 8; i++) {
      act(() =>
        h.clock().noteAgentAudioEnded({ audioMs: 3000, text: 'one two three four five six seven eight nine ten' }),
      );
    }
    await h.render({ resetKey: 1 });
    advance(17000); // line 0 now lasts about 800 + 15600 ms rather than 20800 ms
    expect(h.last().index).toBe(1);
    await h.unmount();
  });
});
