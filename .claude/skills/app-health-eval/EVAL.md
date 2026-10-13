# ActSolo.AI Health Eval — Runbook

Run every check below from the `act-solo-ai/` repo root in a **clean-context
subagent**. Capture real output. Each check is **PASS / FAIL / KNOWN-ISSUE /
BLOCKED** with an objective bar. **BLOCKED** means the check could not run (no
credential, or no network route) — it is not a pass and not a code failure.
Return the report in the contract at the bottom — nothing else.

Set these once at the top of the run:

```bash
# Be at the act-solo-ai/ repo root (where supabase/ + package.json live). The
# documented invocation already starts here; this only steps in if you launched
# from the parent ActSolo.AI/ folder. Never blindly `cd act-solo-ai` — in a CI
# checkout the repo root *is* act-solo-ai and that subdir doesn't exist.
[ -f supabase/config.toml ] || cd act-solo-ai
REF=$(grep -oE 'project_id *= *"[^"]+"' supabase/config.toml | cut -d'"' -f2)   # uomdyqdvorusucuudwnz
BASE="https://$REF.supabase.co/functions/v1"
ORIGIN="https://actsolo.ai"   # an allowed CORS origin (token & TTS gate on this)
# eleven-agent-token, get-voices and text-to-speech require a signed-in user's
# access token (they spend ElevenLabs credit). Sign in a dedicated email+password
# test account before C1-C3: export TEST_EMAIL and TEST_PASSWORD first. The apikey
# below is the public anon key from .env.example (RLS-protected, not a secret).
ANON_KEY=$(sed -nE 's/^VITE_SUPABASE_PUBLISHABLE_KEY="?([^"]+)"?$/\1/p' .env.example)
ACCESS_TOKEN=${ACCESS_TOKEN:-$(python3 -c "import json,os; print(json.dumps({'email':os.environ.get('TEST_EMAIL',''),'password':os.environ.get('TEST_PASSWORD','')}))" \
  | curl -s -X POST "https://$REF.supabase.co/auth/v1/token?grant_type=password" \
      -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d @- --max-time 20 \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)}
# Empty ACCESS_TOKEN (no test account) or no route to $REF.supabase.co (curl:
# "CONNECT tunnel failed, response 403" / HTTP 000 in <1s = the sandbox egress
# policy denies the host) -> C1-C3 are BLOCKED, not FAIL. Report the cause and
# the host; do not retry, proxy around, or mint a token another way.
AUTH_HEADER="Authorization: Bearer ${ACCESS_TOKEN:-}"
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

### A3 — Lint (CI gate)
```bash
npm run lint 2>&1 | tail -5
```
- **PASS:** exit 0 with 0 errors and no more than the baseline **32 warnings**
  (`react-hooks/exhaustive-deps` / `react-refresh`; see `CLAUDE.md`). Record the
  counts.
- **FAIL:** any lint error, or warnings above 32. CI gates on 0 errors.

---

## B. Conversation engine (correctness)

### B1 — Engine unit tests (guarded against the known hang)
Capture the **real** exit status — do not `| tail` and read `$?` (that's tail's
status, ~always 0, so a failing run would record as PASS).
```bash
GUARD 120 npx vitest run src/services/conversation/__tests__/ElevenAgentsEngine.test.ts > /tmp/vitest.log 2>&1
STATUS=$?               # 0 = all pass; 142 = GUARD's alarm fired (hang)
tail -20 /tmp/vitest.log
# Did vitest REPORT failing tests (independent of a later hang)? "0 failed" => no.
grep -qiE '[1-9][0-9]* failed|Failed Tests' /tmp/vitest.log && FAILED=yes || FAILED=no
echo "vitest exit status: $STATUS   failures-reported: $FAILED"
```
- **PASS:** `STATUS` = 0 **and** `FAILED` = no — every test in the file passes
  (37 at last count; record the number).
- **FAIL:** `FAILED` = yes (vitest reported failing tests — a real regression,
  **even if it then hung to 142**), or `STATUS` non-zero and ≠ 142. Read
  `/tmp/vitest.log` for which test.
- **KNOWN-ISSUE:** `STATUS` = 142 **and** `FAILED` = no — GUARD killed a clean
  startup hang (the known `vitest` 4 + jsdom issue), no failures were reported.
  Record it, fall through to B2, do not block. (`CLAUDE.md` records this hang as
  fixed, so a recurrence is a regression worth investigating.)

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
"no delays." `eleven-agent-token`, `get-voices` and `text-to-speech` require a
signed-in user's `$ACCESS_TOKEN` (and an allowed `Origin`). If `$ACCESS_TOKEN` is
empty, or the probe cannot reach `$REF.supabase.co`, mark C1-C3 **BLOCKED** (see
the setup block) rather than running them to record a 401 or a connect error.

### C1 — Voice connection token (the core path)
```bash
curl -s -o /tmp/tok.json -w "HTTP %{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  -X POST -H "Origin: $ORIGIN" -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  "$BASE/eleven-agent-token" --max-time 20
grep -o '"signed_url":"wss[^"]*' /tmp/tok.json | cut -c1-45
```
- **PASS:** HTTP 200, body has a `wss://` `signed_url` + `agent_id`, `total` < **1.5s**.
- **FAIL:** non-200, missing `signed_url`, or `total` ≥ 1.5s. Without this token
  the scene partner never connects.
