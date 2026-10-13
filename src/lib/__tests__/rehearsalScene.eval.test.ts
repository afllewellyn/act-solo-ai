/**
 * E2 scene-simulation eval: drives the REAL teleprompter code through whole rehearsal scenes.
 *
 * What is real: `@/lib/teleprompterPacing` and the `useTeleprompterClock` hook (rendered with React).
 * What is simulated: only time (a fake `performance.now()` and a hand-driven `requestAnimationFrame`)
 * and the two people in the room, scheduled on a "world" clock that is separate from the hook's own:
 *
 *  - Actor: speaks a line starting the moment the previous line ends, taking 10% longer than the
 *    clock's word-count estimate for that line (the estimate comes from the real `buildTimeline`).
 *  - Agent: starts talking 1 s after the actor's line REALLY ended (or 1 s after the scene starts when
 *    it opens), speaks at 170 words per minute, and reports to the hook exactly the way the engine does:
 *    `noteAgentAudioStarted()` when audio begins and, 600 ms after the voice stops (the engine's idle
 *    check, since the server sends no `audio_end`), `noteAgentAudioEnded({ audioMs, text })` with
 *    `audioMs` = the clip length at 1x speed and `text` = what was said in that burst.
 *
 * Agent burst model. A run of consecutive AI lines is one agent turn, so by default it is ONE audio burst
 * (one started event, one ended event carrying all of the run's text). The second block of scenarios
 * repeats every scene with the other plausible behaviour: one burst per AI line, 800 ms apart.
 *
 * Bars (all must hold; none is adjusted to fit):
 *  (a) every line is highlighted exactly once, in order
 *  (b) the highlight never stays on a line longer than that line's duration plus 2 s. "That line's
 *      duration" is the duration the real timeline gives the line under the calibration in force while
 *      it was highlighted (so the last line's deliberate 2 s grace period is the allowed slack).
 *      One 60 fps frame of tolerance is allowed for frame discretisation.
 *  (c) the scene completes (`onComplete` fires, exactly once)
 *  (d) after the first two AI lines, the highlight enters each AI line within 1.5 s (either side) of the
 *      simulated voice starting that line
 *  (e) pausing (`running=false`) freezes the clock, and a Speed change mid-scene does not jump the place
 *
 * Two diagnostics are reported but not asserted: how long the highlight stays on a line beyond the line's
 * TRUE duration in the simulated world, and the per-frame step size (asserted only as part of (e)).
 *
 * Numbers are printed once per scenario ("[rehearsalScene.eval]") so a run records the real margins.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
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
  MIN_LINE_MS,
  buildTimeline,
  countWords,
  type ClockPosition,
  type PacingCalibration,
} from '@/lib/teleprompterPacing';
import { useTeleprompterClock, type TeleprompterClock } from '@/hooks/useTeleprompterClock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------------------------
// Simulation parameters (fixed up front)
// ---------------------------------------------------------------------------------------------

const FRAME_MS = 1000 / 60;
/** Agent starts speaking this long after the actor's line really ended. */
const AGENT_LATENCY_MS = 1000;
const AGENT_WPM = 170;
/** The actor takes this much longer than the word-count estimate. */
const ACTOR_SLOWDOWN = 1.1;
/** The engine ends an audio burst this long after the player drains (AUDIO_IDLE_MS). */
const ENGINE_IDLE_END_MS = 600;
/** Gap between separate agent responses when each AI line is its own burst. */
const RESPONSE_GAP_MS = 800;

/** Bar (b): slack allowed on top of a line's duration. */
const STALL_SLACK_MS = 2000;
/** Bar (d): highlight entry vs voice start. */
const ENTRY_WINDOW_MS = 1500;
/** Bar (d) only applies once this many AI lines have been spoken. */
const AI_LINES_BEFORE_CHECK = 2;
/** Biggest legitimate step of "index + fraction" in one frame: a line is never shorter than MIN_LINE_MS. */
const MAX_FRAME_STEP = FRAME_MS / MIN_LINE_MS + 1e-3;

// ---------------------------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------------------------

type Role = 'ai' | 'actor';
interface SceneDef {
  name: string;
  lines: Array<[Role, string]>;
}

