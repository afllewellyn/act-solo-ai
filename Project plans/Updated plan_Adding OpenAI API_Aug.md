## INITIAL PROMPT TO KICK OFF ADDING OPEN AI REAL TIME API FOR S2S

Review and analyze this plan before writing any code. Confirm understanding, surface assumptions, understand you follow, then work through phase-by-phase.

Objective

Optimize the current Web Speech engine implementation and evolve the app to support a parallel S2S engine powered by OpenAI Realtime (WS) \+ VAD, while keeping ElevenLabs for Voice AI TTS playback. The system must support any script with any role names.

updated archetecture at a glance:  
\[Browser (Lovable)\]  
| mic PCM (16k mono via AudioWorklet in S2S mode)  
v  
\[App Server / Supabase Edge\]  
|-- WS to OpenAI Realtime (STT/NLU \+ VAD)  
|-- /tts \-\> ElevenLabs streaming (Voice AI audio out)  
v  
\[Client Playback\]  
| AudioContext with jitter buffer, barge-in (cut)

Browser State Hardening & VAD (Must-Haves)

Server-centric VAD & turn-taking: Use server-side VAD (py-webrtcvad or RNNoise) \+ Realtime partials; do not rely on client timers.

S2S persistence: Keep the OpenAI Realtime WS warm on the server with heartbeats and exponential backoff.

Mic in background: Client streams mic to server; if the browser throttles JS in background, server VAD still functions.

Playback resilience: 100–150 ms jitter buffer; AbortController per TTS for instant Cut (no tail audio).

Autoplay/User gesture: Require a user gesture before first audio; resume AudioContext on demand.

Visibility handling: On visibilitychange, pause nonessential UI timers; show "Tap to resume audio" if AudioContext is suspended.

Permissions UX: First-run flow for mic permission \+ graceful retry.

Global Acceptance Criteria (across character roles)

Voice AI audio begins within \<600 ms after Character finishes a line (S2S mode).

Cut cancels current Voice AI playback immediately (no tail audio).

Web Speech fallback detects Character cues and avoids duplicate restarts.

Teleprompter highlights nowPlaying index from server messages.

Multiple role-to-voice assignments are supported (no hard-coded names).

CORS allowlist matches deployed Lovable origins.

Phase 0 — Discovery & Readiness (No code changes)

Goal: Validate assumptions, inventory current code, and lock success metrics.Acceptance

Risks and toggles documented; all secrets available; origins listed.

Phase 1 — Stabilize Web Speech Engine (Current Implementation)

Stabilize in this phase

Eliminate restart races; guarantee single active recognition op.

Bound CPU cost of phonetic matching; maintain UI responsiveness.

Normalize cue extraction for mixed-case role names.

Mobile-friendly loop with explicit user trigger.

Goal: Fix correctness/latency issues before introducing S2S.  
Rollback

Toggle a feature flag speech.useLegacy to revert to previous hook behavior.

Phase 2 — Streaming ElevenLabs /tts Endpoint

Stabilize in this phase

Replace base64 responses with chunked streaming for sub-200 ms first byte on short lines.

Standardize abort/cancel semantics for Cut across endpoints.

Lock CORS allowlist; remove wildcard before production.

Goal: Replace base64 response with chunked streaming; add barge-in.  
Rollback

Feature flag tts.streaming=false falls back to old base64 endpoint.

Phase 3 — Engine Switch & S2S Client Plumb

Stabilize in this phase

Maintain identical public hook API regardless of engine.

Ensure S2S and Web Speech produce identical cue detection on reference scenes.

Graceful degradation: auto-fallback to Web Speech if S2S WS unavailable.

Goal: Introduce an engine switch without changing public hook API.  
Rollback

engine='webspeech' via feature flag.

Phase 4 — Realtime Bridge (Server) with OpenAI WS \+ VAD

Stabilize in this phase

End-of-turn detection accuracy; suppress false positives/negatives.

Backpressure handling on WS streams; no buffer bloat.

Reliable nowPlaying sync to teleprompter.

Goal: Server maintains a persistent WS to OpenAI Realtime; performs VAD; emits events.  
Rollback

