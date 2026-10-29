# Architecture rules

- Homepage voice previews use static ElevenLabs recordings referenced through asset pointers, so visitors can listen without authentication or live generation costs.
- Homepage voice button clicks use the shared tracking helper to emit voice-specific dataLayer events, so analytics never depends on clicked child text.
- During live rehearsal, highlight follows the engine cue index independently of scroll position; a single positioning pass glides cue changes, and only oversized cues crawl within their own bounds to avoid competing scroll controllers.
- Intermediate actor paragraphs update visual position without resending full engine context; turn boundaries and explicit seeks still synchronize context because consecutive actor paragraphs share one turn.
- Rehearsal diagnostics record line indices and lifecycle/audio timings, never script text or transcripts, so timing can be investigated without collecting dialogue.
- ElevenLabs sends each agent_response as one complete reply with no end markers, so the engine treats every message as a whole reply and ends audio on a short chunk-quiet window plus playback drain.
- Inside a split actor speech the highlight is paced from local speech onset and confirmed by transcripts, and rejected agent replies are dropped at the engine's audio input, because server transcripts arrive only after the actor stops and interrupted replies keep streaming.
- Consecutive bold/user paragraphs are one actor turn because actors split speeches visually and the AI must wait for the full block before answering.

- Site-wide clicks emit one `ui_click` dataLayer event (id from `data-track`, else a slug of the accessible name) via a single delegated listener, so new buttons are tracked without per-button code; voice previews keep their own event.
