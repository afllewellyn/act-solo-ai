# CLAUDE.md

Guidance for AI assistants and developers working in this repository.

> The git repository lives in this `act-solo-ai/` directory, which sits one level
> below the `ActSolo.AI/` folder. Run all git, npm, and tooling commands from here.

## What this is

ActSolo.AI is a teleprompter + AI scene-partner web app for actors. You paste a
script, assign AI voices to characters, and rehearse out loud against a
responsive partner powered by ElevenLabs Conversational AI, with a Supabase
backend for auth and edge functions. Built with Vite + React + TypeScript +
Tailwind/shadcn, originally scaffolded in Lovable.

## Commands

```bash
npm ci               # install deps (npm is canonical; lockfile is in sync)
npm run dev          # Vite dev server on http://localhost:8080
npm run build        # production build to dist/  (also the CI gate)
npm run build:dev    # development-mode build
npm run lint         # eslint . — 0 errors (CI gate); ~31 warnings remain
npm run preview      # preview a production build
npm test             # unit tests (Vitest, jsdom) — passing
npx tsc --noEmit -p tsconfig.app.json   # typecheck app code (clean; CI runs it before build/tests)
npm run build && npm run test:smoke     # build, then boot it in real Chromium (CI gate)
```

`test:smoke` (`scripts/smoke-test.mjs`) serves the production build with `vite
preview` and loads it in headless Chromium (Playwright), failing on any
uncaught page error or an empty `#root` after mount. It exists because
`npm run build`/`npm test`/typecheck can all pass while the app is still
blank in a real browser — see the manualChunks postmortem below. Requires
`npx playwright install --with-deps chromium` once (CI does this
automatically).

The project standardizes on **npm**; `package-lock.json` is the source of truth
and CI uses `npm ci`. (An older `bun.lockb` was removed.)

## Environment setup

```bash
cp .env.example .env   # then run npm run dev
```

`.env` is git-ignored. Only public, `VITE_`-prefixed values belong in it — Vite
inlines them into the client bundle, so they are not secret. The Supabase key
shipped in `.env.example` is the **anon** key (public by design, RLS-protected).
Real server secrets (ElevenLabs API key, service-role key) live in
**Supabase Edge Function secrets**, never in this repo — see
`Project plans/SUPABASE_WORKFLOW.md`.

## Architecture

The core abstraction is a provider-agnostic **conversation engine**, selected at
runtime by feature flags so the UI never hard-codes a voice provider.

