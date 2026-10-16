# Architecture rules

- Homepage voice previews use static ElevenLabs recordings referenced through asset pointers, so visitors can listen without authentication or live generation costs.
- During live rehearsal the teleprompter scrolls continuously at a user-set speed and highlights the line on the eye-line; engine cue updates may only move it forward, so a missed transcript can never freeze the screen.
- Consecutive bold/user paragraphs are one actor turn because actors split speeches visually and the AI must wait for the full block before answering.