Disable S2S WS; the app continues with Web Speech \+ manual Next.

Phase 5 — Playback & UX Polish

Stabilize in this phase

Smooth playback under tab throttling; no audible gaps.

Deterministic keyboard shortcuts; no ghost triggers during focus changes.

Diagnostics in place (latency, cut-to-silence) to prove targets.

Goal: Smooth, actor-friendly experience.  
Rollback

Disable diagnostics; leave core features intact.

API Contracts (Reference)

GET /api/scene/:id → { lines:\[{idx,speaker,text}\], voices:{ \[role\]: { provider, voice\_id, instructions? } } }

POST /api/rehearse/start { sceneId, actor } → { sessionId, wsUrl }

WS /ws/rehearse?sessionId=...

Client → Server: binary PCM frames; JSON controls {type:'advance'|'cut'|'setTargetWords', ...}

Server → Client: binary audio chunks; JSON {type:'nowPlaying',idx}; optional {type:'caption',text}

POST /tts

Body: { text, voice\_id, latency?, format? }

Response: streamed audio (audio/mpeg default)

POST /tts-with-timestamps (optional)

Body: { text, voice\_id }

Response: JSON { audio\_base64, alignment }

Observability & Telemetry

Log IDs: sessionId, requestId, lineIdx, engine type, latency (ms).

Metrics: end-of-turn → first-audio latency (p50/p95), cut-to-silence time, WS reconnects.

Error taxonomy: STT\_ERROR, TTS\_ERROR, WS\_ERROR, VAD\_ERROR, CORS\_ERROR.

Security & Config

Keep all API keys server-side only.

CORS allowlist for production \+ staging origins.

Rate limits per IP and per session.

Sanitize text (already in place) and clamp settings.

Risks & Mitigations

Mobile Safari constraints: keep Web Speech fallback; add manual trigger CTA.

Streaming decode hiccups: add jitter buffer; prefer PCM/Opus if plan allows.

WS drops: heartbeat \+ exponential backoff; resume gracefully.

Final “Build” Prompt for Lovable

Before coding

Review and analyze this document; list assumptions and questions.

Propose a task breakdown by phases (no time estimates).

Confirm feature flags and rollout order.

Call out any platform constraints (iOS background mic, autoplay rules) and how we’ve mitigated them above.

Then implement sequentially:

Phase 1 (Web Speech fixes) — keep behavior identical but more reliable.

Phase 2 (/tts streaming \+ barge-in) — replace base64; prove low-latency.

**Phase 3** (Engine switch) — add 'webspeech' | 's2s' toggle with identical API. (starting 8/31)

Phase 4 (Realtime bridge \+ VAD) — wire WS to OpenAI; emit cue\_detected & nowPlaying.

Phase 5 (Playback polish) — jitter buffer, shortcuts, diagnostics.

Definition of Done

All Global Acceptance Criteria met.

Demo script shows Character/Voice AI parity across both engines.

Logs/metrics dashboard shows p50 latency \< 600 ms and clean cut behavior.

## 

## 

## 

## Confirmed Technical Decisions

### Sample Rate Strategy ✅

* STT/VAD Path: 16 kHz mono PCM (browser → server → OpenAI Realtime)  
* Frame sizing: 16 kHz @ 20 ms \= 320 samples/frame  
* TTS Output: Keep ElevenLabs streaming as MP3/Opus (browser handles conversion)  
* Rationale: 16 kHz is the safest for realtime ASR/VAD, keeps bandwidth low, widely supported

### CORS Origins ✅

Yes, we definitely need to add https://lovable.dev to the CORS allowlist. Based on typical Lovable patterns, the complete allowlist should be:  
const corsHeaders \= {  
  'Access-Control-Allow-Origin': \[  
    'https://lovable.dev',  
    'https://preview--act-solo-ai.lovable.app', // production  
    'http://localhost:3000', // local dev  
    'https://localhost:3000'  // local dev with HTTPS  
  \].join(', '),  
  // ... rest of headers  
}

Used \> https://preview--act-solo-ai.lovable.app, http://localhost:5173, https://localhost:5173, http://localhost:3000, [https://localhost:3000](https://localhost:3000)

