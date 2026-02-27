

# Plan: Convert Help Center to FAQ-Only Page

## File: `src/pages/HelpCenter.tsx`

1. **Remove** the four quick-link cards and unused icon imports (`BookOpen`, `MessageCircle`, `Video`, `Zap`).

2. **Update heading** to "Help & FAQ".

3. **Expand FAQ** with these new items (in addition to keeping existing ones):

   - **"How do I get started with ActSolo?"** — Create account, add a script, start rehearsal.
   - **"How does Rehearsal Mode work?"** — AI reads scene partner lines aloud via TTS, user follows along and practices their own lines, play/pause controls.
   - **"How do I manage and edit my scripts?"** — Manage Scripts page for adding, editing, deleting scripts using the rich text editor.
   - **"What script format should I use?"** — Use the rich text editor to format your script. **Italic text** is read aloud by the AI voice (scene partner lines). **Bold text** marks your lines to practice. No special format like character names with colons is required.
   - **"Can I choose different voices for characters?"** — Voice selection during role/rehearsal setup.
   - **"Is ActSolo free?"** — Current availability info.

4. **Update existing FAQ item-1** ("How do I upload a script?") to remove the requirement about "character names followed by colons" — replace with guidance about using bold/italic formatting.

5. **Keep** the "Still need help? Contact Support" CTA at bottom.