const SCENES: SceneDef[] = [
  {
    name: 'ai-first',
    lines: [
      ['ai', 'You came back.'],
      ['actor', 'I said I would.'],
      ['ai', 'People say a lot of things.'],
      ['actor', 'Not me.'],
      ['ai', 'We will see.'],
    ],
  },
  {
    name: 'actor-first',
    lines: [
      ['actor', 'Is anyone there?'],
      ['ai', 'I am.'],
      ['actor', 'Where are you?'],
      ['ai', 'Right behind you.'],
      ['actor', 'Do not joke.'],
      ['ai', 'Who is joking?'],
    ],
  },
  {
    name: 'ai-run',
    lines: [
      ['actor', 'Tell me what happened.'],
      ['ai', 'The lights went out.'],
      ['ai', 'Then the alarm started.'],
      ['ai', 'Then nothing.'],
      ['actor', 'Nothing at all?'],
      ['ai', 'Nothing at all.'],
      ['ai', 'Not a sound.'],
    ],
  },
  {
    name: 'ends-on-ai',
    lines: [
      ['actor', 'Goodbye, then.'],
      ['ai', 'Goodbye.'],
      ['actor', 'Will I see you again?'],
      ['ai', 'Perhaps.'],
      ['ai', 'Perhaps not.'],
    ],
  },
];

function toScriptLines(def: SceneDef): ScriptLine[] {
  return def.lines.map(([type, dialogue], index) => ({
    type,
    dialogue,
    content: `<p>${dialogue}</p>`,
    paragraphIndex: index,
  }));
}

// ---------------------------------------------------------------------------------------------
// Virtual time: fake performance.now() and a hand-driven requestAnimationFrame
// ---------------------------------------------------------------------------------------------

let now = 0;
let nextFrameId = 1;
let frameCallbacks = new Map<number, () => void>();

function runQueuedFrames() {
  const queued = [...frameCallbacks.values()];
  frameCallbacks.clear();
  queued.forEach((callback) => callback());
}

async function inVirtualTime<T>(body: () => Promise<T>): Promise<T> {
  now = 10_000; // not 0, so a clock that confuses "time 0" with "unset" would show up
  nextFrameId = 1;
  frameCallbacks = new Map();
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    const id = nextFrameId++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frameCallbacks.delete(id);
  });
  try {
    return await body();
  } finally {
    nowSpy.mockRestore();
    vi.unstubAllGlobals();
  }
}

// ---------------------------------------------------------------------------------------------
// The simulated world: when the actor and the agent really speak
// ---------------------------------------------------------------------------------------------

type AgentMode = 'one-burst-per-turn' | 'one-burst-per-line';

interface PlannedLine {
  index: number;
  type: ScriptLine['type'];
  /** When this line's turn begins (the previous line's end). */
  slotStart: number;
  /** When the person/voice actually starts the line. */
  start: number;
  end: number;
}

interface SimEvent {
  at: number;
  fire: (clock: TeleprompterClock) => void;
}

interface World {
  planned: PlannedLine[];
  events: SimEvent[];
  endMs: number;
}

function planWorld(lines: ScriptLine[], speed: number, mode: AgentMode): World {
  const planned: PlannedLine[] = [];
  const events: SimEvent[] = [];
  let t = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type !== 'ai') {
      // The actor: 10% slower than the clock's own word-count estimate for the line.
      const estimate = buildTimeline([line], { speed, calibration: DEFAULT_CALIBRATION }).durations[0];
      const end = t + estimate * ACTOR_SLOWDOWN;
      planned[i] = { index: i, type: line.type, slotStart: t, start: t, end };
      t = end;
      i += 1;
      continue;
    }

    // A run of consecutive AI lines.
    let runEnd = i;
    while (runEnd < lines.length && lines[runEnd].type === 'ai') runEnd += 1;
    const indexes = Array.from({ length: runEnd - i }, (_, n) => i + n);
    const bursts = mode === 'one-burst-per-turn' ? [indexes] : indexes.map((index) => [index]);

    const runSlotStart = t;
    let cursor = t + AGENT_LATENCY_MS;
    bursts.forEach((burst, burstNo) => {
      if (burstNo > 0) cursor += RESPONSE_GAP_MS;
      const burstStart = cursor;
      let words = 0;
      for (const index of burst) {
        const w = countWords(lines[index].dialogue);
        const duration = (w / (AGENT_WPM * speed)) * 60000;
        planned[index] = {
          index,
          type: 'ai',
          slotStart: index === indexes[0] ? runSlotStart : planned[index - 1].end,
          start: cursor,
          end: cursor + duration,
        };
        cursor += duration;
        words += w;
      }
      const text = burst.map((index) => lines[index].dialogue).join(' ');
      const audioMs = (words / AGENT_WPM) * 60000; // clip length at 1x
      events.push({ at: burstStart, fire: (clock) => clock.noteAgentAudioStarted() });
      events.push({
        at: cursor + ENGINE_IDLE_END_MS,
        fire: (clock) => clock.noteAgentAudioEnded({ audioMs, text }),
      });
    });

    t = cursor;
    i = runEnd;
  }

  events.sort((a, b) => a.at - b.at);
  return { planned, events, endMs: t };
}

