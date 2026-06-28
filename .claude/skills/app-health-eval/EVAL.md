# ActSolo.AI Health Eval — Runbook

Run every check below from the `act-solo-ai/` repo root in a **clean-context
subagent**. Capture real output. Each check is **PASS / FAIL / KNOWN-ISSUE** with
an objective bar. Return the report in the contract at the bottom — nothing else.

Set these once at the top of the run:

```bash
cd act-solo-ai
REF=$(grep -oE 'project_id *= *"[^"]+"' supabase/config.toml | cut -d'"' -f2)   # uomdyqdvorusucuudwnz
BASE="https://$REF.supabase.co/functions/v1"
ORIGIN="https://actsolo.ai"   # an allowed CORS origin (token & TTS gate on this)
# Portable timeout (macOS has no `timeout`): GUARD <seconds> <cmd...>
GUARD() { local s=$1; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
```

---

## A. Structural gate — build & types (hard fail)

These are the CI gate. A FAIL here blocks everything; fix before trusting B–D.

### A1 — Production build
```bash
npm run build
```
- **PASS:** exit 0, `dist/` written.
- **FAIL:** non-zero exit. This is the same gate CI enforces — must be green.

### A2 — Typecheck (app code)
```bash
npx tsc --noEmit -p tsconfig.app.json
```
- **PASS:** no errors (this is expected to be clean today).
- **FAIL:** any TS error.

