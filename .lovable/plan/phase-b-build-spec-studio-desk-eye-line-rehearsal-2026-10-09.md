# Phase B Build Spec — Studio Desk & Eye-Line Rehearsal

Build the approved Phase B mockup (`public/preview-phase-b.html`) into the real app. Two workstreams: the **Studio Desk** script-management redesign and the **Eye-Line Rehearsal** teleprompter HUD. No changes to auth, Supabase schema, ElevenLabs engine, or the conversation plumbing.

## 1. Studio Desk (replaces current Manage Scripts tabs)

Replace the tabbed "My Scripts / Create Script" layout with a single library view plus a slide-over creator.

**Script library**
- Card grid (3-col desktop, 1-col mobile) replacing the current stacked list.
- Each card: title, character count, created date, plain-text preview, and a 3-dot (`⋯`) menu.
- 3-dot menu actions (shadcn `DropdownMenu`, large touch targets):
  - **Edit** — opens the creator drawer pre-loaded with the script; Save updates in place.
  - **Duplicate** — clones the row with " (Copy)" appended to the title.
  - **Delete** — confirmation dialog before removing the record (existing delete logic, plus confirm).
- Keep the existing **Practice** button per card.

**Creator slide-over**
- "+ New Script" opens a right-side drawer (full-screen sheet on mobile) instead of the Create tab.
- Fields: title, rich-text script editor (existing TipTap editor, bold = user / italic = AI preserved).
- Live character detection: parse `NAME:` prefixes from the HTML and show character chips as the user types (reuse existing parser helpers).
- Actions: **Save** (insert/update, close drawer, refresh list) and **Save & Rehearse** (save, then navigate to `/practice/:id`).
- Formatting hint text explaining bold/italic conventions.

**Header**
- Keep existing header (brand, welcome, theme toggle, sign out). Remove the Tabs component entirely.

## 2. Eye-Line Rehearsal (Practice page HUD)

Rework the Practice page layout around the teleprompter reading experience.

**Teleprompter display**
- Active line pinned to the upper third of the scroll area; past lines dimmed above, upcoming lines below.
- Larger, distance-readable type with `A−` / `A+` font-size controls (persist per session).
- Peripheral status indicator: **Listening…** (user's turn) vs **AI speaking** — visible without looking away from the line.

**Controls**
- **Start rehearsal / Pause** as the single primary control (spacebar toggles). Pause halts mic + engine and resumes from the current line.
- **Stop** ends the session and resets.
- **Read script aloud** — full-script listen mode, no microphone; tap again to stop.
- **✎ Edit script** (or `E` key) — pauses rehearsal, opens the script editor; "Save & back to rehearsal" re-parses cues and resumes from the current position.
- **Settings gear** — circular icon button (the approved larger treatment, ~40px target) opening a settings drawer containing:
  - **AI reads:** Italic only / Full script toggle (existing `textFilter`).
  - Per-character voice pickers with a **▶ Test** button per voice.

**Mobile**
- Controls collapse into a bottom bar: primary Start/Pause + secondary Stop, with settings/edit behind icons.
- Font controls and status indicator stay reachable at teleprompter distance.

## 3. What stays untouched

- Auth, Supabase tables/RLS, edge functions, ElevenLabs engine and feature flags.
- Existing rehearsal state machine and `ConversationEngine` integration — this phase re-skins and re-wires the UI around them, it does not replace the engine.
- The mockup file `public/preview-phase-b.html` stays as a reference; remove it in a later cleanup if desired.

## 4. Technical notes

- New components under `src/components/scripts/` (ScriptCard, ScriptCardMenu, ScriptCreatorDrawer) and `src/components/practice/` (TeleprompterDisplay, RehearsalControls, RehearsalSettingsDrawer).
- `ManageScripts.tsx` rewritten to the library layout; `Practice.tsx` restructured around the HUD.
- Reuse: `scriptParser.ts` / `ScriptParserService.ts` for character extraction, `useTTS` for voice test, existing `textFilter` plumbing, existing script CRUD against the `scripts` table.
- Duplicate = insert of a copied row; Delete gains a confirmation step.
- Semantic tokens only; no hardcoded colors. Cream/dark theme conventions per project memory.

## 5. QA before done

- `npx tsgo --noEmit -p tsconfig.app.json` clean; lint no new errors.
- Playwright pass: create/edit/duplicate/delete a script; Save & Rehearse navigates; rehearsal start/pause/stop; italic vs full-script filter; voice test button; edit-during-rehearsal resumes correctly; mobile viewport layout check.
