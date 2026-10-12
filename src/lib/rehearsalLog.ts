/**
 * rehearsalLog: tiny singleton that records rehearsal position and timing events.
 *
 * Why it exists: script position otherwise never leaves the browser, so Supabase
 * logs cannot show a stalled rehearsal. Every event is echoed to the browser console
 * (through `logger`), buffered, and sent in batches to the `rehearsal-log` edge
 * function, which prints one JSON line per event into `function_logs`.
 *
 * Behavior:
 * - `start()` opens a session and emits `rehearsal_start`; `end()` closes it.
 *   `log()` before `start()` or after `end()` is a silent no-op.
 * - Every event carries `tMs` (ms since start) and `lineIndex` (last known line).
 * - Flushes every 5 s while active, on 'pause' / 'stop' / 'complete', on
 *   `visibilitychange: hidden`, and on `end()`.
 * - Sending is fire-and-forget: it never blocks, never throws into the UI, and a
 *   failed batch goes back to the front of the buffer (capped at 200 events,
 *   oldest dropped). Failed sends back off so a missing or down function is not hammered.
 * - No script text and no transcripts are ever logged, only indices, types,
 *   counts and timings. Strings are truncated and the edge function whitelists fields.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type RehearsalLogEvent =
  | 'rehearsal_start'
  | 'engine_status'
  | 'line_change'
  | 'speed_change'
  | 'pause'
  | 'resume'
  | 'seek'
  | 'complete'
  | 'stop'
  | 'agent_audio_started'
  | 'agent_audio_ended'
  | 'user_speech_ended'
  | 'pacing_sample';

export type RehearsalLogData = Record<string, number | string | boolean | null | undefined>;

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFERED_EVENTS = 200;
/** Keep in step with MAX_EVENTS in supabase/functions/rehearsal-log/index.ts. */
const MAX_BATCH_EVENTS = 50;
const MAX_STRING_LENGTH = 64;
const MAX_BACKOFF_MS = 60_000;
const FLUSH_ON: ReadonlySet<RehearsalLogEvent> = new Set(['pause', 'stop', 'complete']);

interface Session {
  id: string;
  scriptId: string;
  startedAt: number;
  lineIndex: number | null;
}

/** An event waits in the buffer with its session, so a late flush never mixes sessions. */
interface BufferedEvent {
  sessionId: string;
  scriptId: string;
  payload: RehearsalLogData;
}

let session: Session | null = null;
let buffer: BufferedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let queue: Promise<void> = Promise.resolve();
let failures = 0;
let retryAt = 0;

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep only finite numbers, booleans, null and (truncated) strings. */
function cleanData(data?: RehearsalLogData): RehearsalLogData {
  const out: RehearsalLogData = {};
  if (!data) return out;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === 'boolean' || value === null) {
      out[key] = value;
    }
  }
  return out;
}

/** One request. Resolves true only when the function accepted the batch; never throws. */
async function send(sessionId: string, scriptId: string, events: RehearsalLogData[]): Promise<boolean> {
  try {
    const result = await supabase.functions.invoke('rehearsal-log', {
      body: { sessionId, scriptId, events },
    });
    return !result?.error;
  } catch {
    return false;
  }
}

/** Send everything buffered, one single-session batch at a time. Never rejects. */
async function drain(): Promise<void> {
  try {
    while (buffer.length > 0) {
      const { sessionId, scriptId } = buffer[0];
      let count = 0;
      while (
        count < buffer.length &&
        count < MAX_BATCH_EVENTS &&
        buffer[count].sessionId === sessionId
      ) {
        count++;
      }
      const batch = buffer.splice(0, count);
      const ok = await send(sessionId, scriptId, batch.map((entry) => entry.payload));
      if (!ok) {
        // Put the batch back in order ahead of anything logged meanwhile; drop the oldest past the cap.
        buffer = batch.concat(buffer).slice(-MAX_BUFFERED_EVENTS);
        failures++;
        retryAt = Date.now() + Math.min(MAX_BACKOFF_MS, FLUSH_INTERVAL_MS * 2 ** failures);
        return;
      }
      failures = 0;
      retryAt = 0;
    }
  } catch {
    // Logging must never surface into the UI.
  }
}

function tick(): void {
  if (buffer.length === 0 || Date.now() < retryAt) return;
  void rehearsalLog.flush();
}

function onVisibilityChange(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    void rehearsalLog.flush();
  }
}

export const rehearsalLog: {
  start(meta: { scriptId: string; lineCount: number; speed: number }): void;
  log(event: RehearsalLogEvent, data?: RehearsalLogData): void;
  flush(): Promise<void>;
  end(): void;
} = {
  start(meta) {
    try {
      if (session) rehearsalLog.end();
      session = {
        id: newSessionId(),
        scriptId: String(meta.scriptId ?? ''),
        startedAt: Date.now(),
        lineIndex: null,
      };
      failures = 0;
      retryAt = 0;
      timer = setInterval(tick, FLUSH_INTERVAL_MS);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      rehearsalLog.log('rehearsal_start', { lineCount: meta.lineCount, speed: meta.speed });
    } catch {
      // Never throw into the UI.
    }
  },

  log(event, data) {
    try {
      if (!session) return;
      const clean = cleanData(data);
      if (event === 'line_change' && typeof clean.index === 'number') session.lineIndex = clean.index;
      if (event === 'seek' && typeof clean.toIndex === 'number') session.lineIndex = clean.toIndex;

      // Reserved keys go last so a caller's data can never overwrite them.
      const payload: RehearsalLogData = {
        ...clean,
        event,
        tMs: Math.max(0, Date.now() - session.startedAt),
        lineIndex: session.lineIndex,
      };
      logger.info(event, {
        ...payload,
        component: 'RehearsalLog',
        sessionId: session.id,
        scriptId: session.scriptId,
      });

      buffer.push({ sessionId: session.id, scriptId: session.scriptId, payload });
      if (buffer.length > MAX_BUFFERED_EVENTS) buffer.splice(0, buffer.length - MAX_BUFFERED_EVENTS);
      if (FLUSH_ON.has(event)) void rehearsalLog.flush();
    } catch {
      // Never throw into the UI.
    }
  },

  flush() {
    // One request at a time: later calls wait their turn, then send whatever has arrived since.
    queue = queue.then(drain);
    return queue;
  },

  end() {
    try {
      if (!session) return;
      session = null;
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      void rehearsalLog.flush();
    } catch {
      // Never throw into the UI.
    }
  },
};
