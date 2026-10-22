# Fix delayed AI highlighting and skipped lines

## Goal
Every line, especially the AI's lines, gets highlighted and brought to the eye-line on time and in order. No jumping past actor lines, no waiting on slow transcripts.

## What changes for the actor
- The highlight moves to the AI line when the AI starts speaking, not seconds later.
- The prompter always steps forward one line at a time. It only jumps ahead (catch-up) when it is very sure a line was missed, and only a short distance.
- Tapping a line goes to exactly that line, and the scene picks up from there (the AI speaks it if it's an AI line).
- Selecting text with the mouse no longer jumps the prompter.

## Steps

1. **Highlight AI lines when the AI starts speaking**
   - When an accepted AI response starts (first text or first audio), if the highlight is still on the actor's finished turn, move it to the next AI line straight away.
   - When the AI finishes, move past that AI line as now, without moving the highlight twice.
   - Early replies that get discarded during split bold speeches keep being ignored (no change).

2. **Step forward in order, and limit catch-up jumps**
   - When the AI finishes a line, move to the line after the active AI line by default.
   - Text matching can skip ahead only within a small window (the next 2 AI lines), needs a stronger match, and short lines (under 4 words) can never trigger a jump.
   - Matching never jumps over an actor line the actor hasn't spoken.

3. **Fix tapping a line**
   - Tapping selects that exact line.
   - It clears pending turn timers and per-turn state so old timers can't move the highlight afterwards.
   - Tapping an AI line cues the AI to speak it; tapping an actor line waits for the actor.
   - A click that ends a text selection is ignored.

4. **Diagnostics**
   - Log (line numbers and timings only, no script text) when the highlight moves on AI response start, on sequential steps, on catch-up jumps (with distance), and on taps. Lets us confirm the fix from the next rehearsal logs.

## QA
- Unit tests:
  - AI response start moves the highlight to the next AI line right away.
  - AI finishing steps forward exactly one line by default.
  - Catch-up is capped at the 2-line window; short or weak matches never jump; matching never passes an unspoken actor line.
  - Split bold speech: early reply still discarded, highlight stays in the actor block.
  - AI line followed by another AI line still gets cued after 0.5s; four-second silent wait unchanged.
  - Tapping resets timers, cues an AI line, ignores a text-selection click.
- Run the full test suite, typecheck, lint and build; load the home and rehearsal pages in a real browser with no errors.
- Live check (you): rehearse "Unfinished" and "Sweet Carolina Holiday Scene 2" and look for: the AI line lighting up as soon as the voice starts, no skipped bold lines, and taps landing on the right line. Then I review the new logs.

## Out of scope
- No changes to ElevenLabs agent settings, voices or the four-second wait.
- No changes to the prompter's glide or tall-line crawl.

## Technical details
- `src/lib/agentTurnFlow.ts`: advance on `onResponseStarted`/`onAudioStarted` when the current line is a finished actor turn; in `complete()` default to sequential advance from the active AI index; track an `advancedOnStart` flag so we don't advance twice.
- `src/utils/lineMatching.ts`: `findSpokenAiLine` gets a `maxAiLinesAhead` (2) limit, threshold about 0.75, minimum 4 words, and stops at the first unspoken actor line.
- `src/contexts/RehearsalContext.tsx` / `TeleprompterDisplay.tsx`: tap passes the exact cue index; jump calls `turnFlow.reset()`, then `markCued` + cue agent on AI lines; ignore clicks when `window.getSelection()` is non-empty.
- `src/lib/rehearsalLog.ts`: new event reasons (`ai_start`, `sequential`, `catch_up`, `tap`) with indices only.
- Update tests in `src/lib/__tests__/`, `src/utils/__tests__/lineMatching.test.ts`, and `docs/REHEARSAL_CHANGE_RECORD.md`.