### A3 — Lint (informational)
```bash
npm run lint 2>&1 | tail -5
```
- **PASS:** clean.
- **KNOWN-ISSUE:** non-zero with `no-explicit-any`-dominated errors — record the
  error/warning counts; do **not** block on it (CLAUDE.md issue #2). FAIL only if
  the count grew versus the noted baseline (~89 errors / 32 warnings).

---

## B. Conversation engine (correctness)

### B1 — Engine unit tests (guarded against the known hang)
```bash
GUARD 120 npx vitest run src/services/conversation/__tests__/ElevenAgentsEngine.test.ts --no-watch 2>&1 | tail -20
```
- **PASS:** completes, all 23 tests pass.
- **FAIL:** completes with any failing test — a real engine regression.
- **KNOWN-ISSUE:** killed by GUARD at 120s (vitest 4 + jsdom startup hang,
  CLAUDE.md issue #1). Record it, fall through to B2, do not block.

### B2 — Engine contract intact (static, always runs)
Cheap regression signal that survives even if B1 hangs. The ElevenLabs engine
must still implement the full `ConversationEngine` contract from
`src/services/conversation/types.ts`.
```bash
for m in 'start' 'stop' 'sendText' 'updateContext' 'sendControl' 'onEvent' 'getStatus'; do
  grep -qE "\b$m\b *\(" src/services/conversation/ElevenAgentsEngine.ts \
    && echo "ok: $m" || echo "MISSING: $m"
done
```
- **PASS:** all 7 methods present.
- **FAIL:** any `MISSING:` — the engine no longer satisfies the interface the UI
  depends on.

### B3 — Factory wiring
```bash
grep -qE "conversation_engine_eleven" src/services/conversation/engineFactory.ts \
  && grep -qE "ElevenAgentsEngine" src/services/conversation/engineFactory.ts \
  && echo ok || echo BROKEN
```
- **PASS:** `ok` — factory still gates `ElevenAgentsEngine` on the feature flag.
- **FAIL:** `BROKEN` — runtime engine selection is broken.

---

## C. Voice connections & edge functions (live smoke)

Hits the deployed functions. `time_total` / `ttfb` are the latency signal for
"no delays." Functions are public; token & TTS gate on an allowed `Origin`.

### C1 — Voice connection token (the core path)
```bash
curl -s -o /tmp/tok.json -w "HTTP %{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  -X POST -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  "$BASE/eleven-agent-token" --max-time 20
grep -o '"signed_url":"wss[^"]*' /tmp/tok.json | cut -c1-45
```
- **PASS:** HTTP 200, body has a `wss://` `signed_url` + `agent_id`, `total` < **1.5s**.
- **FAIL:** non-200, missing `signed_url`, or `total` ≥ 1.5s. Without this token
  the scene partner never connects.
- Baseline: 200, ~0.67s ✅.

### C2 — ElevenLabs voice list
```bash
curl -s -o /tmp/gv.json -w "HTTP %{http_code} total=%{time_total}s\n" \
  "$BASE/get-voices" --max-time 20
grep -c '"id"' /tmp/gv.json
```
- **PASS:** HTTP 200, non-empty `voices[]` (id/name present), `total` < **1.5s**.
- **FAIL:** non-200, empty list, or slow. Voice assignment UI breaks.
- Baseline: 200, ~0.5s ✅.

### C3 — Text-to-speech (ElevenLabs audio quality path)
Spends a tiny amount of ElevenLabs credit — keep the text short, run sparingly.
```bash
curl -s -o /tmp/tts.bin -D /tmp/tts.hdr -w "HTTP %{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  -X POST -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"text":"Line check, one two three.","voice_id":"9BWtsMINqrJLrRacOk9x"}' \
  "$BASE/text-to-speech" --max-time 30
grep -i 'content-type' /tmp/tts.hdr; wc -c < /tmp/tts.bin
```
- **PASS:** HTTP 200, audio content-type (`audio/*`) or a non-trivial audio
  payload (> ~2 KB), `ttfb` < **2.0s**.
- **FAIL:** non-200, JSON error body, empty/tiny payload, or `ttfb` ≥ 2.0s —
  ElevenLabs TTS quality/latency regressed.

### C4 — Realtime health (LEGACY — do not fix)
`health-realtime` is an OpenAI realtime ephemeral-token check. It is **not used
by the live ElevenLabs conversation engine** (`ElevenAgentsEngine.ts` has zero
OpenAI references) and is confirmed legacy, slated for removal. Run it only to
confirm nothing depends on it — do not chase the failure or loop on it.
```bash
curl -s -o /tmp/hr.json -w "HTTP %{http_code} total=%{time_total}s\n" \
  "$BASE/health-realtime" --max-time 20
cat /tmp/hr.json
```
- **KNOWN-ISSUE (legacy):** currently 500, `"Ephemeral token request failed:
  404"` (OpenAI realtime path). Record it; it does **not** block GREEN. When the
  function is removed, delete this check entirely.
- **FAIL (only this):** if some live code path still imports/depends on
  `health-realtime` — that dependency is the real bug, not the 404.

---

## D. Supabase logs (qualify any failure)

CLI v2.39.2 has **no `supabase functions logs`** command. Use these instead.

### D1 — Function response bodies are the first log
Every edge function returns its error inline (e.g. C4's `"...failed: 404"`). For
any C-check FAIL, quote the response body — it usually names the cause.

### D2 — Deep logs via Management API (when a token is available)
If `SUPABASE_ACCESS_TOKEN` is exported (a Supabase Personal Access Token), pull
recent Edge Function logs to see `console.log`/`console.error` boot diagnostics:
```bash
SQL='select event_message, timestamp from function_edge_logs order by timestamp desc limit 50'
curl -s -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data-urlencode "sql=$SQL" --max-time 30 | head -c 2000
```
- **PASS:** logs retrieved; attach the lines relevant to any FAIL.
- **KNOWN-ISSUE:** no token exported → skip and note it; point the user to the
  Dashboard Logs Explorer:
  `https://supabase.com/dashboard/project/<REF>/logs/edge-functions`.

### D3 — Services up
```bash
GUARD 30 supabase services 2>&1 | head -20
```
- Informational: confirms project services respond. Note anything degraded.

---

## E. Voice AI quality — manual checklist (deliver to the user)

These need a human, a browser, and a mic — the subagent cannot mark them PASS.
Return this list verbatim for the user to run.

Setup: `npm run dev` → open http://localhost:8080 → sign in → open **Practice** →
confirm `conversation_engine_eleven` is on (default; or set
`window.__FEATURES__ = { conversation_engine_eleven: true }` in console) → load a
short 2-character scene.

- [ ] **Connects fast** — partner reaches "ready" in < ~2s after Start.
- [ ] **Responds without lag** — after your cue, the partner begins speaking in
      < ~1.5s; no awkward dead air.
- [ ] **Voice is natural** — ElevenLabs audio is clear: no robotic artifacts,
      clipping, dropouts, or wrong/mismatched voice.
- [ ] **Turn-taking works** — partner stops when you start (barge-in/interrupt);
      resumes cleanly.
- [ ] **Holds over a full scene** — no disconnects, no audio desync vs the
      teleprompter, no runaway/duplicated speech.
- [ ] **Recovers** — Stop then Start re-establishes the connection cleanly.

PASS only when every box is checked.

---

## Report contract (subagent returns ONLY this)

```
ActSolo.AI Health Eval — <branch>

| ID | Check                         | Result      | Evidence |
|----|-------------------------------|-------------|----------|
| A1 | Build                         | PASS        | exit 0 |
| A2 | Typecheck                     | PASS        | no errors |
| A3 | Lint                          | KNOWN-ISSUE | 89 err / 32 warn (baseline) |
| B1 | Engine unit tests             | ...         | 23 passed / hung@120s |
| B2 | Engine contract               | ...         | 7/7 methods |
| B3 | Factory wiring                | ...         | ok |
| C1 | Voice token                   | ...         | HTTP 200, 0.67s |
| C2 | Voice list                    | ...         | HTTP 200, 0.50s |
| C3 | TTS audio                     | ...         | HTTP 200, ttfb 1.1s |
| C4 | Realtime health (legacy)      | KNOWN-ISSUE | 500 OpenAI 404 — slated for removal |
| D2 | Edge logs                     | ...         | retrieved / skipped (no token) |

Failures to fix: <list with the cause from the evidence/logs>
Manual checklist (Section E): <pasted verbatim for the user>
Verdict: GREEN (all automated PASS/KNOWN-ISSUE) | RED (open FAILs)
```

The primary agent fixes each FAIL and re-spawns this eval until **GREEN**, then
delivers Section E to the user.