// ---------------------------------------------------------------------------------------------
// The simulation: world + real hook
// ---------------------------------------------------------------------------------------------

interface Entry {
  index: number;
  /** World ms. */
  t: number;
}

interface CalibrationChange {
  t: number;
  cal: PacingCalibration;
}

const place = (pos: ClockPosition) => pos.index + pos.fraction;

async function createSim(lines: ScriptLine[], opts: { speed?: number; mode?: AgentMode } = {}) {
  const startSpeed = opts.speed ?? 1;
  const world = planWorld(lines, startSpeed, opts.mode ?? 'one-burst-per-turn');
  const pending = [...world.events];

  let trueMs = 0; // world time since the scene started
  let pausedMs = 0; // virtual time spent paused (the world is frozen too)
  const startNow = now;

  const entries: Entry[] = [];
  const positions: ClockPosition[] = [];
  let maxFrameStep = 0;
  let minFrameStep = 0;
  let completeCount = 0;
  let completeAt: number | null = null;
  const calibrations: CalibrationChange[] = [];
  let clock!: TeleprompterClock;

  vi.mocked(rehearsalLog.log).mockReset();
  vi.mocked(rehearsalLog.log).mockImplementation((event, data) => {
    if (event === 'pacing_sample' && data) {
      calibrations.push({
        t: trueMs,
        cal: { leadInMs: Number(data.leadInMs), aiWpmAt1x: Number(data.aiWpmAt1x) },
      });
    }
  });

  let props = { running: true, speed: startSpeed, resetKey: 0 };
  const Harness = (p: typeof props) => {
    clock = useTeleprompterClock({
      lines,
      speed: p.speed,
      running: p.running,
      resetKey: p.resetKey,
      onIndexChange: (index) => entries.push({ index, t: trueMs }),
      onPosition: (pos) => {
        const last = positions[positions.length - 1];
        if (last) {
          const step = place(pos) - place(last);
          maxFrameStep = Math.max(maxFrameStep, step);
          minFrameStep = Math.min(minFrameStep, step);
        }
        positions.push(pos);
      },
      onComplete: () => {
        completeCount += 1;
        completeAt = trueMs;
      },
    });
    return null;
  };

  const root = createRoot(document.createElement('div'));
  const render = (patch: Partial<typeof props> = {}) => {
    props = { ...props, ...patch };
    return act(async () => root.render(React.createElement(Harness, props)));
  };
  await render();

  const stepFrame = () => {
    const target = trueMs + FRAME_MS;
    while (pending.length > 0 && pending[0].at <= target) {
      const event = pending.shift()!;
      trueMs = Math.max(trueMs, event.at);
      now = startNow + pausedMs + trueMs;
      event.fire(clock);
    }
    trueMs = target;
    now = startNow + pausedMs + trueMs;
    runQueuedFrames();
  };

  const sim = {
    world,
    lines,
    entries,
    positions,
    calibrations,
    get completeCount() {
      return completeCount;
    },
    get completeAt() {
      return completeAt;
    },
    get trueMs() {
      return trueMs;
    },
    get maxFrameStep() {
      return maxFrameStep;
    },
    get minFrameStep() {
      return minFrameStep;
    },
    last: () => positions[positions.length - 1],
    advanceBy(ms: number) {
      const end = trueMs + ms;
      while (trueMs < end - 1e-9) stepFrame();
    },
    runToCompletion(limitMs: number) {
      while (completeCount === 0 && trueMs < limitMs) stepFrame();
    },
    setSpeed: (speed: number) => render({ speed }),
    /** Pause for `ms` of real time. Like a browser, keeps calling whatever frame callbacks are queued. */
    async pauseFor(ms: number) {
      await render({ running: false });
      const before = { positions: positions.length, entries: entries.length, complete: completeCount };
      let frameCallbacksSeen = 0;
      for (let waited = 0; waited < ms; waited += FRAME_MS) {
        now += FRAME_MS;
        frameCallbacksSeen += frameCallbacks.size;
        runQueuedFrames();
      }
      pausedMs += ms;
      const during = {
        positionCalls: positions.length - before.positions,
        indexCalls: entries.length - before.entries,
        completeCalls: completeCount - before.complete,
        frameCallbacksSeen,
      };
      await render({ running: true });
      return during;
    },
    unmount: () => act(async () => root.unmount()),
  };
  return sim;
}