- `src/services/conversation/types.ts` — `ConversationEngine` contract + event types.
- `src/services/conversation/domain.ts` — rehearsal domain objects (`Cue`, `ScriptContext`, `ConversationEngineConfig`, …).
- `src/services/conversation/engineFactory.ts` — `createConversationEngine()`; returns the real engine when the `conversation_engine_eleven` flag is on, otherwise a logging stub.
- `src/services/conversation/ElevenAgentsEngine.ts` — ElevenLabs implementation (realtime VAD, agent text/audio, normalized events).
- `src/hooks/useConversationEngine.ts` — React hook wrapping the engine lifecycle.
- `src/components/practice/` + `src/pages/Practice.tsx` — rehearsal UI (dark "studio" screen): `TeleprompterDisplay` pins the current line to a dashed eye-line at 28% height and exposes an imperative `setPosition({ index, fraction })` handle (`forwardRef`) that the clock calls every frame; `RehearsalSettingsDrawer` holds voice (`VoicePicker`), script-view options and "AI reads" filter. The speed slider scales both the AI voice and the scroll.
- `src/contexts/RehearsalContext.tsx` — rehearsal state (rehearsal mode, pause, speed, engine status) and the engine lifecycle. It does **not** track the current line. Line role comes from formatting (italic = AI, bold = you, plain = stage note); character names are optional. It re-emits the engine's agent-audio events to subscribers via `subscribeAgentAudio` (the Practice page feeds them to the clock for calibration) and logs engine/pause/stop events to `rehearsalLog`.
- `src/lib/scriptVoice.ts` / `src/lib/voices.ts` — per-script voice saved in the reserved `__default` entry of `scripts.characters`; removed voices (Aria) and the default voice (Sarah).
- `src/lib/teleprompterPacing.ts` + `src/hooks/useTeleprompterClock.ts` — the **time-driven teleprompter**. The scroll position is a function of elapsed time, not of engine events: `buildTimeline()` gives every line a duration (user/note lines from word count at a base 156 wpm; AI lines from a lead-in plus words at a calibrated AI rate, both divided by the speed setting), and a `requestAnimationFrame` loop in `useTeleprompterClock` maps the clock to `{ index, fraction }`, calling `onPosition` every frame (no React state per frame) and `onIndexChange` only when the line changes. The clock starts only once the engine is `ready` (so connecting does not eat into the scene), freezes while paused, and completes about 2 s after the last line. Tap-a-line and Next cue call `clock.seek(i)`, which only resyncs the clock; it never touches the agent.
- **Audio-calibrated AI pacing.** The AI's real speech corrects the clock: `agent_audio_started` while the clock is in an AI line samples the lead-in (`leadInMs`), and `agent_audio_ended` carries `{ audioMs, text }` so the speaking rate (`aiWpmAt1x`) is learned. `updateCalibration()` smooths both with an EMA (lead-in clamp 0..4000 ms, alpha 0.5; rate clamp 90..260 wpm, alpha 0.4) and ignores unusable samples. The calibration persists for the life of the hook (across Start/Restart).
- **The agent tracks its own place.** The app no longer follows or advances the rehearsal position from engine events. `src/utils/scriptCueBuilder.ts` builds one position-independent prompt containing the whole scene (the agent says AI lines in order and listens for the actor's cue words), and `ElevenAgentsEngine` omits `Progress` / `Current cue` hints when `currentLine` is 0. Engine events only drive the status pill and the pacing calibration. The old turn-flow / auto-advance code (`agentTurnFlow`, `lineMatching`) is gone; do not reintroduce app-side line matching to move the highlight.
- `src/lib/rehearsalLog.ts` + `supabase/functions/rehearsal-log/` — position/timing telemetry. Position never left the browser before, so a stalled rehearsal was invisible in Supabase logs. `rehearsalLog` buffers events (line changes, seeks, pause/resume/stop/complete, engine status, agent-audio timings, pacing samples), echoes them to the console and sends batches to the edge function, which prints one JSON line per event (`component: RehearsalLog`) to `function_logs`. Never log script text or transcripts, only indices, types, counts and timings. See "Rehearsal logging" below.

Other layout:

- `src/pages/` — routed pages (Landing, Auth, Practice, ManageScripts, HelpCenter, Contact, Privacy, Terms, NotFound).
- `src/components/ui/` — shadcn/ui primitives. `src/components/practice/` — feature components.
- `src/integrations/supabase/` — Supabase client + generated types.
- `src/lib/featureFlags.ts` — feature-flag system (see below).
- `supabase/functions/` — Deno edge functions: `eleven-agent-token`, `get-voices`, `text-to-speech`, `send-contact-email`, `env-debug`, `rehearsal-log`.
- Edge functions run with `verify_jwt = false`, and the `Origin` allow-list only constrains browsers (curl can omit/forge it). Any function that spends third-party credit (`eleven-agent-token`, `text-to-speech`, `get-voices`) must call `getAuthedUser()` from `supabase/functions/_shared/auth.ts` and reject anonymous callers; `rehearsal-log` spends nothing but also requires a signed-in user. Removing a function from the repo does not undelete it from Supabase — also run `supabase functions delete <name>`. OpenAI realtime is no longer used.
- `@` is the path alias for `src/` (configured in `vite.config.ts`, `vitest.config.ts`, and tsconfig).

## Feature flags

Defined in `src/lib/featureFlags.ts`. Defaults can be overridden at runtime via
`window.__FEATURES__`. Key flag: `conversation_engine_eleven` (on by default) —
gates whether `engineFactory` loads `ElevenAgentsEngine` or the stub. Use
`isFeatureEnabled(flag)` to read and `setFeatureFlags({...})` to override in
the browser console for debugging.

## Rehearsal logging

Rehearsal position and timing are logged so a stalled or mis-paced rehearsal can be diagnosed from Supabase.

- Client: `rehearsalLog.start()` / `.log(event, data)` / `.end()` in `src/lib/rehearsalLog.ts`. Practice starts a session when rehearsal mode turns on and ends it when it turns off; the clock hook emits `line_change` / `seek` / `complete` / `pacing_sample`; the rehearsal context emits `pause` / `resume` / `stop` / `engine_status` / `agent_audio_*` / `user_speech_ended`. Flushes every 5 s, on pause/stop/complete, when the tab is hidden, and on `end()`. Failed sends back off and never block the UI. Calls before `start()` or after `end()` are silent no-ops.
- Server: `supabase/functions/rehearsal-log/index.ts` (POST only, signed-in users only, 32 KB body cap, at most 50 events per request, soft 30 requests/min per user). It whitelists event names and fields (numbers: `lineCount`, `speed`, `index`, `toIndex`, `words`, `clockMs`, `audioMs`, `value`, `leadInMs`, `aiWpmAt1x`; short single-token strings: `status`, `lineType`, `kind`) and drops everything else, so a new field added to a `rehearsalLog.log` call is **silently dropped until it is added to `NUMBER_FIELDS` / `TOKEN_FIELDS` there**. `[functions.rehearsal-log] verify_jwt = false` is set in `supabase/config.toml`.
- **Deploy required.** Merging the code does not deploy the function. Run `supabase functions deploy rehearsal-log` (it imports `../_shared/auth.ts`, so deploy from the repo root). Until it is deployed, the client fails silently with backoff and only the browser console echo works.
- Read the logs back with:

  ```sql
  select timestamp, event_message from function_logs
  where event_message like '%RehearsalLog%'
  order by timestamp asc
  ```

## Known issues / gotchas

The June 2026 health-check findings have all been resolved:

- **Tests** previously hung (missing `jsdom` dependency + a non-constructable
  WebSocket mock). Fixed; run via `npm test`, gated in CI.
- **Lockfile** drift / dual lockfiles. Fixed; standardized on npm (`npm ci`).
- **Lint** backlog (~89 `no-explicit-any`-dominated errors). Cleared; CI now
  gates on lint. ~32 `react-hooks/exhaustive-deps` / `react-refresh` warnings
  remain (non-blocking).
- **Bundle / code-split.** `ElevenAgentsEngine` is dynamic-import-only again
  (duck-typed telemetry check in `useConversationEngine.ts`). The manual
  vendor-chunk split in `vite.config.ts` was removed (Sep 2026): grouping
  chunks by package-name substring produced a genuine circular import between
  chunks (`vendor` <-> `react-vendor`), which left `React` undefined at
  module-init time in the browser and rendered a blank page — invisible to
  `npm run build`/`npm test` since neither loads the real chunk graph in a
  browser. Rollup's automatic chunking is used instead; it can't produce that
  kind of init-order cycle. If re-adding manual chunking, verify with a real
  browser load (not just a successful build), not string-matching on paths
  that can false-match unrelated packages (e.g. `@tiptap/react` matching a
  `react` path regex).

Two general gotchas worth keeping in mind:
- Don't statically import a concrete engine class from UI/hooks — it defeats the
  factory's lazy-load. Detect engine capabilities by duck typing instead.
- `import.meta.env.VITE_SUPABASE_*` overrides in `integrations/supabase/client.ts`
  apply only as a pair; a partial override is ignored to avoid crossing envs.

### Testing notes

The teleprompter clock is pure and deterministic in tests: `teleprompterPacing` is plain functions, and
`useTeleprompterClock` is driven with a fake `performance.now()` and a manually stepped
`requestAnimationFrame` (see `src/hooks/__tests__/useTeleprompterClock.test.tsx`). Do not assert on real
elapsed time.

The engine reaches `'ready'` only after a `conversation_initiation_metadata`
message (which triggers async mic init), not on socket open — tests must
simulate that message to drive the engine to `'ready'`. Incoming WebSocket
messages use nested `*_event` shapes (e.g. `user_transcription_event`,
`agent_response_event`, `audio_event.audio_base_64`).

## Conventions

- TypeScript + functional React components; Tailwind for styling; shadcn/ui for primitives.
- Import from `@/...` rather than long relative paths.
- Don't put secrets in `.env` / client code — only public `VITE_` values. Server secrets go in Supabase.
- Branch from `main`; the production build must pass (CI `build` job gates it).
- When editing edge functions, update `supabase/functions/*` and redeploy via the Supabase CLI.
