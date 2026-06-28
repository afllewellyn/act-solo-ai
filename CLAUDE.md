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
npm install          # install deps (see "Known issues" re: lockfile)
npm run dev          # Vite dev server on http://localhost:8080
npm run build        # production build to dist/  (also the CI gate)
npm run build:dev    # development-mode build
npm run lint         # eslint . (currently failing — see Known issues)
npm run preview      # preview a production build
npx vitest run       # unit tests (currently hangs — see Known issues)
npx tsc --noEmit -p tsconfig.app.json   # typecheck app code (clean)
```

The README mentions Bun (`bun dev` / `bun test`). Both a `bun.lockb` and a
`package-lock.json` are committed; npm is what currently resolves correctly.
Pick one package manager per the open hygiene issues before relying on the other.

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

These were found during a June 2026 health check and are tracked as GitHub issues:

1. **Tests hang.** `npx vitest run` (vitest 4 + jsdom) hangs on startup and never
   completes locally. CI runs tests non-blocking with a 5-minute cap.
2. **Lint is red.** ~89 eslint errors / 32 warnings, dominated by
   `@typescript-eslint/no-explicit-any` in the conversation engine and edge
   functions. CI runs lint non-blocking until the backlog is cleared.
3. **Lockfile drift.** The committed `package-lock.json` is out of sync with
   `package.json` (a fresh `npm install` rewrites it and was needed to install
   vitest). CI uses `npm install`, not `npm ci`, until this is fixed. Two
   lockfiles (`bun.lockb`, `package-lock.json`) also coexist — choose one PM.
4. **Bundle/code-split.** `ElevenAgentsEngine.ts` is imported both statically
   (`useConversationEngine.ts`) and dynamically (`engineFactory.ts`), which
   defeats the dynamic import; the main chunk is ~1.1 MB. Pick one import style
   to restore lazy-loading.

## Conventions

- TypeScript + functional React components; Tailwind for styling; shadcn/ui for primitives.
- Import from `@/...` rather than long relative paths.
- Don't put secrets in `.env` / client code — only public `VITE_` values. Server secrets go in Supabase.
- Branch from `main`; the production build must pass (CI `build` job gates it).
- When editing edge functions, update `supabase/functions/*` and redeploy via the Supabase CLI.
