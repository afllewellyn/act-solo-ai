# Rehearsal change record

## Recent changes preceding October 20, 2026
- Split bold actor paragraphs are treated as one turn. Premature AI replies are interrupted and discarded, so their completion cannot skip unfinished actor paragraphs.
- Mixed bold/italic paragraphs separated by HTML line breaks are parsed into separate role-assigned lines.
- Rehearsal logging is started and ended with live sessions.
- Hybrid prompter highlighting follows the engine cue index, not the line crossing the eye-line. Ordinary cues glide and hold; oversized cues use a delayed, bounded crawl.
- Removed the manual prompter-speed control. Font size, voice choice, pause/resume and manual navigation remain.

## October 20, 2026 — stable movement and patient partner
- Removed active-line enlargement: all cues use the selected font size, eliminating height changes on activation.
- Combined cue/layout positioning into one pass and ignored the initial unchanged resize notification. Manual scrolling retains its grace period when a new cue arrives.
- Kept the oversized-cue hold and bounded crawl; no constant-speed scrolling or silence-driven actor advancement was added.
- Extended the completed-actor-turn silence fallback from 2.5 to 4 seconds. New speech cancels the pending fallback.
- Explicitly instruct the partner to wait silently through pauses, never prompt, coach or read the actor's lines.
- Preserve early-response discard until a new response starts, including late completion/audio events arriving after actor speech.
- Intermediate paragraphs within one actor block no longer resend full context. Turn boundaries and explicit navigation continue to synchronize it.
- Connected existing private timing events: line changes, engine status, user speech ended, audio start/end, pause/resume. No dialogue or transcript content is recorded.

## October 20, 2026 — split-speech root-cause fix
- Root cause 1: a discarded early reply kept streaming audio after the interrupt and was played, so the partner was heard over (or reading) bold lines. The engine now drops every remaining audio chunk of a discarded reply until the actor speaks again or the app cues the partner.
- Root cause 2: transcripts only arrive after the actor stops, so the highlight sat on the first bold paragraph and then jumped straight to the AI line. The mic now reports speech onset locally (loudness only, no content); inside a split speech the highlight walks the bold paragraphs at a calm reading pace from that moment, stopping on the last bold paragraph.
- Transcripts confirm progress from the first unconfirmed paragraph, never move the highlight backwards, and only a transcript covering the last bold paragraph moves on to the AI line. A reply that starts while the transcript shows unfinished paragraphs is discarded.
- No-stall safety: actor speech restarts the 4-second wait instead of cancelling it; after a discarded reply, 4 seconds of silence on the last bold paragraph completes the speech and cues the partner.
- New private timing events: user_speech_started and actor_paced (indices only).

## QA boundary
Automated checks cover cue timing, split-turn interruption/recovery, ordinary scene flow and bounded prompter motion. Live signed-in microphone rehearsal requires the user's external Supabase session and remains a user verification step; simulated events do not establish ElevenLabs listening quality.
## Oct 22 2026 — AI highlight timing and in-order stepping
- Highlight moves to the AI line when the AI starts answering (text or audio), not after transcripts.
- When the AI finishes, the prompter steps forward one line; catch-up jumps only on confident matches (>=75%, lines of 4+ words) within the next 2 AI lines, never past an unspoken actor line.
- Tapping a line goes to that exact line, clears pending turn timers, and cues the AI on AI lines; finishing a text selection no longer counts as a tap.
- New `highlight_move` diagnostic (reason: ai_start / sequential / catch_up / tap, indices only).

## Oct 22 2026 — reliable audio-end and calmer split-speech pacing
- Root cause of the stuck highlight on AI lines: if the server never sent `audio_end`, the turn never completed and the prompter froze. The engine now ends the audio turn after a 2.5-second quiet gap with no more chunks (each fresh chunk restarts the wait), in addition to the existing playout-aware end.
- Split bold speeches now pace at ~1.8 words/second (was 2.3) with a 1.6-second minimum per paragraph, so the highlight trails dramatic delivery instead of racing ahead of it.
- The rehearsal-log receiver now preserves `highlight_move` details (reason, from, to) instead of dropping them, so future traces show why the highlight moved.

## Oct 24 2026 — Restore AI voices
- Early-reply mute now covers one rejected reply only; lifted by a new reply after it ended, actor speech onset, transcript, a cue, or a 1.5s quiet gap (`discard_start`/`discard_end` logs with reason and ms).
- Rehearsal Start unlocks browser audio inside the click (`audio_unlocked`/`audio_unlock_failed`).
- Voice preview: interrupted play (`AbortError`) no longer shows "Text-to-Speech Error".

## 2026-10-26 — Real ElevenLabs reply protocol (late-highlight root cause)
- Root cause: the app waited for `agent_response_end` / `audio_end`, which ElevenLabs never sends, so AI lines only finished on an interruption (one exchange late) or a 2.5s watchdog.
- Each `agent_response` message is now a complete reply (started -> text -> ended); text no longer accumulates across lines and every reply passes the split-speech early-reply guard.
- AI audio ends after a 600ms chunk-quiet window plus playback drain; a real `audio_end` is still honoured.
- Turn flow steps forward 800ms after audio ends if no reply text arrived.
- `agent_response_correction` is logged (word count only). New `server_event` diagnostic records message type names only.
