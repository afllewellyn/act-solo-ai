# ActSolo.AI

AI-powered rehearsal partner with ElevenLabs voices that lets actors run lines with a responsive scene partner in a teleprompter UI.

## Overview

ActSolo.AI ingests your script, tracks your lines, and connects a conversation engine (ElevenLabs Conversational AI agent) so you can practice live with an AI partner and realistic voices. It streams microphone audio, mirrors agent speech via natural TTS, and keeps the rehearsal UI in sync with script context, letting you rehearse anywhere with a browser.

## Key Features

- Script parsing with cue metadata and rehearsal progress tracking. Line roles come from formatting: *italic* lines are read by the AI, **bold** lines are yours, and unformatted lines are stage notes the AI skips. Character names (`NAME:`) are optional and can be hidden in the view.
- Dark "studio" teleprompter: the current line is pinned to a dashed eye-line at ~28% of the screen and follows the scene (AI turn end, your speech end, Next cue, or tapping a line).
- Scene-partner voice picker with per-voice previews, remembered per script.
- Scenes that open on an AI line start automatically once the connection is ready.
- ConversationEngine abstraction that swaps between engine providers via feature flags.
- ElevenAgentsEngine (Phase 2) with realtime VAD, agent text/audio responses, and normalized events.
- Supabase backend for auth/functions, including signed ElevenLabs conversational tokens.
- React/Tailwind UI built with Vite and npm for fast iteration.

## Architecture

- `src/services/conversation/types.ts` – provider-agnostic engine contract and event types.
- `src/services/conversation/domain.ts` – rehearsal domain objects (`Cue`, `ScriptContext`, etc.).
- `src/services/conversation/ElevenAgentsEngine.ts` – ElevenLabs implementation (feature flagged).
- `src/services/conversation/engineFactory.ts` – dynamic factory keyed off feature flags.
- `src/pages/Practice.tsx`, `src/components/practice/TeleprompterDisplay.tsx`, `RehearsalSettingsDrawer.tsx` – the rehearsal screen, eye-line teleprompter, and settings (voice, script view, what the AI reads).
- `src/contexts/RehearsalContext.tsx` – rehearsal state, current-line tracking, and engine lifecycle.
- `src/lib/scriptVoice.ts`, `src/lib/voices.ts` – per-script voice storage and the default/removed voices.
- Phase 3 complete: `useConversationEngine`, `RehearsalModeContainer`, and full UI hookup.
- Phase 3.5 complete: structured telemetry + debug utilities.
- Phase 4 deferred: legacy cleanup after production stability.

Refer to `Project plans/ConversationEngine Refactor PRD_Dec.md` for the full PRD and phase roadmap.

## Getting Started

```bash
git clone <repo-url>
cd act-solo-ai
npm install
cp .env.example .env   # public Supabase keys; see CLAUDE.md
npm run dev
```

### Prerequisites

- Node 20+ (the project standardizes on npm; `package-lock.json` is the source of truth)
- Supabase project with `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` configured for the `eleven-agent-token` edge function.
- Optional: set browser feature flags via `window.__FEATURES__` to enable `conversation_engine_eleven`.

## Feature Flags

Edit `src/lib/featureFlags.ts` or set `window.__FEATURES__` to toggle capabilities. Key flag:

- `conversation_engine_eleven`: when `true`, `engineFactory` loads `ElevenAgentsEngine`; otherwise, the stub engine runs and legacy managers stay active.

## Testing

- Unit tests: `npm test` (Vitest, jsdom). Covers the ElevenLabs engine (WebSocket event mapping, control commands, reconnection), script parsing and line roles, line matching, the `useConversationEngine` latest-callback regression, and voice helpers.
- Browser smoke test: `npm run build && npm run test:smoke` boots the production build in headless Chromium.
- CI runs typecheck, build, tests, smoke test, and lint on every PR (`.github/workflows/ci.yml`).
- Manual: sign in, open a script, and rehearse with `conversation_engine_eleven` enabled (needs a microphone).

## Roadmap

- **Phase 4 (deferred):** Clean up legacy audio managers/hooks after production stability.
- **Phase 5 (later):** Hybrid UI polish, production hardening.
- **Phase 6 (test):** Pricing.

Track progress in:

- `Project plans/ConversationEngine Refactor PRD_Dec.md`
- `Project plans/November 2025 Sprint - Production Hardening.md`

## Contributing

1. Branch from `main`.
2. Run lint/tests before pushing (`npm test`, `npm run lint`).
3. Document new feature flags/config in README.
4. For Supabase functions, update `supabase/functions/*` and redeploy via Supabase CLI.

Issues/ideas? Open a GitHub issue or start a discussion—community feedback guides the roadmap.
