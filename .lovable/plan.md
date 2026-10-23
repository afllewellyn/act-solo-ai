# Restore AI voices in rehearsal and voice previews

## Goal
The AI scene partner is heard every time it should speak, voice previews play without false error pop-ups, and every rehearsal safeguard built so far (split actor speeches, early-reply blocking, four-second silent wait, highlight and prompter movement) keeps working.

## What the actor will notice
- The AI voice comes through again after the actor finishes a line, including after a split bold speech.
- An early AI reply during the actor's speech is still cut off and never heard.
- Clicking a voice preview plays it; clicking quickly twice no longer shows "Text-to-Speech Error".
- If the browser blocks sound, a clear "tap to enable audio" message appears instead of silence.

## Root causes (confirmed in code)
1. **AI voice stays muted after a cut-off reply.** When an early reply is cut off, the rehearsal engine starts dropping all AI audio. It only stops dropping when a finished actor transcript arrives or the app sends a typed cue. If ElevenLabs sends the next reply before (or without) that transcript, or the next turn is started by the four-second fallback or local speech detection, every later reply is dropped too, so the rehearsal goes silent.
2. **Preview errors that aren't real failures.** Speech is generated successfully on the server, but browser playback errors other than "blocked by autoplay" (for example a play request interrupted by a second click) are re-thrown and shown as "Text-to-Speech Error". Rehearsal start also does not unlock browser audio on the click, so sound can be blocked.

## Steps

1. **Make the mute apply to one reply only**
   - When an early reply is cut off, remember which reply it was and drop only that reply's audio.
   - Any new reply from the agent (new response start), local actor speech onset, an actor transcript, a deliberate cue, a tap on a line, or the four-second fallback lifts the mute.
   - Safety net: the mute lifts by itself after a short quiet gap (about 1.5s with no incoming audio), so it can never stick for the rest of a session.

2. **Unlock audio on the rehearsal start click**
   - Resume the playback audio system inside the Start click so the browser treats it as user-approved sound.
   - If resuming fails, show the existing "tap to enable audio" message and log it.

3. **Calmer preview playback**
   - Treat an interrupted play request (second click, stop) as normal: no error pop-up.
   - Blocked-by-browser keeps the "Audio Requires Interaction" message.
   - Real failures (no audio returned, rate limit) still show the error.

4. **Diagnostics (indices and timings only, no script text)**
   - Log when the mute starts, what lifted it, and how long it lasted.
   - Log rehearsal audio unlock success or failure and preview play failures with their error type.

## QA to keep full functionality intact
- Unit tests (new):
  - Cut-off reply is dropped; the next reply after a new response start is played.
  - Mute lifts on speech onset, transcript, cue, tap, fallback, and quiet-gap safety net.
  - Mute never lasts across two actor turns.
  - Interrupted preview play shows no error; blocked play shows the interaction message; missing audio shows the error.
- Existing tests must all still pass, especially: split bold speech early-reply blocking, AI-to-AI line cue after 0.5s, four-second silent wait, audio-end watchdog, highlight on AI start, sequential stepping and catch-up limits, tap-to-line, prompter glide and tall-line crawl, parser line roles.
- Full suite, typecheck, lint and build; load home, coaching and rehearsal pages in a real browser with no errors; click each homepage voice preview and confirm no error pop-up.
- Live check (you): rehearse "Sweet Carolina Holiday Scene 2" and "Unfinished". Confirm the AI is heard after every actor turn, early replies stay cut off, and highlighting still follows in order. I then review the new mute and audio logs.

## Out of scope
- No ElevenLabs agent setting, voice or turn-taking changes.
- No changes to prompter movement, highlight rules or the four-second wait.

## Technical details
- `ElevenAgentsEngine.ts`: replace the boolean `discardingAudio` with a per-reply discard (keyed on the event id / response start after `discard_response`); clear on `agent_response` for a new reply, `user_transcript`, `sendText`, `sendControl` resets, `vad`/onset signals, and a resettable ~1.5s no-audio timer. Log `discard_start` / `discard_end {reason, ms}`.
- `RehearsalContext.tsx`: call the engine/audio-player resume inside the start handler; ensure tap and fallback paths clear the discard.
- `AudioPlayer.ts`: expose `unlock()` that creates/resumes the AudioContext.
- `useTTS.tsx`: treat `AbortError` as non-fatal; keep `NotAllowedError` handling; log play failures.
- Tests in `src/services/conversation/__tests__/ElevenAgentsEngine.test.ts`, `AudioPlayer.test.ts`, and a new `useTTS` playback test; update `docs/REHEARSAL_CHANGE_RECORD.md`.
