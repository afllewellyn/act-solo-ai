# Plan: Trackable, labeled, keyboard-friendly buttons across the site

## Goal
Every button can be named in analytics and read by screen readers. Every control works with Tab, Enter, and Space, and shows a clear focus ring.

## What changes for you
- Each button gets a stable name (for example `practice_start_rehearsal`, `practice_stop`, `practice_next_cue`). In Tag Manager you can then set up one trigger on that name, instead of matching on classes or button text.
- Buttons that only show an icon, or whose text changes (Start / Pause / Resume), get a spoken label that matches what the button does right now.
- Tab order follows what you see on screen. Each control shows a visible focus outline, including on the dark rehearsal screen.

## Scope (pages and menus)
1. **Rehearsal screen:** Back, A− / A+, Settings, Restart, Edit script, Read script, Next cue, More controls (and every item in that menu), Stop, Start/Pause/Resume, plus Cancel and Save in the editor.
2. **Rehearsal settings drawer:** voice choices, "AI reads" filter options, and close.
3. **Script editor toolbar:** Bold, Italic, Undo, Redo (labels already exist; add tracking names).
4. **My Scripts:** New script, per-script action menu, and the open/practice buttons.
5. **New script drawer:** its tabs and actions.
6. **Homepage, Help Center, Contact, Sign-in, Coaching:** CTAs, the nav and footer links that act as buttons, the voice previews (keep their current tracking), and Book a Session.
7. **Shared shadcn buttons:** check that icon-only buttons have labels.

## Approach
- Add a `data-track="<area>_<action>"` attribute to each control. Names are stable and lowercase, and never contain script text.
- Add `aria-label` only where the visible text is missing or doesn't explain the button. Where good visible text exists, leave it as the name, so the label never conflicts with what a sighted user sees.
- Toggle buttons get `aria-pressed` (Bold, Italic, filters). Menu buttons get `aria-expanded` / `aria-controls`.
- The "More controls" menu: Escape closes it and returns focus to the trigger. Arrow keys move between items, or the menu is switched to the existing accessible dropdown component.
- Add a shared `focus-visible:ring` style to the studio pill and icon button classes so the focus ring shows on the dark background.
- Replace any clickable `div`/`span` with a real `button`. No positive `tabIndex` values.
- Optional: a small click listener that pushes `{ event: 'ui_click', button_id, button_label }` to the dataLayer for any `[data-track]` element. This gives one event for every button, kept separate from the voice-preview events.

## QA
- A test confirms every `button` on the rehearsal, My Scripts and homepage screens has an accessible name and a `data-track` value.
- A test that Escape closes the More menu and puts focus back on its trigger.
- An automated accessibility scan (axe) of the public pages in a headless browser, with zero critical findings.
- A Tab-through check on the rehearsal controls in a headless browser, with screenshots of the focus rings.
- Typecheck, unit tests, lint and build all pass. Voice-preview tracking tests still pass.

## Out of scope
Visual redesign, wording changes to visible button text, and changes to rehearsal behavior.
