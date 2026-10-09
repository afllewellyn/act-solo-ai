# Phase B Correction — Match the Approved Mockup

The live build matches the spec on paper but not on screen. This plan brings each page and module in line with `public/preview-phase-b.html`. No changes to login, saved data, voices backend, or the conversation engine.

## 1. My Scripts page (Studio Desk)
- Header: small caps "YOUR STUDIO DESK" eyebrow, large "My Scripts (N)" title with muted count, "+ New Script" pill button.
- Cards: soft cream surface, no heavy borders; title + `⋯` menu (Edit / Duplicate / Delete with confirm).
- Character chips (uppercase, muted pills) under the title — fix the "0 characters" bug by reading saved characters, falling back to parsing the script.
- Two-line plain-text preview with clean line breaks (currently words run together, e.g. "Gatsby?I need").
- Footer row: "~N min" estimate + date on the left, black "Rehearse ▶" pill on the right.
- Follow the cream light theme in both modes as in the mockup (dark mode keeps the same layout with matching tokens).

## 2. New / Edit Script drawer
- Small caps "NEW SCRIPT" / "EDIT SCRIPT" label in the top bar with close X.
- Title becomes a large inline heading-style input ("Untitled scene" placeholder), no boxed field.
- Legend pills: "**Bold** = You" and "*Italic* = AI scene partner".
- "CHARACTERS DETECTED" chips that show role: filled black "MAYA · You" for bold lines, outlined "DANIEL · AI" for italic lines, updating live.
- Editor: one clean borderless writing surface with a slim floating B / I toolbar (drop the nested box, font dropdown and double border).
- "Paste sample scene" link under the editor.
- Footer: outlined "Save" + black "Save & Start Rehearsal →", right-aligned.

## 3. Rehearsal screen (teleprompter)
- Full dark studio view: slim top bar (Back, title, timer, "Take N", A− / A+, settings gear 40px).
- Camera dot at top, dashed amber eye-line at ~28% height; active cue pinned there, enlarged, with YOU / AI badge; past lines dimmed, upcoming lines muted; auto-scroll.
- Status near the eye-line: "Listening…" vs "AI speaking".
- Bottom pill bar: ↺ Restart, ✎ Edit script, 🔊 Read script, Next cue →, primary ▶ Start / ❚❚ Pause / ▶ Resume. Space = start/pause, E = edit.
- Remove the old editor-as-display, breadcrumb header and slider control card from this screen.

## 4. Rehearsal settings drawer
- Dark panel, title "Rehearsal settings".
- AI READS: segmented control (Italic only · Scene partner / Full script · Listen & learn) with explainer line.
- YOUR ROLE: shows the user's character(s) from bold lines.
- AI VOICES: one row per AI character — name, inline voice picker, "▶ Test" pill.
- SPEED: slider wired to existing playback speed.
- "🔊 Read script aloud (no mic)" full-width outlined button.

## 5. Edit-during-rehearsal overlay
- Opens over the teleprompter, pauses rehearsal, same clean editor as the drawer; "Save & back to rehearsal" saves, re-reads cues, resumes at current line.

## 6. Mobile
- Library 1 column; drawer full screen with sticky footer buttons.
- Teleprompter: top bar compacts to Back / timer / gear; bottom bar shows Restart, primary Start/Pause, and a "More" button for Edit / Read / Next cue. 44px touch targets.

## Technical details
- Files: `ManageScripts.tsx`, `ScriptCard` pieces, `ScriptCreatorDrawer.tsx`, `RehearsalSettingsDrawer.tsx`, `Practice.tsx`, new `TeleprompterDisplay.tsx`, `RehearsalControls.tsx`, `ScriptEditOverlay.tsx`.
- Add teleprompter/studio semantic tokens (studio bg, eye-line amber, active cue surface) in `index.css`; no hardcoded colors.
- Character role detection reuses `getScriptLines` (bold vs italic per line) plus `matchCharacterLine`.
- Preview text: convert `</p>` to line breaks before stripping tags.
- Rehearsal wiring stays on `useRehearsal` / existing start, pause, stop, readScript, and textFilter handlers.

## QA
- Typecheck + lint clean; side-by-side screenshots vs mockup at desktop and 390px mobile for each of the 5 modules.
- Click-through: create, edit, duplicate, delete; Save & Start Rehearsal; start/pause/resume/stop; filter switch; voice Test; Read script; edit mid-rehearsal resumes. Signed-in checks need you to sign in in the preview since automated login isn't available on this project.
