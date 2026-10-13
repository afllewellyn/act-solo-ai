/**
 * Unit tests for rehearsalLog: buffering, flush triggers, the buffer cap, and "never throws".
 * The module keeps its state at module level, so each test loads a fresh copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { invoke, loggerInfo } = vi.hoisted(() => ({
  invoke: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo },
}));

type RehearsalLog = typeof import('../rehearsalLog').rehearsalLog;

let rehearsalLog: RehearsalLog;

const META = { scriptId: 'script-1', lineCount: 12, speed: 1 };

/** Every `{ sessionId, scriptId, events }` body that was sent, in order. */
const sentBodies = () =>
  invoke.mock.calls.map(
    ([name, options]) => {
      expect(name).toBe('rehearsal-log');
      return options.body as {
        sessionId: string;
        scriptId: string;
        events: Array<Record<string, unknown>>;
      };
    },
  );

const sentEvents = () => sentBodies().flatMap((body) => body.events);

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('rehearsalLog', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    loggerInfo.mockReset();
    ({ rehearsalLog } = await import('../rehearsalLog'));
  });

  afterEach(async () => {
    rehearsalLog.end();
    await vi.runOnlyPendingTimersAsync();
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('ignores log() before start() and after end()', async () => {
    rehearsalLog.log('pause');
    await rehearsalLog.flush();
    expect(invoke).not.toHaveBeenCalled();
    expect(loggerInfo).not.toHaveBeenCalled();

    rehearsalLog.start(META);
    rehearsalLog.end();
    await rehearsalLog.flush();
    invoke.mockClear();
    loggerInfo.mockClear();

    rehearsalLog.log('resume');
    await rehearsalLog.flush();
    expect(invoke).not.toHaveBeenCalled();
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  it('start() buffers a rehearsal_start event without sending it yet', () => {
    rehearsalLog.start(META);

    expect(invoke).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });

  it('echoes every event to the console through the logger', () => {
    rehearsalLog.start(META);
    rehearsalLog.log('line_change', { index: 3, lineType: 'ai', words: 7, clockMs: 4200 });

    expect(loggerInfo).toHaveBeenLastCalledWith(
      'line_change',
      expect.objectContaining({
        component: 'RehearsalLog',
        scriptId: 'script-1',
        event: 'line_change',
        index: 3,
        lineIndex: 3,
        lineType: 'ai',
        words: 7,
        clockMs: 4200,
      }),
    );
  });

  it('sends buffered events on the 5 s interval, with session, timing and line index', async () => {
    rehearsalLog.start(META);
    await vi.advanceTimersByTimeAsync(1500);
    rehearsalLog.log('line_change', { index: 0, lineType: 'user', words: 5, clockMs: 0 });
    await vi.advanceTimersByTimeAsync(1500);
    rehearsalLog.log('engine_status', { status: 'ready' });

    expect(invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [body] = sentBodies();
    expect(body.scriptId).toBe('script-1');
    expect(typeof body.sessionId).toBe('string');
    expect(body.sessionId.length).toBeGreaterThan(0);
    expect(body.events).toEqual([
      { event: 'rehearsal_start', tMs: 0, lineIndex: null, lineCount: 12, speed: 1 },
      { event: 'line_change', tMs: 1500, lineIndex: 0, index: 0, lineType: 'user', words: 5, clockMs: 0 },
      { event: 'engine_status', tMs: 3000, lineIndex: 0, status: 'ready' },
    ]);
  });

  it('does not call the function on a tick when nothing is buffered', async () => {
    rehearsalLog.start(META);
    await vi.advanceTimersByTimeAsync(5000);
    expect(invoke).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('flush() sends immediately and does nothing when the buffer is empty', async () => {
    rehearsalLog.start(META);
    await rehearsalLog.flush();
    expect(invoke).toHaveBeenCalledTimes(1);

    await rehearsalLog.flush();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('tracks the last known line index from line_change and seek', async () => {
    rehearsalLog.start(META);
    rehearsalLog.log('line_change', { index: 4, lineType: 'ai', words: 3, clockMs: 100 });
    rehearsalLog.log('agent_audio_started');
    rehearsalLog.log('seek', { toIndex: 9 });
    rehearsalLog.log('user_speech_ended');
    await rehearsalLog.flush();

    const byEvent = Object.fromEntries(sentEvents().map((e) => [e.event, e.lineIndex]));
    expect(byEvent).toMatchObject({
      rehearsal_start: null,
      line_change: 4,
      agent_audio_started: 4,
      seek: 9,
      user_speech_ended: 9,
    });
  });

  it.each(['pause', 'stop', 'complete'] as const)('flushes right away on %s', async (event) => {
    rehearsalLog.start(META);
    rehearsalLog.log(event);
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sentEvents().map((e) => e.event)).toEqual(['rehearsal_start', event]);
  });

  it('does not flush on ordinary events', async () => {
    rehearsalLog.start(META);
    rehearsalLog.log('resume');
    rehearsalLog.log('speed_change', { speed: 1.2 });
    rehearsalLog.log('line_change', { index: 1, lineType: 'ai', words: 4, clockMs: 900 });
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('flushes when the tab is hidden, but not when it becomes visible', async () => {
    rehearsalLog.start(META);

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).not.toHaveBeenCalled();

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('end() flushes what is left and stops the timer and the visibility listener', async () => {
    rehearsalLog.start(META);
    rehearsalLog.log('speed_change', { speed: 0.9 });
    rehearsalLog.end();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sentEvents().map((e) => e.event)).toEqual(['rehearsal_start', 'speed_change']);

    invoke.mockClear();
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(20000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('start() while a session is open ends the old one and begins a new session id', async () => {
    rehearsalLog.start(META);
    rehearsalLog.start({ ...META, scriptId: 'script-2' });
    await rehearsalLog.flush();

    const bodies = sentBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.scriptId)).toEqual(['script-1', 'script-2']);
    expect(bodies[0].sessionId).not.toBe(bodies[1].sessionId);
  });

  it('sends at most 50 events per request', async () => {
    rehearsalLog.start(META);
    for (let i = 0; i < 119; i++) rehearsalLog.log('line_change', { index: i });
    await rehearsalLog.flush();

    const bodies = sentBodies();
    expect(bodies.map((b) => b.events.length)).toEqual([50, 50, 20]);
    expect(new Set(bodies.map((b) => b.sessionId)).size).toBe(1);
  });

  it('drops the oldest events past the 200 event cap', async () => {
    rehearsalLog.start(META);
    for (let i = 0; i < 250; i++) rehearsalLog.log('line_change', { index: i });
    await rehearsalLog.flush();

    const events = sentEvents();
    expect(events).toHaveLength(200);
    // 251 were logged (start + 250 lines): the start and lines 0-49 were dropped.
    expect(events[0]).toMatchObject({ event: 'line_change', index: 50 });
    expect(events[199]).toMatchObject({ event: 'line_change', index: 249 });
  });

  it('keeps events after a failed send and resends them in order', async () => {
    rehearsalLog.start(META);
    rehearsalLog.log('line_change', { index: 1 });
    invoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    await expect(rehearsalLog.flush()).resolves.toBeUndefined();
    rehearsalLog.log('line_change', { index: 2 });
    await rehearsalLog.flush();

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(sentBodies()[1].events.map((e) => e.event)).toEqual([
      'rehearsal_start',
      'line_change',
      'line_change',
    ]);
    expect(sentBodies()[1].events.map((e) => e.index)).toEqual([undefined, 1, 2]);
  });

  it('never throws when invoke rejects or throws', async () => {
    invoke.mockRejectedValue(new Error('network down'));
    expect(() => rehearsalLog.start(META)).not.toThrow();
    expect(() => rehearsalLog.log('pause')).not.toThrow();
    await expect(rehearsalLog.flush()).resolves.toBeUndefined();

    invoke.mockImplementation(() => {
      throw new Error('sync failure');
    });
    await expect(rehearsalLog.flush()).resolves.toBeUndefined();

    invoke.mockResolvedValue(undefined);
    await expect(rehearsalLog.flush()).resolves.toBeUndefined();
    expect(() => rehearsalLog.end()).not.toThrow();
  });

  it('never throws when the logger throws', () => {
    loggerInfo.mockImplementation(() => {
      throw new Error('console is gone');
    });

    expect(() => rehearsalLog.start(META)).not.toThrow();
    expect(() => rehearsalLog.log('line_change', { index: 1 })).not.toThrow();
  });

  it('backs off the interval after a failure, but explicit flushes still try', async () => {
    invoke.mockRejectedValue(new Error('function not deployed'));
    rehearsalLog.start(META);

    await vi.advanceTimersByTimeAsync(5000); // first try fails, next tick allowed at 15 s
    expect(invoke).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000); // 10 s: skipped
    expect(invoke).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000); // 15 s: tries again
    expect(invoke).toHaveBeenCalledTimes(2);

    await rehearsalLog.flush(); // explicit flushes ignore the backoff
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('runs one request at a time and loses nothing logged while one is in flight', async () => {
    let release: (value: { data: unknown; error: null }) => void = () => {};
    invoke.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );

    rehearsalLog.start(META);
    const first = rehearsalLog.flush();
    await vi.advanceTimersByTimeAsync(0);
    rehearsalLog.log('line_change', { index: 7 });
    const second = rehearsalLog.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledTimes(1);

    release({ data: { ok: true }, error: null });
    await Promise.all([first, second]);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(sentBodies()[1].events.map((e) => e.event)).toEqual(['line_change']);
  });

  it('never mixes two sessions in one request', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });

    rehearsalLog.start({ ...META, scriptId: 'first' });
    rehearsalLog.log('line_change', { index: 1 });
    rehearsalLog.end(); // its flush fails, so the first session's events stay buffered
    await vi.advanceTimersByTimeAsync(0);

    rehearsalLog.start({ ...META, scriptId: 'second' });
    rehearsalLog.log('line_change', { index: 2 });
    await rehearsalLog.flush();

    const bodies = sentBodies().slice(1); // skip the failed attempt
    expect(bodies.map((b) => b.scriptId)).toEqual(['first', 'second']);
    expect(bodies[0].events.map((e) => e.event)).toEqual(['rehearsal_start', 'line_change']);
    expect(bodies[1].events.map((e) => e.event)).toEqual(['rehearsal_start', 'line_change']);
    expect(bodies[0].sessionId).not.toBe(bodies[1].sessionId);
  });

  it('keeps only primitive, finite data and truncates long strings', async () => {
    rehearsalLog.start(META);
    rehearsalLog.log('engine_status', {
      status: 'x'.repeat(200),
      nan: Number.NaN,
      infinite: Number.POSITIVE_INFINITY,
      missing: undefined,
      nested: { text: 'a line of the script' } as unknown as number,
      ok: true,
      none: null,
      // Callers cannot overwrite the fields the log owns.
      event: 'hijacked',
      tMs: 999999,
      lineIndex: 42,
    });
    await rehearsalLog.flush();

    const entry = sentEvents().find((e) => e.event === 'engine_status');
    expect(entry).toEqual({
      event: 'engine_status',
      tMs: 0,
      lineIndex: null,
      status: 'x'.repeat(64),
      ok: true,
      none: null,
    });
    expect(JSON.stringify(sentBodies())).not.toContain('a line of the script');
  });
});
