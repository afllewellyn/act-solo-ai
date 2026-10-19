# Homepage voice previews
- [x] Check existing ElevenLabs access before requesting a new connection.
- [ ] Replace homepage recordings with Matilda, Liam, and Jessica saying the requested introduction. Blocked: existing ElevenLabs credentials are unavailable here and the protected recording service requires a session; needs recording access or uploaded MP3s.
- [x] Add voice-specific Google Tag Manager click identifiers and events.
- [x] Verify tracking for every button, including clicks on descriptive labels (unit tests and browser checks passed).
- [ ] Verify replacement audio playback. Blocked: replacement recordings need ElevenLabs access or uploaded MP3s; existing CDN audio did not play in the local browser check.

# Hybrid cue-driven teleprompter
- [x] Decouple highlight from scroll position: engine activeIndex is the single source of truth.
- [x] Glide new cues to the eye-line, hold stationary for ordinary dialogue.
- [x] Bounded gentle crawl for too-tall cues only, clamped at the cue's bottom edge.
- [x] Remove the manual scroll-speed slider from the rehearsal HUD.
- [ ] Verify a live signed-in rehearsal with microphone and real engine turns. Blocked: auth is external_unmanaged in this sandbox, so no session can be minted; needs a real user read-through.