type Sim = Awaited<ReturnType<typeof createSim>>;

// ---------------------------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------------------------

function calibrationAt(sim: Sim, t: number): PacingCalibration {
  let cal = DEFAULT_CALIBRATION;
  for (const change of sim.calibrations) if (change.t <= t) cal = change.cal;
  return cal;
}

function firstEntry(sim: Sim, index: number): number {
  const entry = sim.entries.find((e) => e.index === index);
  return entry ? entry.t : Number.NaN;
}

interface AiLineResult {
  index: number;
  ordinal: number;
  voiceStartMs: number;
  entryMs: number;
  /** voice start minus highlight entry: positive = highlight entered BEFORE the voice (lead), negative = after (lag). */
  offsetMs: number;
}

interface StallResult {
  index: number;
  dwellMs: number;
  plannedMs: number;
  /** dwell minus the timeline's own duration for the line (bar (b) allows 2000). */
  excessMs: number;
  /** dwell minus the line's true duration in the simulated world (diagnostic only). */
  excessOverTrueMs: number;
}

interface SceneResult {
  name: string;
  mode: AgentMode;
  indices: number[];
  aiLines: AiLineResult[];
  stalls: StallResult[];
  completeCount: number;
  completeAtMs: number | null;
  worldEndMs: number;
  maxFrameStep: number;
  minFrameStep: number;
  finalCalibration: PacingCalibration;
  calibrationUpdates: number;
}

async function simulateScene(def: SceneDef, mode: AgentMode): Promise<SceneResult> {
  const lines = toScriptLines(def);
  const sim = await createSim(lines, { mode });
  sim.runToCompletion(sim.world.endMs + 60_000);

  const n = lines.length;
  const aiLines: AiLineResult[] = [];
  let ordinal = 0;
  lines.forEach((line, index) => {
    if (line.type !== 'ai') return;
    const entryMs = firstEntry(sim, index);
    const voiceStartMs = sim.world.planned[index].start;
    aiLines.push({ index, ordinal, voiceStartMs, entryMs, offsetMs: voiceStartMs - entryMs });
    ordinal += 1;
  });

  const stalls: StallResult[] = lines.map((_, index) => {
    const enter = firstEntry(sim, index);
    const leave = index < n - 1 ? firstEntry(sim, index + 1) : (sim.completeAt ?? Number.NaN);
    const dwellMs = leave - enter;
    // The timeline's duration for this line under every calibration in force while it was highlighted.
    const cals = [calibrationAt(sim, enter), ...sim.calibrations.filter((c) => c.t > enter && c.t <= leave).map((c) => c.cal)];
    const plannedMs = Math.max(
      ...cals.map((cal) => buildTimeline(lines, { speed: 1, calibration: cal }).durations[index]),
    );
    const planned = sim.world.planned[index];
    return {
      index,
      dwellMs,
      plannedMs,
      excessMs: dwellMs - plannedMs,
      excessOverTrueMs: dwellMs - (planned.end - planned.slotStart),
    };
  });

  const result: SceneResult = {
    name: def.name,
    mode,
    indices: sim.entries.map((e) => e.index),
    aiLines,
    stalls,
    completeCount: sim.completeCount,
    completeAtMs: sim.completeAt,
    worldEndMs: sim.world.endMs,
    maxFrameStep: sim.maxFrameStep,
    minFrameStep: sim.minFrameStep,
    finalCalibration: calibrationAt(sim, Number.POSITIVE_INFINITY),
    calibrationUpdates: sim.calibrations.length,
  };
  await sim.unmount();
  return result;
}