### Default Engine & Fallback ✅

* Default: engine \= 's2s'  
* Auto-fallback to: 'webspeech'  
* Fallback triggers:  
  1. Missing OPENAI\_API\_KEY  
  2. Failed /health/realtime WS handshake  
* UX: Show toast: "Realtime unavailable — using Web Speech."

## Updated Implementation Plan

### Phase 0.5: Access & Health Check

// /health/realtime endpoint  
{  
  "status": "ok|error",  
  "model": "gpt-4o-mini-realtime",  
  "latency\_ms": 150,  
  "openai\_available": true  
}

### Phase 1: Web Speech Hardening

* Single-session guard (prevent restart races)  
* Mixed-case name normalization: /\\b(character|role)\\s\*:?\\s\*/gi  
* Bounded phonetic matching (throttle CPU cost)  
* visibilitychange handler → "Tap to resume audio" UI

### Phase 2: Streaming TTS \+ CORS

* New /tts edge function with streaming response  
* CORS update: Replace \* with specific allowlist including lovable.dev  
* AbortController per request for instant Cut  
* Metrics: latency\_ms\_endToFirstByte, cut\_to\_silence\_ms

### Phase 3: Engine Switch (aug 31\)

window.\_\_FEATURES\_\_ \= {  
  'audio.engine': 's2s',      // default  
  'fallbackToWebSpeech': true,  
  'speech.useLegacy': false,  
  'tts.streaming': true  
}

### Phase 4: Realtime Bridge

* Audio Format: 16 kHz mono PCM, 320 samples/frame  
* Model: gpt-4o-mini-realtime  
* Server VAD: Conservative defaults (300-400ms silence threshold)  
* Events: cue\_detected, nowPlaying, audio\_chunk

### Phase 5: UX Polish

* Jitter buffer: 100-150ms  
* Keyboard shortcuts: Next, Cut, Toggle engine  
* Dev overlay with p50/p95 latency metrics

## Key Architecture Points

1. Sample Rate Flow:  
   * Browser captures at any rate → resample to 16 kHz on server → send to OpenAI  
   * ElevenLabs returns MP3/Opus → browser handles playback conversion  
2. CORS Security:  
   * Phase 2 removes wildcard (\*)  
   * Explicit allowlist with lovable.dev, production, and dev origins  
3. Engine Fallback:  
   * Health check validates OpenAI access on startup  
   * Automatic graceful degradation with user notification  
   * Identical hook API regardless of engine  
4. Metrics Foundation:  
   * Structured logging with sessionId, lineIdx, engine, latency\_ms  
   * Phase 5 adds p50/p95 diagnostics overlay for development

# **Concrete “Go” Checklist (so Lovable can proceed)**

* **0.5 Access**

  * Add `OPENAI_API_KEY` (server).

  * `/health/realtime` WS check logs model \+ roundtrip.

* **1 Web Speech**

  * Fix shadowing \+ op guard; throttle phonetics.

  * Mixed-case name strip regex.

  * “Tap to resume” UI for mobile.

* **2 TTS Streaming**

  * `/tts` streaming (mp3 or pcm\_16000 if available).

  * `AbortController` per request; wire **Cut**.

  * Replace CORS `*` with allowlist.

  * Emit `latency_ms_endToFirstByte`, `cut_to_silence_ms`.

* **3 Engine Switch**

  * Add `engine` switch \+ auto-fallback.

  * Keep hook API identical; parity tests on cues.

* **4 Realtime \+ VAD**

  * Server WS to Realtime; append/commit PCM frames.

  * VAD defaults above; configurable.

  * Emit `cue_detected` \+ `nowPlaying`.

  * Backpressure \+ reconnect.  
  * [https://platform.openai.com/docs/guides/realtime-vad](https://platform.openai.com/docs/guides/realtime-vad)  
  * 

* **5 UX & Diagnostics**

  * Jitter buffer 100–150 ms; resume AudioContext on gesture.

  * Keyboard shortcuts (Next, Cut, Toggle engine).

  * Dev overlay with p50/p95 metrics.

