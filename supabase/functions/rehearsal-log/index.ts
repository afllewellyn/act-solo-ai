import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthedUser, unauthorizedResponse } from "../_shared/auth.ts";

// Receives batches of rehearsal position/timing events from the client
// (src/lib/rehearsalLog.ts) and prints one JSON line per event so they can be
// read back from `function_logs`:
//
//   select timestamp, event_message from logs
//   where source = 'function_logs' and event_message like '%RehearsalLog%'
//   order by timestamp asc
//
// This function never spends third-party credit, but it still requires a signed-in
// user (the Origin allow-list only constrains browsers) and only ever copies
// whitelisted, type-checked fields. No script text or transcripts are accepted:
// strings are limited to short single tokens.

const MAX_EVENTS = 50; // keep in step with MAX_BATCH_EVENTS in src/lib/rehearsalLog.ts
const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const EVENT_NAMES = new Set([
  'rehearsal_start',
  'engine_status',
  'line_change',
  'speed_change',
  'pause',
  'resume',
  'seek',
  'complete',
  'stop',
  'agent_audio_started',
  'agent_audio_ended',
  'user_speech_started',
  'user_speech_ended',
  'actor_paced',
  'pacing_sample',
  'early_response_discarded',
]);

// Per-event payload fields. Anything not listed here is dropped.
const NUMBER_FIELDS = [
  'lineCount',
  'speed',
  'index',
  'toIndex',
  'words',
  'clockMs',
  'audioMs',
  'value',
  'leadInMs',
  'aiWpmAt1x',
];
const TOKEN_FIELDS = ['status', 'lineType', 'kind']; // short single tokens only, no spaces
const TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,32}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);

  // Check if origin matches allowed patterns
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.lovable.app') ||
    origin === 'https://actsolo.ai' ||
    origin === 'https://www.actsolo.ai'
  );

  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }

  return {};
}

// Rate limiting map (per user, per isolate: a soft limit, like get-voices)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const isRateLimited = (clientId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(clientId);

  if (!limit || now > limit.resetTime) {
    if (rateLimits.size > 1000) {
      for (const [id, entry] of rateLimits) {
        if (now > entry.resetTime) rateLimits.delete(id);
      }
    }
    rateLimits.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (limit.count >= RATE_LIMIT_REQUESTS) {
    return true;
  }

  limit.count++;
  return false;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Read at most `maxBytes` of the body. Returns null if it is larger, without
// buffering the rest (Content-Length can be absent or wrong).
async function readBodyCapped(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;

// Copy one event down to whitelisted, type-checked fields. Returns null to skip it.
function sanitizeEvent(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.event !== 'string' || !EVENT_NAMES.has(raw.event)) return null;

  const out: Record<string, unknown> = { event: raw.event };

  out.tMs = isFiniteNumber(raw.tMs) && raw.tMs >= 0 ? Math.round(raw.tMs) : null;
  out.lineIndex =
    isFiniteNumber(raw.lineIndex) && Number.isInteger(raw.lineIndex) && raw.lineIndex >= 0
      ? raw.lineIndex
      : null;

  for (const key of NUMBER_FIELDS) {
    const value = raw[key];
    if (isFiniteNumber(value)) out[key] = Math.round(value * 1000) / 1000;
  }
  for (const key of TOKEN_FIELDS) {
    const value = raw[key];
    if (typeof value === 'string' && TOKEN_PATTERN.test(value)) out[key] = value;
  }

  return out;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Return 403 for disallowed origins (check BEFORE OPTIONS handler)
  if (origin && Object.keys(corsHeaders).length === 0) {
    console.error('[RehearsalLog] Forbidden origin:', origin);
    return new Response('Forbidden', { status: 403 });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // Signed-in users only, checked before the body is read.
  const user = await getAuthedUser(req);
  if (!user) {
    return unauthorizedResponse(corsHeaders);
  }

  try {
    // Rate limiting check (per user; the client-supplied IP header is spoofable)
    if (isRateLimited(user.id)) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders);
    }

    const rawBody = await readBodyCapped(req, MAX_BODY_BYTES);
    if (rawBody === null) {
      return jsonResponse({ error: 'Request body too large' }, 413, corsHeaders);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
    }
    if (!isRecord(body)) {
      return jsonResponse({ error: 'Invalid request' }, 400, corsHeaders);
    }

    const { sessionId, scriptId, events } = body;
    if (typeof sessionId !== 'string' || !ID_PATTERN.test(sessionId)) {
      return jsonResponse({ error: 'Invalid sessionId' }, 400, corsHeaders);
    }
    if (!Array.isArray(events) || events.length === 0) {
      return jsonResponse({ error: 'events must be a non-empty array' }, 400, corsHeaders);
    }
    if (events.length > MAX_EVENTS) {
      return jsonResponse({ error: `At most ${MAX_EVENTS} events per request` }, 400, corsHeaders);
    }
    // scriptId is a label only: reduce it to safe id characters rather than rejecting the batch.
    const safeScriptId =
      typeof scriptId === 'string' ? scriptId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '';

    let accepted = 0;
    for (const raw of events) {
      const event = sanitizeEvent(raw);
      if (!event) continue;
      // Fixed keys last, so nothing a client sends can overwrite them.
      console.log(JSON.stringify({
        component: 'RehearsalLog',
        ...event,
        sessionId,
        scriptId: safeScriptId,
        userId: user.id,
      }));
      accepted++;
    }

    return jsonResponse({ ok: true, accepted, dropped: events.length - accepted }, 200, corsHeaders);
  } catch (error: unknown) {
    console.error('[RehearsalLog] Error:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: 'Internal error' }, 500, corsHeaders);
  }
});
