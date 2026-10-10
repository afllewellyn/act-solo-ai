# ActSolo.AI

**Run your lines with an AI scene partner, anytime, in your browser.**

ActSolo.AI is for actors who need someone to read against. Paste in your script, pick a voice for your partner, and rehearse out loud. The AI reads the other parts and listens for yours, so you can practice for an audition or self-tape without waiting on a friend.

## What you can do with it

- **Rehearse any scene, any time.** No scheduling, no scene partner needed, nothing to install.
- **Talk like it's the real thing.** The AI voice sounds natural, and it listens for the end of your line before it replies.
- **Read from a teleprompter.** Your current line sits at eye level on a dark, distraction-free screen, so you can look toward the camera while you play the scene.
- **Choose your partner's voice.** Preview voices, pick one, and the app remembers your choice for that script.
- **Run it your way.** Skip to the next cue, tap any line to jump there, or change the text size.
- **Work on your phone, tablet, or computer.** You just need a modern browser. The built-in microphone is enough.
- **For auditions you submit** we recommend setting the computer / teleprompter at your eyeline and using a separate camera set on a tripod directly in front of you. 

## How it works

1. **Create an account.** Sign up, confirm your email, then log in. That's all it takes to start running lines.
2. **Add your script.** Paste it in. Mark the lines you want the AI to read in *italics* and your own lines in **bold**. Lines with no formatting are treated as stage directions, and the AI skips them. Character names are optional, and you can hide them.
3. **Pick a voice** for your scene partner.
4. **Press start and act.** If the scene opens on the AI's line, it starts by itself once it's connected.

## Good to know

- No special equipment needed. Your computer's or device's built-in microphone works fine. Your browser will ask permission to use it.
- Voice features are for signed-in users only. That keeps the service free from misuse and helps keep it running for everyone.
- Use an up-to-date browser. Microphone support varies, so if something doesn't work, try Chrome.
- Have a question or an idea? Use the Contact page in the app.

## What's coming

- A cleanup of older code to make the app lighter and faster.
- Pricing options, so heavy use can be paid for fairly.
- More polish on the rehearsal screen, based on what actors tell us.

---

## For developers

The short version is below. The full guide, including how the code is organized, is in [`CLAUDE.md`](CLAUDE.md).

```bash
git clone <repo-url>
cd act-solo-ai
npm install
cp .env.example .env   # public keys only
npm run dev
```

- Needs Node 20 or newer. Built with Vite, React, TypeScript, and Tailwind.
- Sign-in and server functions run on Supabase. The voice service keys are stored as Supabase secrets, never in this repo.
- Checks to run before opening a pull request: `npm run lint`, `npm test`, and `npm run build`.
- Project plans and notes live in the `Project plans/` folder.