const checkedAiLines = (r: SceneResult) => r.aiLines.filter((l) => l.ordinal >= AI_LINES_BEFORE_CHECK);
const worstLead = (ls: AiLineResult[]) => Math.max(0, ...ls.map((l) => l.offsetMs));
const worstLag = (ls: AiLineResult[]) => Math.max(0, ...ls.map((l) => -l.offsetMs));
const r0 = (v: number) => Math.round(v);

// ---------------------------------------------------------------------------------------------
// Bars (a)-(d), per scene and agent model
// ---------------------------------------------------------------------------------------------

const RESULTS: SceneResult[] = [];

const MODES: Array<{ mode: AgentMode; title: string }> = [
  { mode: 'one-burst-per-turn', title: 'agent speaks a run of AI lines as one burst' },
  { mode: 'one-burst-per-line', title: 'agent speaks each AI line as its own burst' },
];

describe.each(MODES)('rehearsal scenes: $title', ({ mode }) => {
  describe.each(SCENES)('$name', (def) => {
    let r: SceneResult;
    beforeAll(async () => {
      r = await inVirtualTime(() => simulateScene(def, mode));
      RESULTS.push(r);
    });

    it('(a) highlights every line exactly once, in order', () => {
      expect(r.indices).toEqual(def.lines.map((_, i) => i));
    });

    it("(b) never stays on a line longer than the line's duration plus 2 s", () => {
      for (const s of r.stalls) {
        expect(Number.isFinite(s.dwellMs), `line ${s.index} was never left`).toBe(true);
        expect(
          s.excessMs,
          `line ${s.index}: on screen ${r0(s.dwellMs)} ms vs duration ${r0(s.plannedMs)} ms`,
        ).toBeLessThanOrEqual(STALL_SLACK_MS + FRAME_MS);
      }
    });

    it('(c) completes, exactly once', () => {
      expect(r.completeCount).toBe(1);
      expect(r.completeAtMs).not.toBeNull();
    });

    it('(d) enters each AI line within 1.5 s of its voice starting (after the first two AI lines)', () => {
      const checked = checkedAiLines(r);
      expect(checked.length, 'no AI line is old enough to be checked: bar would be vacuous').toBeGreaterThan(0);
      for (const l of checked) {
        expect(
          Math.abs(l.offsetMs),
          `AI line ${l.index} (#${l.ordinal + 1}): voice starts ${r0(l.voiceStartMs)} ms, highlight enters ${r0(l.entryMs)} ms`,
        ).toBeLessThanOrEqual(ENTRY_WINDOW_MS);
      }
    });

    it('keeps the place continuous: no frame jumps, never backwards', () => {
      expect(r.minFrameStep).toBeGreaterThanOrEqual(-1e-9);
      expect(r.maxFrameStep).toBeLessThanOrEqual(MAX_FRAME_STEP);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Bar (e): pause and Speed, inside a running scene
// ---------------------------------------------------------------------------------------------

describe.each(SCENES)('pause and speed change mid-scene: $name', (def) => {
  const lines = toScriptLines(def);

  it('pausing freezes the clock and resuming continues from the same place', async () => {
    await inVirtualTime(async () => {
      const sim = await createSim(lines);
      sim.advanceBy(sim.world.endMs * 0.4);
      const before = sim.last();
      const entriesBefore = sim.entries.length;
      expect(before).toBeDefined();

      const during = await sim.pauseFor(45_000);
      expect(during.positionCalls, 'onPosition fired while paused').toBe(0);
      expect(during.indexCalls, 'onIndexChange fired while paused').toBe(0);
      expect(during.completeCalls, 'onComplete fired while paused').toBe(0);
      expect(during.frameCallbacksSeen, 'a frame loop kept running while paused').toBe(0);
      expect(sim.last()).toEqual(before);
      expect(sim.entries.length).toBe(entriesBefore);

      sim.advanceBy(FRAME_MS); // first frame after resume
      const step = place(sim.last()) - place(before);
      expect(step, 'moved backwards on resume').toBeGreaterThanOrEqual(-1e-9);
      expect(step, 'jumped on resume (45 s of pause leaked into the clock)').toBeLessThanOrEqual(MAX_FRAME_STEP);

      sim.runToCompletion(sim.world.endMs + 60_000);
      expect(sim.completeCount).toBe(1);
      expect(sim.entries.map((e) => e.index)).toEqual(lines.map((_, i) => i));
      await sim.unmount();
    });
  });

  it('changing Speed mid-scene never jumps the place or moves it backwards', async () => {
    await inVirtualTime(async () => {
      const sim = await createSim(lines);
      sim.advanceBy(sim.world.endMs * 0.3);

      for (const speed of [1.2, 0.7, 1.1, 1]) {
        sim.advanceBy(500); // mid-line, away from any boundary we planned for
        const before = sim.last();
        await sim.setSpeed(speed);
        sim.advanceBy(FRAME_MS); // the first frame at the new speed
        const step = place(sim.last()) - place(before);
        expect(step, `speed ${speed}: moved backwards`).toBeGreaterThanOrEqual(-1e-9);
        // `before` is the last frame already shown, so exactly one frame of movement may show up here.
        expect(step, `speed ${speed}: jumped`).toBeLessThanOrEqual(MAX_FRAME_STEP);
        expect(sim.last().index, `speed ${speed}: changed line`).toBeGreaterThanOrEqual(before.index);
        expect(sim.last().index - before.index, `speed ${speed}: skipped a line`).toBeLessThanOrEqual(1);
      }

      sim.runToCompletion(sim.world.endMs + 120_000);
      expect(sim.completeCount).toBe(1);
      expect(sim.entries.map((e) => e.index)).toEqual(lines.map((_, i) => i));
      expect(sim.minFrameStep, 'moved backwards during the scene').toBeGreaterThanOrEqual(-1e-9);
      expect(sim.maxFrameStep, 'a frame jumped during the scene').toBeLessThanOrEqual(MAX_FRAME_STEP);
      await sim.unmount();
    });
  });
});

afterAll(() => {
  const rows = RESULTS.map((r) => {
    const checked = checkedAiLines(r);
    const early = r.aiLines.filter((l) => l.ordinal < AI_LINES_BEFORE_CHECK);
    return {
      scene: r.name,
      agent: r.mode === 'one-burst-per-turn' ? 'run=1 burst' : 'burst/line',
      lines: r.indices.length,
      completeAtS: r.completeAtMs === null ? null : +(r.completeAtMs / 1000).toFixed(2),
      worldEndS: +(r.worldEndMs / 1000).toFixed(2),
      checkedAiLines: checked.length,
      worstLeadMs: r0(worstLead(checked)),
      worstLagMs: r0(worstLag(checked)),
      earlyLeadMs: r0(worstLead(early)),
      earlyLagMs: r0(worstLag(early)),
      worstStallExcessMs: r0(Math.max(...r.stalls.map((s) => s.excessMs))),
      worstExcessOverTrueMs: r0(Math.max(...r.stalls.map((s) => s.excessOverTrueMs))),
      worstExcessOverTrueNotLastMs: r0(Math.max(...r.stalls.slice(0, -1).map((s) => s.excessOverTrueMs))),
      maxFrameStep: +r.maxFrameStep.toFixed(5),
      leadInMs: r0(r.finalCalibration.leadInMs),
      aiWpmAt1x: r0(r.finalCalibration.aiWpmAt1x),
    };
  });
  console.info(`[rehearsalScene.eval] per-scene measurements\n${JSON.stringify(rows, null, 1)}`);
  for (const r of RESULTS) {
    console.info(
      `[rehearsalScene.eval] ${r.name} (${r.mode}) AI entries (offset = voice start - highlight entry, + = highlight early): ` +
        r.aiLines.map((l) => `#${l.ordinal + 1}@line${l.index}:${r0(l.offsetMs)}ms`).join('  '),
    );
  }
});
