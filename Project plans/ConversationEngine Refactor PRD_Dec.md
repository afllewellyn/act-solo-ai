# ConversationEngine Refactor PRD

## Overview
- **Objective:** Replace ad-hoc VAD/TTS coordination with a provider-agnostic `ConversationEngine` that centralizes realtime audio + LLM behavior, script cue orchestration, and UI integration.
- **Motivation:** Current flow couples UI to OpenAI Realtime gatekeepers and ElevenLabs WebSpeech hooks, causing brittle turn detection, redundant WebSocket plumbing, and difficult provider swaps. The new engine enables ElevenLabs Conversational AI to manage turn-taking while keeping script logic and UI stable.
- **Target Release:** Rehearsal MVP upgrade (post-Nov 2025 hardening).

## Success Criteria
- Rehearsal sessions run end-to-end using ElevenLabs Conversational AI for VAD + speech.
- UI modules depend **only** on the `ConversationEngine` interface.
- Switching to a future `HybridOpenAIEngine` requires no UI changes (factory/config toggle only).
- Turn detection, interruption, and streaming audio behave naturally without manual gating.
- Legacy audio managers (`EnhancedAudioManager`, `useTTS`, `useSpeechRecognition`, etc.) are decommissioned.

## Architecture Layers

| Layer | Responsibilities | Key Artifacts |
| --- | --- | --- |
| **Conversation Interface** | Provider-agnostic contract, events, commands, lifecycle | `src/services/conversation/types.ts` |
| **Domain Types** | Script cues, context payloads, engine config metadata | `src/services/conversation/domain.ts` |
| **Engine Implementations** | ElevenLabs ConvAI (Phase 2), future OpenAI hybrid | `src/services/conversation/engines/*` |
| **Hooks + Factory** | React lifecycle + state, feature-flag engine selection | `useConversationEngine`, `engineFactory` |
| **UI / Scripts** | Rehearsal flows, cue management, teleprompter UI | `RehearsalMode`, containers, context |

## Phase Plan

### Phase 1 – Foundations (COMPLETE)
- Add `ConversationEngine` interface + `ConversationStatus`, control commands, and normalized events (incl. agent audio events).
- Define domain types: `Cue`, `ScriptContext`, `ConversationEngineConfig` (with `initialContext`, `enableTranscription`, etc.).
- Create stub factory `createConversationEngine` with `conversation_engine_eleven` feature flag defaulting to `false`.
- Keep legacy managers running; no behavior changes yet.

### Phase 2 – ElevenAgentsEngine
1. **Supabase Edge Function (`eleven-agent-token`):**
   - Exchanges service API key for signed ElevenLabs ConvAI URL.
   - Returns `{ signed_url, expires_at }`.
2. **`ElevenAgentsEngine`:**
   - Connects to `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...`.
   - Streams mic audio via `AudioContext`.
   - Normalizes ElevenLabs events → `ConversationEvent` (user speech, agent response, agent audio, tool calls).
   - Supports `contextual_update` payloads formatted from `ScriptContext`.
   - Handles interruption commands (`pause_agent`, `interrupt`, `clear_buffer`).
3. **Engine Factory:**
   - When `conversation_engine_eleven=true`, dynamically import and instantiate `ElevenAgentsEngine`; fallback to stub otherwise.
4. **Testing:**
   - Mock WebSocket tests for event mapping and context formatting.

### Phase 3 – React Integration
1. **Hook (`useConversationEngine`):**
   - Manages start/stop on mount/unmount.
   - Subscribes to events and derives state: `status`, `isUserSpeaking`, `isAgentSpeaking`, `agentText`, `lastFeedback`.
   - Exposes `sendText`, `sendControl`, `updateContext`.
2. **Rehearsal Container:**
   - New `RehearsalModeContainer` instantiates engine (via factory) and passes to `RehearsalMode`.
   - Handles feature-flag fallback (legacy managers if engine disabled).
3. **RehearsalMode Refactor:**
   - Accepts `ConversationEngine` prop.
   - Uses hook output for UI state.
   - Calls `engine.updateContext` whenever cue/line changes.
   - Removes direct usage of `useTTS`, `useSpeechRecognition`, `EnhancedAudioManager`.

### Phase 4 – Cleanup & Migration (Deferred)
1. Toggle `conversation_engine_eleven` to `true` by default once QA passes and staging rehearsals prove stable; legacy flow remains as a fallback until then.
2. Keep the legacy audio managers/hooks (`AudioManager`, `EnhancedAudioManager`, `useTTS`, `useSpeechRecognition`, etc.) in place during this rollout window; we will schedule their deletion in a dedicated cleanup cycle once the new engine is fully trusted.
3. Update docs (`SUPABASE_WORKFLOW.md`, README) to reflect the new engine and eventual migration status.
4. Remove unused dependencies (e.g., old speech-recognition polyfills) after the legacy path is fully retired.

### Phase 5 – Optional Enhancements
- Add `HybridOpenAIEngine` using OpenAI Realtime for fallback/dual-provider mode.
- Introduce coach mode: extend domain types with `AgentRole`, `PerformanceNote`.
- Tool-call integration for performance analytics dashboards.

Phase 5 items are nice-to-haves for later — coach mode and analytics dashboards stay on the back burner until the core rehearsal experience is rock-solid.

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ElevenLabs websocket instability | Loss of rehearsal audio | Keep stub fallback + feature flag; implement reconnect/backoff in engine. |
| Browser audio permission issues | Engine fails to start | Pre-flight permission prompts + graceful error events surfaced through hook. |
| Context drift between script state and engine | Incorrect AI responses | Centralize cue updates (state machine → `updateContext`) and add diagnostics logging. |
| Legacy cleanup regression | UI still depends on removed hooks | Stage removal after integration tests; keep feature flag fallback for one release cycle. |

## QA & Validation
- **Unit Tests:** Engine event normalization, context formatting helpers, hook state derivations.
- **Integration Tests:** Mock WebSocket conversation, command handling (pause/interrupt), Supabase token flow.
- **Manual QA:** Script rehearsal flow across Chrome/Safari/Edge; verify cues trigger natural turn-taking and that UI remains responsive when toggling engines.

## Deployment Checklist
1. Deploy `eleven-agent-token` Supabase function with required env vars (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`).
2. Release `ElevenAgentsEngine` bundle guarded behind feature flag.
3. Roll out hook + RehearsalMode refactor (COMPLETE - UI now depends on ConversationEngine hook/state).
4. Enable feature flag in staging; run full rehearsal regression.
5. Flip feature flag in production when QA has validated the rehearsals; monitor telemetry (latency, error rates).
6. Keep legacy managers as a fallback for now; schedule their removal in a later cleanup once the new flow is stable.
