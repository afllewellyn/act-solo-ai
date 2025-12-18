# ConversationEngine Browser Compatibility

## Validated Browsers

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome Desktop | 120+ | ✅ Validated | AudioWorklet supported |
| Safari Desktop | 17+ | ✅ Validated | AudioWorklet supported |
| Firefox Desktop | 121+ | ✅ Validated | Requires sample rate resampling |
| Chrome Mobile | 120+ | ⚠️ Needs testing | Mic permissions vary by device |
| Safari iOS | 17+ | ⚠️ Needs testing | Requires user gesture for audio |
| Edge | 120+ | ✅ Validated | Chromium-based, confirmed behavior matches Chrome |

## Browser Validation Notes

- Desktop Chrome and Safari already validated (see table above).
- Newly tested: Firefox Desktop (121+) and Edge Desktop (120+) both work with the AudioWorklet path; Firefox requires explicit sample resampling, and Edge behaves identically to Chrome.

## Firefox Compatibility

Firefox strictly enforces sample rate matching between `getUserMedia()` streams and `AudioContext`. Unlike Chrome/Safari, it does not automatically resample.

**Solution**: AudioContext is created with native sample rate (e.g., 48kHz), and resampling to 16kHz (ElevenLabs requirement) is performed in the AudioWorklet processor using linear interpolation. This approach works across all browsers without affecting Chrome/Safari functionality.

## Debug Commands

Run in browser console:

```javascript
// Check browser API support
__DEBUG_AUDIO__.checkBrowserCompatibility()

// Test ElevenAgents token endpoint
__DEBUG_AUDIO__.testElevenAgentsToken()

// Enable/disable ElevenLabs engine
__DEBUG_AUDIO__.enableElevenAgents()
__DEBUG_AUDIO__.disableElevenAgents()

// View current feature flags
__DEBUG_AUDIO__.logFeatureFlags()
```

## Troubleshooting Checklist

### Microphone Issues

1. **Verify HTTPS** - Microphone access requires secure context
   - Check: `window.isSecureContext` should be `true`
   - Local development on `localhost` is allowed
   
2. **Check browser permissions**
   - Look for microphone icon in URL bar
   - Go to browser settings → Site Settings → Microphone
   
3. **Console errors**
   - `NotAllowedError` = User denied permission
   - `NotFoundError` = No microphone available
   - `NotReadableError` = Microphone in use by another app

4. **Run compatibility check**
   ```javascript
   __DEBUG_AUDIO__.checkBrowserCompatibility()
   ```

### WebSocket Connection Failures

1. **Test token endpoint**
   ```javascript
   __DEBUG_AUDIO__.testElevenAgentsToken()
   ```
   Expected: `{ status: 'success', hasSignedUrl: true }`

2. **Verify Supabase secrets are set**
   - `ELEVENLABS_API_KEY` - Your ElevenLabs API key
   - `ELEVENLABS_AGENT_ID` - Your agent's ID from ElevenLabs dashboard

3. **Check WebSocket close codes in logs**
   - `1000` - Clean close (normal)
   - `1006` - Abnormal closure (network issue)
   - `1008` - Protocol error (message format issue)

4. **Look for structured log events**
   - `websocket_connecting` - Connection initiated
   - `websocket_connected` - Success with `connectionLatencyMs`
   - `websocket_closed` - Includes `wsCloseCode` and `wsCloseReason`

### Audio Playback Issues

1. **AudioContext suspended**
   - Requires user gesture (click/tap) to start
   - Look for "AudioContext was not allowed to start" warning
   
2. **Sample rate mismatch**
   - ElevenLabs outputs 16kHz audio
   - Verify AudioContext sample rate matches

3. **Check for decode errors**
   - Look for `decodeAudioData` errors in console
   - Audio format issues logged as `audio_playback_error`

### Reconnection Loop

1. **Check logs for reconnection telemetry**
   - `reconnect_scheduled` - Shows delay and attempt count
   - `reconnect_attempting` - Reconnection in progress
   - `reconnect_exhausted` - Max attempts (5) reached

2. **Verify agent configuration**
   - ElevenLabs agent must have "Allow client-side prompt override" enabled
   - Check agent dashboard settings

3. **Network stability**
   - Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
   - Look for `errorCategory: 'network'` in logs

## Structured Log Events Reference

### Connection Lifecycle

| Event | Description | Key Fields |
|-------|-------------|------------|
| `engine_created` | Engine instantiated | `engine` |
| `websocket_connecting` | Connection starting | `connectionStartMs` |
| `websocket_connected` | Connection successful | `connectionLatencyMs` |
| `websocket_closed` | Connection closed | `wsCloseCode`, `wsCloseReason` |
| `websocket_error` | Connection error | `errorCategory` |

### Reconnection

| Event | Description | Key Fields |
|-------|-------------|------------|
| `reconnect_scheduled` | Reconnection queued | `reconnectAttempt`, `reconnectDelayMs` |
| `reconnect_attempting` | Reconnection starting | `reconnectAttempt` |
| `reconnect_success` | Reconnection successful | `reconnectAttempt` |
| `reconnect_exhausted` | Max attempts reached | `reconnectAttempt`, `maxReconnectAttempts` |

### Status Changes

| Event | Description | Key Fields |
|-------|-------------|------------|
| `status_changed` | Engine status transition | `previousStatus`, `newStatus`, `statusDurationMs` |

### Error Categories

| Category | Description |
|----------|-------------|
| `auth` | Token/API key issues |
| `network` | Connection/WebSocket failures |
| `protocol` | Message format issues |
| `audio` | Microphone/playback issues |
| `timeout` | Operation timeouts |
| `unknown` | Uncategorized errors |

## Production Monitoring

Telemetry events are emitted via the structured logger and can be wired to observability backends. Key metrics to monitor:

1. **Connection latency** - `connectionLatencyMs` on `websocket_connected`
2. **Reconnection rate** - Count of `reconnect_scheduled` events
3. **Error distribution** - Breakdown by `errorCategory`
4. **Status duration** - `statusDurationMs` for time spent in each state
5. **Audio throughput** - `audioChunksReceived` on `audio_stream_complete`
