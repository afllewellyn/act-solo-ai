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

## QA boundary
Automated checks cover cue timing, split-turn interruption/recovery, ordinary scene flow and bounded prompter motion. Live signed-in microphone rehearsal requires the user's external Supabase session and remains a user verification step; simulated events do not establish ElevenLabs listening quality.