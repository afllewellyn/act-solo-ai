# Fix the root cause of late highlighting: the app waits for a signal ElevenLabs never sends

## What the latest rehearsal log shows
Session `12350ae2` (28 lines, ~62s):

```text
12.9s  AI line 3 starts speaking (highlight on time)
16.3s  AI audio ends ............ highlight STAYS on line 3
17.0s  actor speaks line 4 ...... highlight still on line 3
19.0s  AI speaks again .......... still line 3
24.2s  something interrupts -> highlight finally jumps 3 -> 4 -> 5
...
41.2s  AI line 7 audio ends ..... stuck again until 45.6s
51.4s  AI line 10 audio ends .... stuck until the session stopped (62.5s)
```

The pattern repeats on every AI line: the highlight only moves on when the actor talks over the AI, roughly one full exchange late. It has nothing to do with how the script is formatted.

## Root cause
- The app counts an AI line as finished only once it gets two things: "audio finished" and "reply text finished". The "reply text finished" signal (`agent_response_end`) does not exist in ElevenLabs' list of server messages ([official event list](https://github.com/elevenlabs/packages/blob/f61e7282/packages/types/schemas/agent.asyncapi.yaml)). ElevenLabs sends each reply as one complete text message. So the app keeps waiting until an interruption happens, which is the only other way it emits "reply finished".
- Side effects of the same bug:
  - The "AI started a new reply" signal fires only once, because the app thinks the first reply never ended. So the early-reply guard for split bold speeches only gets checked once. That explains the times the AI still read bold lines, and why 0.8s of an early reply played at line 1 in this session.
  - Reply text keeps piling up across lines, which throws off the line matching.
- The "audio finished" marker (`audio_end`) isn't on the official list either. So every AI line currently ends through the 2.5-second silence safety net, which adds about 2.5 seconds of lag every time.
- Why earlier QA passed: the automated tests fed the app made-up `agent_response_end` and `audio_end` messages, so they tested a conversation ElevenLabs never actually produces.

## Fix
1. **Treat each ElevenLabs reply message as a complete reply.** When an `agent_response` arrives: mark the reply started, keep its full text, and mark the text finished straight away. The next reply starts fresh. Every reply then goes through the early-reply guard, and text no longer piles up across lines.
2. **End the AI's line when its voice actually stops.** End it once playback has drained and about 600ms passes with no new audio. This replaces the 2.5s wait. The 2.5s safety net stays as a backup, and a real `audio_end` is still respected if one ever arrives.
3. **Never let missing text freeze the prompter.** If the audio finishes and no text shows up within about 800ms, step forward one line anyway.
4. **Interruptions:** if ElevenLabs sends a corrected (cut-off) reply, use the shortened text for matching and nothing else.
5. **Record what ElevenLabs actually sends.** Add a private diagnostic with only the message type name and timing, never any text, so the next log proves which signals arrive.

Kept as is: the four-second patient wait, split-speech pacing, tap behaviour, the prompter's glide and tall-line crawl, voices, and the ElevenLabs dashboard settings.

## QA
- Rewrite the engine tests to use real ElevenLabs message sequences: one `agent_response` with the full text, audio chunks, and no end markers. Check that:
  - the AI line ends about 600ms after its audio drains;
  - every new reply triggers "reply started", so a second early reply during a split bold speech is also discarded;
  - reply text doesn't carry over from one line to the next;
  - a real `audio_end` and interruptions still work.
- Turn-flow test: audio ends with no text, and the prompter still steps forward one line.
- Scene test using this session's line pattern: the highlight reaches each next line within about 1s of the AI finishing, never one exchange late.
- Run the full test suite, typecheck, lint and build, then load the home and rehearsal pages in a real browser.
- Live check (you): rehearse any script. After each AI line the highlight should move to your bold line about half a second after the voice stops. Then I read the new diagnostic log to confirm which signals ElevenLabs sent.

## Technical details
- `ElevenAgentsEngine.ts` `agent_response` case: emit `agent_response_started`, `agent_response` (with `agent_response_event.agent_response`) and `agent_response_ended` per message, and reset `isResponseActive`. Keep the `agent_response_end` handler for compatibility. Add an `agent_response_correction` case that updates the text only. In `armAudioEndWatchdog`, use a ~600ms quiet window gated on `audioPlayer.isBusy === false`, with 2.5s as the hard cap. Make sure the discard logic (`rejectedReplyEnded`, `new_reply` lift) works with per-message replies.
- `agentTurnFlow.ts` `onAudioEnded`: if `pendingText === null`, arm an ~800ms timer that calls `complete()` with empty text (sequential step).
- `rehearsalLog.ts` and `supabase/functions/rehearsal-log`: add a `server_event` event with `{ type }` only, logged once per type change, not per audio chunk. Redeploy `rehearsal-log`.
- Update `ElevenAgentsEngine.test.ts` and `agentTurnFlow*.test.ts`, plus `docs/REHEARSAL_CHANGE_RECORD.md` and the protocol-sequence note in `AGENTS.md`.
