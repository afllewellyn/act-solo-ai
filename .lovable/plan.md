# Rehearsal Fixes — Voices, Name-Free Scripts, Eye-Line Scrolling

## 1. Pick and sample any voice again
**What's wrong:** The voice list in Rehearsal settings only appears for characters found from `NAME:` prefixes. Scripts without names show no voice picker at all.

**Fix:**
- Add an **AI voice** row that's always shown. It has a dropdown of every available voice (name, gender, accent) and a **▶ Test** button. It sets the voice the AI scene partner uses.
- Add a **Browse voices** list underneath. It shows every voice, each with its own ▶ preview, so the user can sample before choosing. Tapping a voice selects it.
- If the script does have named characters, each AI character also gets its own optional voice override row (as it works now). It falls back to the main AI voice.
- The voice choice is remembered for the script (saved with the script), so it's still set next time.

## 2. Names in front of lines become optional
**Rule:** *Italic = the AI reads it. Bold = you read it.* Names like "BEN:" are allowed but never required.

- **New / Edit Script panel:** "Characters detected" becomes **"Lines detected"**, e.g. "6 yours · 5 AI". Named characters still show as chips when present. The hint text changes to "Make your lines **bold** and the AI's lines *italic*. Character names are optional."
- **Script cards:** show "N your lines · N AI lines" when there are no names, or the character chips when there are.
- **Rehearsal settings:** "Your role" shows "Your bold lines (N)" when unnamed, or the names when present.
- A new **Show character names** toggle in Rehearsal settings (default on) lets users who use names keep them on the teleprompter or hide them. Names are never read aloud either way (this already works).
- Lines with no formatting are shown as stage notes in the teleprompter and skipped by the AI. A gentle tip in the editor asks the user to make every line bold or italic.

## 3. Teleprompter auto-scroll and eye-line
**What's wrong:** The highlighted line doesn't move to the eye-line as the scene plays. The likely cause is that the screen reads the current line from rehearsal state that isn't refreshed on every turn. The live AI partner also reports turns through its own events, not that state. **This is unconfirmed:** step 1 is to log the turn events during a real rehearsal and confirm it before changing anything.

**Fix:**
- Keep one current-line position owned by the rehearsal screen. It moves forward when:
  - the AI finishes speaking its line (AI turn ends), or
  - the user finishes speaking their bold line (user speech ends / line matched), or
  - the user taps **Next cue** or a line.
- Match what the AI actually said to the next AI line, so the screen catches up if a turn is missed.
- Auto-scroll centres the current line on the dashed eye-line (28% from the top) on every change. It also re-centres when the window is resized or the text size changes.
- Read script aloud (no mic) steps through the lines in time with playback, so listen mode scrolls too.
- If you scroll by hand, auto-scroll pauses briefly, then snaps back on the next line.

## Technical details
- `RehearsalSettingsDrawer.tsx`: always show the main voice selector bound to `selectedVoice` / `setSelectedVoice`, plus a browse list using `voices` and `useTTS().speak` for previews. Per-character rows only when `characters.length > 0`. Save the main voice into the script's `characters` JSON as a reserved `__default` entry (no database schema change).
- `scriptMeta.ts`: add `countLineRoles(html)` (bold / italic / plain per paragraph); keep `detectCharacterRoles` for optional names.
- `ScriptCreatorDrawer.tsx`, `ManageScripts.tsx`: switch labels and chips to the line-count summary when there are no names.
- `TeleprompterDisplay.tsx`: add a `showNames` prop that strips the `NAME:` prefix from the displayed HTML; render plain lines as muted stage notes; add ResizeObserver re-centring and a manual-scroll grace period.
- `Practice.tsx`: replace the `stateMachine.getCurrentLineIndex()` read with a local `currentLine` advanced from rehearsal context events (`rehearsalState` transitions, `onAgentResponseEnded`, `onUserSpeechEnded`), exposed via a small `onTurnAdvance` callback added to `RehearsalContext`. Fuzzy-match the agent text against upcoming AI lines.
- `RehearsalContext.tsx`: expose `onTurnAdvance` subscription and the current line index from the state machine via state (not the ref), so the UI re-renders on every change. No engine or audio changes.
- No changes to sign-in, saved data structure, or the voice backend.

## QA
- Script without names: create, save, rehearse; AI reads italic and waits on bold; settings show the voice picker; Test works for every voice.
- Script with names: per-character voices, names toggle on and off.
- Scrolling: each line lands on the eye-line through a full scene in rehearsal and in Read script mode; Next cue and line-tap jump correctly; desktop and mobile.
- Typecheck and lint clean. You'll need to do the signed-in voice and mic checks in the preview, since automated sign-in isn't available here.
