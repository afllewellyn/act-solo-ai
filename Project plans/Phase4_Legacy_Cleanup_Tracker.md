# Phase 4 — Legacy Cleanup Tracker

Companion to `ConversationEngine Refactor PRD_Dec.md` (Phase 4 – Cleanup & Migration).
Status: **READY TO SCHEDULE** — the rehearsal UI work (the hybrid UI polish) shipped in PRs #17 and #19, so this is the next phase.

## Where we are
- `conversation_engine_eleven` is on by default (`src/lib/featureFlags.ts`); ElevenLabs is the production path.
- The legacy path (`ScriptRehearsalStateMachine` + `AudioManager`/`EnhancedAudioManager` + `useTTS`/`useSpeechRecognition`) still runs when the flag is off, and `useTTS` is also used for voice previews and "Read script".
- Do not remove anything until the exit criteria below are met.

## Exit criteria (before deleting the fallback)
- [ ] Production rehearsal stability data reviewed (reconnect counts, error categories from `logConversationEngine`).
- [ ] Manual QA signed off on the live path: AI-first and user-first scripts, Next cue, line tap, resize, mobile.
- [ ] Decision on "Read script": keep `useTTS` (it is the listen mode and the voice preview engine) or move it to a dedicated service.

## Inventory (what depends on what)
| Module | Still used by | Notes |
| --- | --- | --- |
| `ScriptRehearsalStateMachine` | `RehearsalContext`, `Practice`, `RehearsalSettingsDrawer`, `ScriptParserService` | Legacy flow; `ScriptLine` type already lives in `rehearsal/types.ts` |
| `AudioManager` / `EnhancedAudioManager` | `RehearsalContext`, `VoiceControls` | Only needed by the legacy flow |
| `useTTS` | `RehearsalSettingsDrawer`, `VoicePicker` (previews), `RehearsalMode`, `TTSManager` | Keep for previews / Read script unless replaced |
| `useSpeechRecognition` | `RehearsalMode`, audio managers | Remove with the legacy flow |
| `ScriptParserService` | `RehearsalContext` | Check whether `scriptParser.ts` replaces it |
| `ConversationEngineTest` | `App.tsx` (debug route) | Decide whether to keep as a dev tool |

## Tasks
1. [ ] Confirm exit criteria above.
2. [ ] Remove the legacy branch in `RehearsalContext` (state machine setup, `onLineChange`, audio-manager wiring).
3. [ ] Remove `stateMachine` consumers in `Practice.tsx` / `RehearsalSettingsDrawer` (Next cue and status already use the engine path).
4. [ ] Delete `AudioManager`, `EnhancedAudioManager`, `ScriptRehearsalStateMachine`, `useSpeechRecognition` and unused components (`RehearsalMode`, `TTSManager`) once nothing imports them.
5. [ ] Drop dependencies only the legacy path used.
6. [ ] Update `README.md`, `CLAUDE.md`, and `SUPABASE_WORKFLOW.md` for the single-engine setup.
7. [ ] Track CORS hardening and QA gates with the *November 2025 Sprint – Production Hardening* plan.

## Not in this phase
Coach mode, `HybridOpenAIEngine`, analytics dashboards (PRD "Phase 5 – Optional Enhancements"), and pricing (Phase 6).
