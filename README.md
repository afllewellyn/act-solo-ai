# ActSolo.AI

AI-powered rehearsal partner with ElevenLabs voices that lets actors run lines with a responsive scene partner in a teleprompter UI.

## Overview

ActSolo.AI ingests your script, tracks your lines, and connects a conversation engine (ElevenLabs Conversational AI agent) so you can practice live with an AI partner and realistic voices. It streams microphone audio, mirrors agent speech via natural TTS, and keeps the rehearsal UI in sync with script context, letting you rehearse anywhere with a browser.

## Key Features

- Script parsing with cue metadata, teleprompter view, and rehearsal progress tracking.
- ConversationEngine abstraction that swaps between engine providers via feature flags.
- ElevenAgentsEngine (Phase 2) with realtime VAD, agent text/audio responses, and normalized events.
- Supabase backend for auth/functions, including signed ElevenLabs conversational tokens.
- React/Tailwind UI built with Vite + Bun/Node for fast iteration.

## Architecture

- `src/services/conversation/types.ts` – provider-agnostic engine contract and event types.
- `src/services/conversation/domain.ts` – rehearsal domain objects (`Cue`, `ScriptContext`, etc.).
- `src/services/conversation/ElevenAgentsEngine.ts` – ElevenLabs implementation (feature flagged).
- `src/services/conversation/engineFactory.ts` – dynamic factory keyed off feature flags.
- Upcoming Phase 3 brings `useConversationEngine`, `RehearsalModeContainer`, and full UI hookup.

Refer to `Project plans/ConversationEngine Refactor PRD_Dec.md` for the full PRD and phase roadmap.

## Getting Started

```bash
git clone <repo-url>
cd act-solo-ai
bun install   # or npm install
bun dev       # or npm run dev
```

### Prerequisites

- Node 18+ (or Bun 1.0+ if preferred)
- Supabase project with `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` configured for the `eleven-agent-token` edge function.
- Optional: set browser feature flags via `window.__FEATURES__` to enable `conversation_engine_eleven`.

## Feature Flags

Edit `src/lib/featureFlags.ts` or set `window.__FEATURES__` to toggle capabilities. Key flag:

- `conversation_engine_eleven`: when `true`, `engineFactory` loads `ElevenAgentsEngine`; otherwise, the stub engine runs and legacy managers stay active.

## Testing

- Unit tests: `bun test` (Vitest). Suite includes `src/services/conversation/__tests__/ElevenAgentsEngine.test.ts` for WebSocket event mapping, control commands, and context formatting.
- Manual: RehearsalMode.tsx with `conversation_engine_eleven` enabled.

## Roadmap

- **Phase 2 (done):** Engine interface, ElevenLabs edge token, ElevenAgentsEngine + tests.
- **Phase 3 (next):** React hook integration, RehearsalMode container refactor, feature-flagged rollout.
- **Phase 4:** Clean up legacy audio managers/hooks.
- **Phase 5:** Hybrid UI polish, production hardening.

Track progress in:

- `Project plans/ConversationEngine Refactor PRD_Dec.md`
- `Project plans/November 2025 Sprint - Production Hardening.md`

## Contributing

1. Branch from `main`.
2. Run lint/tests before pushing (`bun test`).
3. Document new feature flags/config in README.
4. For Supabase functions, update `supabase/functions/*` and redeploy via Supabase CLI.

Issues/ideas? Open a GitHub issue or start a discussion—community feedback guides the roadmap.
