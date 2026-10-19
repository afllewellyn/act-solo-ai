# Stop the AI from skipping past a split bold speech

## The problem
When an actor's speech is split into several bold paragraphs, the AI sometimes starts talking after the first paragraph. The app already tries to stop it, but the rest of that early reply (its text and audio) still reaches the turn logic. When the reply "finishes", the screen jumps forward to the next AI line, skipping the actor's remaining bold paragraphs.

## What will change (for the actor)
- If the AI speaks while bold lines are still unfinished, its voice is cut off immediately and the screen stays on the actor's lines.
- The early reply is thrown away completely: it cannot move the highlight, change the status, or count as the AI's turn.
- Once the actor reaches the last bold paragraph, the AI answers as normal (on its own, or cued after a short silence).
- Everything else stays as it is: continuous scrolling, scroll speed in the header, pause/resume, Next cue, voice choice, AI-to-AI lines, end-of-script.

## Steps
1. **Ignore early replies end to end.** When an AI reply starts on a non-final actor line, mark it as "discarded": interrupt the agent, silence its audio on our side, and ignore every following text/audio event for that reply until the next reply begins.
2. **Screen can only move forward through actor lines by the actor's speech.** The "AI finished speaking" step may only advance the highlight if the current line is an AI line, or the actor's turn has reached its last paragraph. It will never skip unfinished bold lines.
3. **Recover cleanly.** After a discarded reply, return to "listening" so the actor just keeps going; no re-cue until the bold block is complete.
4. **Log it.** Record discarded replies in the rehearsal log so we can see how often the agent still jumps in.

## QA (before calling it done)
Automated tests, kept in the project:
- Split bold speech (3 paragraphs): AI reply after paragraph 1 is discarded; highlight stays on paragraph 1/2; no AI cue sent.
- Discarded reply's text and audio-ended events do not move the highlight.
- After the actor speaks the last paragraph, the AI is cued/answers and the highlight lands on the AI line.
- Normal single bold line -> AI reply still advances as before.
- AI -> AI lines still auto-cue.
- A missed actor transcript still can't freeze the screen once the actor's turn is done.
- Existing test suites (turn flow, line matching, script parser, teleprompter, engine) all pass.

Checks:
- Typecheck, lint, production build, and the real-browser smoke test.
- Browser run of the practice screen signed in: open a script with split bold speech, start rehearsal, confirm header scroll speed, font size, pause/resume, settings drawer and voice picker all work.
- Live voice check with ElevenLabs: I'll attempt it in the sandbox; if the microphone can't be simulated there, I'll tell you and ask you to do one run-through with a split speech and natural pauses.

## Technical details
- `RehearsalContext.tsx`: `onAgentResponseStarted` sets a `discardResponseRef`; while set, `onAgentResponseEnded`, `onAgentAudioStarted/Ended` skip `turnFlow`; audio player stopped/flushed via engine interrupt; flag cleared on next valid response start or on user speech reaching turn end.
- `agentTurnFlow.ts`: `complete()` guard — if current line is `actor` and not at `isTurnEnd`, do not advance; sequential fallback must not cross unfinished actor lines. Add `discardResponse()` API so the logic is unit-testable.
- `rehearsalLog.ts`: new `early_response_discarded` event.
- Tests in `src/lib/__tests__/agentTurnFlow.test.ts` and context-level test where practical.
