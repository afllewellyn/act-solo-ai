# Architecture rules

- Homepage voice previews use static ElevenLabs recordings referenced through asset pointers, so visitors can listen without authentication or live generation costs.
- Homepage voice button clicks use the shared tracking helper to emit voice-specific dataLayer events, so analytics never depends on clicked child text.
- During live rehearsal, highlight follows the engine cue index independently of scroll position; a single positioning pass glides cue changes, and only oversized cues crawl within their own bounds to avoid competing scroll controllers.
- Intermediate actor paragraphs update visual position without resending full engine context; turn boundaries and explicit seeks still synchronize context because consecutive actor paragraphs share one turn.
- Rehearsal diagnostics record line indices and lifecycle/audio timings, never script text or transcripts, so timing can be investigated without collecting dialogue.
- Consecutive bold/user paragraphs are one actor turn because actors split speeches visually and the AI must wait for the full block before answering.
