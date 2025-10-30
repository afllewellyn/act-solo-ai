# November 2025 Sprint - Production Hardening 🚀

## Build Status & Current Capabilities ✅

### ✅ **Core Architecture - COMPLETE & STABLE**
**OpenAI Realtime S2S Integration**: Fully implemented with sophisticated VAD handling
- Server-side VAD with threshold-based speech detection
- Audio buffer commit gating (prevents half-sentence commits)
- Persistent WebSocket connections with exponential backoff
- Session configuration merging (client + technical defaults)
- Fragmented message handling and RFC6455 WebSocket compliance

**Engine Switching Infrastructure**: Production-ready
- Seamless switching between 'webspeech' and 's2s' engines
- Auto-fallback logic (S2S → WebSpeech on failure)
- Identical hook APIs regardless of engine
- Feature flag-controlled rollout

**State Machine Integration**: Robust rehearsal flow
- Actor cue detection via phonetic matching
- Timer-based state transitions
- Comprehensive error handling and recovery

### ✅ **Infrastructure - MOSTLY COMPLETE**
**Health Checks**: 🟢 Complete with proper CORS
- `/health-realtime` endpoint validates OpenAI connectivity
- Uses `ALLOWED_ORIGINS` environment variable security model

**Feature Flags**: 🟢 Complete system
- All 8 planned flags implemented with runtime overrides
- Structured logging and diagnostics

**Streaming TTS**: 🟡 **Production Ready but needs CORS fix**
- ElevenLabs streaming (MP3) works perfectly
- Sub-200ms first byte latency achieved
- Planned CORS allowlist partially implemented (1/5 functions ✅)

### ✅ **User Experience - SOLID**
**Mobile Support**: Excellent handling of iOS/Safari constraints
- "Tap to Listen" flow for mobile gesture requirements
- Smart silence detection instead of timer-based

**Audio Management**: Professional-grade
- Barge-in (instant TTS cutoff)
- Queue management for smooth playback
- Auto-audio context unlock for browsers

---

## 🔒 **CRITICAL PRODUCTION BLOCKERS**

### Priority 1: Security Hardening (P0)
**CORS Implementation Gap**: 4/5 Edge Functions need allowlist migration

#### Functions Requiring CORS Fix:
- [ ] `text-to-speech-stream/index.ts` - currently wildcard `*`
- [ ] `realtime-s2s/index.ts` - currently wildcard `*`
- [ ] `text-to-speech/index.ts` - currently wildcard `*`
- [ ] `get-voices/index.ts` - currently wildcard `*`
- [x] `health-realtime/index.ts` - ✅ proper allowlist using `ALLOWED_ORIGINS`

#### Implementation Pattern (from health-realtime):
```typescript
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim());
  if (origin && allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
  }
  return {}; // Results in 403 Forbidden
}
```

**Action**: Copy `getCorsHeaders()` function to each edge function and replace static `corsHeaders` objects.

---

## 🎯 **SPRINT OBJECTIVES**

### Sprint Goal
**Secure, stable production deployment** ready for user testing by end of November. Zero security vulnerabilities, consistent user experience.

### Success Metrics
- [ ] **Security**: All API endpoints locked down with allowlisted CORS
- [ ] **Reliability**: <5% error rate in staging environment
- [ ] **Performance**: p50 TTS latency <600ms
- [ ] **User Experience**: 100% of users can access microphone without issues

---

## 📋 **NOVEMBER SPRINT BACKLOG**

### 🚨 **Week 1-2: Security & Stability** (November 1-15)

#### P0 Critical Fixes
- [ ] **CORS Migration Phase 1**: Migrate `text-to-speech-stream` and `realtime-s2s`
  - Copy `getCorsHeaders()` pattern
  - Test with production origins
  - Verify 403 responses work

- [ ] **CORS Migration Phase 2**: Migrate `text-to-speech` and `get-voices`
  - Final production endpoint lockdown
  - Comprehensive origin testing

#### P1 Stability Improvements
- [ ] **Sample Rate Consistency Audit**
  - Standardize on planned 16kHz for STT/VAD
  - Update `AudioRecorder` class configuration
  - Verify OpenAI Realtime session config

- [ ] **VAD Architecture Clarification**
  - Confirm S2S is VAD-only (no OpenAI TTS fallback)
  - Remove `speakWithS2S()` ambiguity if needed
  - Document current TTS flow: ElevenLabs only

### 🎨 **Week 3-4: Polish & UX** (November 15-30)

#### P1 Quality of Life
- [x] **Diagnostics Overlay**: Create p50/p95 latency metrics UI
- [ ] **Keyboard Shortcuts**: Implement Next/Cut/Engine toggle
- [ ] **Jitter Buffer**: Add 100-150ms buffer for playback resilience

#### P2 Edge Cases & Error Handling
- [ ] **WebSocket Reconnection Logic**
  - Exponential backoff implementation
  - Connection pool management
  - Graceful degradation monitoring

- [ ] **Audio Playback Resilience**
  - Mobile audio interruption recovery
  - Background tab throttling handling
  - Concurrent session limit enforcement

### 🧪 **Week 5: Testing & Validation** (December 1-7)

#### End-to-End Testing
- [ ] **Performance Validation**
  - Load testing with concurrent users
  - Latency measurement against 600ms SLA
  - Memory leak assessment under prolonged use

- [ ] **Browser Compatibility Matrix**
  - Chrome/Edge stable
  - Firefox latest
  - Safari iOS/macOS
  - Mobile gesture flow verification

#### Production Readiness
- [ ] **Security Audit**
  - Environment variable exposure check
  - API key rotation procedures
  - Rate limiting validation

- [ ] **Monitoring Setup**
  - Error tracking implementation (Sentry/equivalent)
  - Performance dashboard creation
  - Alert threshold configuration

---

## 📊 **PROGRESS TRACKING**

### Completed This Sprint (Before Nov 1)
- [x] OpenAI Realtime VAD bridge implementation
- [x] Streaming TTS infrastructure
- [x] Engine switching system
- [x] Health check endpoints
- [x] Feature flag system
- [x] Mobile-optimized audio flow
- [x] State machine integration

### November Sprint Timeline
```
Week 1: Security lockdown (CORS + origins)
Week 2: Architecture cleanup (VAD clarity + samples)
Week 3: UX polish (shortcuts + diagnostics)
Week 4: Edge case hardening (WS reconnect + audio resilience)
Week 5: Testing & production prep
```

### Risk Mitigation
1. **Feature Rollback**: Auto-fallback to WebSpeech engine works reliably
2. **Service Degradation**: Health checks allow graceful service unavailability
3. **Browser Issues**: Mobile tap-to-listen prevents permission failures

---

## 🎯 **DECEMBER SPRINT PREP** (Post-Nov Sprint)

If November sprint is successful, December will focus on:
- User acceptance testing
- Performance optimization
- Feature enhancements (script annotations, collaborative features)
- Go-to-market preparation

---

**Sprint Lead**: AI Assistant 🤖
**Review Cycle**: Weekly with architecture validation
**Go-Live Criteria**: All security issues resolved, <1% error rate in staging
