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
npm run lint         # eslint . — 0 errors (CI gate); ~32 warnings remain
npm run preview      # preview a production build
npm test             # unit tests (Vitest, jsdom) — passing
npx tsc --noEmit -p tsconfig.app.json   # typecheck app code (clean)
```

The project standardizes on **npm**; `package-lock.json` is the source of truth
and CI uses `npm ci`. (An older `bun.lockb` was removed.)

## Environment setup

```bash
cp .env.example .env   # then run npm run dev
```

`.env` is git-ignored. Only public, `VITE_`-prefixed values belong in it — Vite
inlines them into the client bundle, so they are not secret. The Supabase key
shipped in `.env.example` is the **anon** key (public by design, RLS-protected).
Real server secrets (ElevenLabs API key, OpenAI key, service-role key) live in
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
- `src/components/practice/` + `src/pages/Practice.tsx` — rehearsal UI.

Other layout:

- `src/pages/` — routed pages (Landing, Auth, Practice, ManageScripts, HelpCenter, Contact, Privacy, Terms, NotFound).
- `src/components/ui/` — shadcn/ui primitives. `src/components/practice/` — feature components.
- `src/integrations/supabase/` — Supabase client + generated types.
- `src/lib/featureFlags.ts` — feature-flag system (see below).
- `supabase/functions/` — Deno edge functions: `eleven-agent-token`, `get-voices`, `text-to-speech`, `send-contact-email`, `health-realtime`, `env-debug`.
- `@` is the path alias for `src/` (configured in `vite.config.ts`, `vitest.config.ts`, and tsconfig).

## Feature flags

Defined in `src/lib/featureFlags.ts`. Defaults can be overridden at runtime via
`window.__FEATURES__`. Key flag: `conversation_engine_eleven` (on by default) —
gates whether `engineFactory` loads `ElevenAgentsEngine` or the stub. Use
`isFeatureEnabled(flag)` to read and `setFeatureFlags({...})` to override in
the browser console for debugging.

## Known issues / gotchas

The June 2026 health-check findings have all been resolved:

- **Tests** previously hung (missing `jsdom` dependency + a non-constructable
  WebSocket mock). Fixed; run via `npm test`, gated in CI.
- **Lockfile** drift / dual lockfiles. Fixed; standardized on npm (`npm ci`).
- **Lint** backlog (~89 `no-explicit-any`-dominated errors). Cleared; CI now
  gates on lint. ~32 `react-hooks/exhaustive-deps` / `react-refresh` warnings
  remain (non-blocking).
- **Bundle / code-split.** `ElevenAgentsEngine` is dynamic-import-only again
  (duck-typed telemetry check in `useConversationEngine.ts`) and vendor chunks
  are split (`vite.config.ts`), so the main app chunk is ~159 kB.

Two general gotchas worth keeping in mind:
- Don't statically import a concrete engine class from UI/hooks — it defeats the
  factory's lazy-load. Detect engine capabilities by duck typing instead.
- `import.meta.env.VITE_SUPABASE_*` overrides in `integrations/supabase/client.ts`
  apply only as a pair; a partial override is ignored to avoid crossing envs.

### Testing notes

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