- Baseline: 200, ~0.67s ✅.

### C2 — ElevenLabs voice list
Send `Origin` — `get-voices` returns **403 for disallowed origins**, and a
no-Origin request skips that check entirely. Without the header a CORS allow-list
regression would still 200 here while the browser UI is blocked.
```bash
curl -s -o /tmp/gv.json -w "HTTP %{http_code} total=%{time_total}s\n" \
  -H "Origin: $ORIGIN" -H "$AUTH_HEADER" "$BASE/get-voices" --max-time 20
grep -c '"id"' /tmp/gv.json
```
- **PASS:** HTTP 200, non-empty `voices[]` (id/name present), `total` < **1.5s**.
- **FAIL:** non-200 (incl. 403 if the allow-list dropped `$ORIGIN`), empty list,
  or slow. Voice assignment UI breaks.
- Baseline: 200, ~0.5s ✅.

### C3 — Text-to-speech (ElevenLabs audio quality path)
Spends a tiny amount of ElevenLabs credit — keep the text short, run sparingly.
The function returns `200 application/json` with the audio as **base64 in
`audioContent`** (not a raw `audio/*` body), so verify the *decoded audio bytes*,
never the response size — a large JSON error body must not pass.
```bash
curl -s -o /tmp/tts.json -w "HTTP %{http_code} total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  -X POST -H "Origin: $ORIGIN" -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"text":"Line check, one two three.","voice_id":"9BWtsMINqrJLrRacOk9x"}' \
  "$BASE/text-to-speech" --max-time 30
# Assert audioContent exists and base64-decodes to non-trivial audio bytes:
AUDIO_BYTES=$(python3 -c "import json,base64,sys; d=json.load(open('/tmp/tts.json')); print(len(base64.b64decode(d['audioContent'])))" 2>/dev/null || echo 0)
echo "decoded audio bytes: $AUDIO_BYTES"
```
- **PASS:** HTTP 200, body has `audioContent`, and it base64-decodes to a
  non-trivial payload (`AUDIO_BYTES` > ~2000), `ttfb` < **2.0s**.
- **FAIL:** non-200, missing/empty `audioContent`, `AUDIO_BYTES` ≤ ~2000 (decode
  failed or not real audio), or `ttfb` ≥ 2.0s — ElevenLabs TTS quality/latency
  regressed. A large 200 JSON body alone is **not** a pass.

---

## D. Supabase logs (qualify any failure)

CLI v2.39.2 has **no `supabase functions logs`** command. Use these instead.

### D1 — Function response bodies are the first log
Every edge function returns its error inline. For
any C-check FAIL, quote the response body — it usually names the cause.

### D2 — Deep logs via Management API (when a token is available)
If `SUPABASE_ACCESS_TOKEN` is exported (a Supabase Personal Access Token), pull
recent logs. The `console.log`/`console.error` boot/error diagnostics live in
**`function_logs`** — `function_edge_logs` only holds invocation/network/status
metadata, so querying it will miss the very error lines you need.
```bash
# Function-internal console output (the diagnostics): function_logs
SQL='select event_message, timestamp from function_logs order by timestamp desc limit 50'
# (For request-level status/latency metadata instead, swap in function_edge_logs.)
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
| A3 | Lint                          | PASS        | 0 err / 32 warn (baseline) |
| B1 | Engine unit tests             | ...         | 37 passed / hung@120s |
| B2 | Engine contract               | ...         | 7/7 methods |
| B3 | Factory wiring                | ...         | ok |
| C1 | Voice token                   | ...         | HTTP 200, 0.67s / BLOCKED: <cause> |
| C2 | Voice list                    | ...         | HTTP 200, 0.50s / BLOCKED: <cause> |
| C3 | TTS audio                     | ...         | HTTP 200, ttfb 1.1s / BLOCKED: <cause> |
| D2 | Edge logs                     | ...         | retrieved / skipped (no token) |

Failures to fix: <list with the cause from the evidence/logs>
Blocked: <each BLOCKED check, its cause (empty ACCESS_TOKEN / denied host), what unblocks it>
Manual checklist (Section E): <pasted verbatim for the user>
Verdict: GREEN (all automated PASS/KNOWN-ISSUE) | INCOMPLETE (no open FAIL, but a check is BLOCKED) | RED (open FAILs)
```

A BLOCKED check is never GREEN: any BLOCKED C1-C3 makes the verdict
**INCOMPLETE**. (D2 with no `SUPABASE_ACCESS_TOKEN` stays KNOWN-ISSUE.)

The primary agent fixes each FAIL and re-spawns this eval until **GREEN**, then
delivers Section E to the user. A BLOCKED check cannot be fixed in code: report
**INCOMPLETE** with the cause, and have someone with network access to
`$REF.supabase.co` and a test-account login (a developer machine, or CI with
those secrets) run C1-C3 before release.
