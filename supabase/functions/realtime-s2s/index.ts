
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// Model configuration
const OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

// Helper to read OpenAI API key with fallback and trimming
const getOpenAIKey = () => {
  const candidates = ['OPENAI_API_KEY', 'OPENAI_API_KEY_RELAY'] as const;
  for (const name of candidates) {
    const value = Deno.env.get(name)?.trim();
    if (value) return { name, value } as const;
  }
  return { name: null as string | null, value: undefined as string | undefined } as const;
};

// Session configuration types and helpers
interface SessionConfig {
  modalities?: string[];
  instructions?: string;
  voice?: string;
  input_audio_format?: string;
  output_audio_format?: string;
  turn_detection?: {
    type: string;
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  input_audio_transcription?: {
    model: string;
  };
  temperature?: number;
  max_response_output_tokens?: number | string;
  [key: string]: any;
}

// Merge client session config with required technical defaults
function mergeSessionConfig(clientConfig?: SessionConfig): SessionConfig {
  // Required technical defaults
  const defaults: SessionConfig = {
    modalities: ['text', 'audio'], // Need audio modality for transcription to work
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 1000
    },
    input_audio_transcription: {
      model: 'whisper-1'
    }
  };

  // If no client config, return defaults
  if (!clientConfig) {
    console.log('[S2S] No client session config - using defaults');
    return defaults;
  }

  // Merge: client config takes precedence, but required technical params are enforced
  const merged: SessionConfig = {
    ...clientConfig,
    // ALWAYS enforce these technical parameters
    modalities: ['text', 'audio'], // Need audio modality for transcription to work
    input_audio_format: clientConfig.input_audio_format || 'pcm16',
    output_audio_format: clientConfig.output_audio_format || 'pcm16',
    // Merge turn_detection (keep client settings if provided)
    turn_detection: clientConfig.turn_detection ? {
      ...defaults.turn_detection,
      ...clientConfig.turn_detection
    } : defaults.turn_detection,
    // Keep transcription
    input_audio_transcription: clientConfig.input_audio_transcription || defaults.input_audio_transcription
  };

  console.log('[S2S] Merged client session config with technical defaults');
  return merged;
}

// Extract client's session config from buffered messages
function extractClientSessionConfig(pendingMessages: string[]): SessionConfig | null {
  for (const msg of pendingMessages) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'session.update' && parsed.session) {
        console.log('[S2S] Found client session.update in buffer');
        return parsed.session as SessionConfig;
      }
    } catch {
      // Not JSON or parse error - skip
    }
  }
  return null;
}

// Audio buffer commit gating helpers
interface AudioGatingState {
  accumulatedAudioBytes: number;
  currentSampleRate: number;
  currentAudioThreshold: number;
  deferredCommits: Array<{ timestamp: number; message: string }>;
  maxDeferredCommits: number;
  staleCommitTimeoutMs: number;
}

interface ParsedClientEvent {
  type: string;
  audioBytes?: number;
  shouldForward: boolean;
  originalMessage: string;
}

// Calculate audio threshold based on sample rate and format
function calculateAudioThreshold(sampleRate: number = 16000): number {
  // For PCM16: 2 bytes per sample, 1 channel
  // 100ms = sampleRate * 0.1 * 2 bytes
  const msRequired = 100;
  const bytesPerSample = 2; // PCM16
  const channels = 1;
  return Math.floor(sampleRate * (msRequired / 1000) * bytesPerSample * channels);
}

// Parse client event and extract audio data if present
function parseClientEvent(message: string): ParsedClientEvent {
  try {
    const event = JSON.parse(message);
    const result: ParsedClientEvent = {
      type: event.type || 'unknown',
      shouldForward: true,
      originalMessage: message
    };

    if (event.type === 'input_audio_buffer.append' && event.audio) {
      try {
        // Decode base64 audio to count actual bytes
        const audioData = atob(event.audio);
        result.audioBytes = audioData.length;
        console.log(`[S2S] Audio append parsed: ${result.audioBytes} bytes`);
      } catch (decodeError) {
        console.warn('[S2S] Failed to decode audio data for byte counting:', decodeError);
        result.audioBytes = 0;
      }
    }

    return result;
  } catch (parseError) {
    console.warn('[S2S] Failed to parse client message:', parseError);
    return {
      type: 'unknown',
      shouldForward: true,
      originalMessage: message
    };
  }
}

// Update audio state and decide whether commit can proceed
function updateAudioStateAndDecideCommit(
  parsedEvent: ParsedClientEvent,
  audioState: AudioGatingState
): { shouldForward: boolean; shouldDefer: boolean; logMessage?: string } {
  
  // Check if audio gating is disabled
  const disableGating = Deno.env.get('DISABLE_AUDIO_GATING') === 'true';
  if (disableGating) {
    return { shouldForward: true, shouldDefer: false, logMessage: 'Audio gating disabled' };
  }

  if (parsedEvent.type === 'input_audio_buffer.append') {
    if (parsedEvent.audioBytes !== undefined) {
      audioState.accumulatedAudioBytes += parsedEvent.audioBytes;
      console.log(`[S2S] Audio accumulated: ${audioState.accumulatedAudioBytes}/${audioState.currentAudioThreshold} bytes (${(audioState.accumulatedAudioBytes / audioState.currentAudioThreshold * 100).toFixed(1)}%)`);
    }
    return { shouldForward: true, shouldDefer: false };
  }

  if (parsedEvent.type === 'input_audio_buffer.commit') {
    if (audioState.accumulatedAudioBytes >= audioState.currentAudioThreshold) {
      // Sufficient audio - allow commit and reset counter
      audioState.accumulatedAudioBytes -= audioState.currentAudioThreshold;
      if (audioState.accumulatedAudioBytes < 0) {
        audioState.accumulatedAudioBytes = 0;
      }
      console.log(`[S2S] Commit approved: sufficient audio buffer (threshold: ${audioState.currentAudioThreshold} bytes)`);
      return { shouldForward: true, shouldDefer: false };
    } else {
      // Insufficient audio - defer commit
      const logMessage = `Commit deferred: only ${audioState.accumulatedAudioBytes}/${audioState.currentAudioThreshold} bytes available`;
      console.log(`[S2S] ${logMessage}`);
      return { shouldForward: false, shouldDefer: true, logMessage };
    }
  }

  // For other events (including session.update), forward normally
  return { shouldForward: true, shouldDefer: false };
}

// Drain deferred commits that now have sufficient audio
function drainDeferredCommits(audioState: AudioGatingState): string[] {
  const now = Date.now();
  const readyCommits: string[] = [];
  const remainingCommits: Array<{ timestamp: number; message: string }> = [];

  for (const deferredCommit of audioState.deferredCommits) {
    const age = now - deferredCommit.timestamp;
    
    // Check if commit is stale
    if (age > audioState.staleCommitTimeoutMs) {
      console.warn(`[S2S] Dropping stale commit (age: ${age}ms > ${audioState.staleCommitTimeoutMs}ms)`);
      continue;
    }

    // Check if we now have sufficient audio for this specific commit
    if (audioState.accumulatedAudioBytes >= audioState.currentAudioThreshold) {
      readyCommits.push(deferredCommit.message);
      // Subtract threshold per commit to ensure each commit has its own audio chunk
      audioState.accumulatedAudioBytes -= audioState.currentAudioThreshold;
      console.log(`[S2S] Releasing deferred commit after ${age}ms wait, remaining audio: ${audioState.accumulatedAudioBytes} bytes`);
    } else {
      remainingCommits.push(deferredCommit);
    }
  }

  audioState.deferredCommits = remainingCommits;
  return readyCommits;
}

async function flushPendingMessages(
  sendFn: (message: string) => Promise<void>,
  pendingMessages: string[],
  audioState: AudioGatingState,
  logContext: string
): Promise<void> {
  if (!pendingMessages.length) return;

  const messagesToSend: string[] = [];

  while (pendingMessages.length > 0) {
    const message = pendingMessages.shift()!;
    const parsedEvent = parseClientEvent(message);
    const decision = updateAudioStateAndDecideCommit(parsedEvent, audioState);

    if (decision.shouldDefer) {
      if (audioState.deferredCommits.length >= audioState.maxDeferredCommits) {
        console.warn(`[S2S] Dropping commit during ${logContext} flush: queue full (${audioState.maxDeferredCommits} max)`);
        continue;
      }
      audioState.deferredCommits.push({
        timestamp: Date.now(),
        message
      });
      console.log(`[S2S] Deferred commit during ${logContext} flush (${audioState.deferredCommits.length}/${audioState.maxDeferredCommits})`);
      continue;
    }

    if (decision.shouldForward) {
      messagesToSend.push(message);
      if (parsedEvent.type === 'input_audio_buffer.append') {
        const readyCommits = drainDeferredCommits(audioState);
        if (readyCommits.length) {
          messagesToSend.push(...readyCommits);
        }
      }
    }
  }

  for (const msg of messagesToSend) {
    try {
      await sendFn(msg);
    } catch (err) {
      console.error(`[S2S] Flush send error (${logContext}):`, err);
      pendingMessages.unshift(msg);
      break;
    }
  }
}

// Boot diagnostics: check secret presence without exposing it
try {
  const envKeys = Object.keys((Deno.env as any).toObject?.() || {});
  const primary = Deno.env.get('OPENAI_API_KEY') || '';
  const relay = Deno.env.get('OPENAI_API_KEY_RELAY') || '';
  const keyName = primary ? 'OPENAI_API_KEY' : (relay ? 'OPENAI_API_KEY_RELAY' : null);
  const selected = primary || relay;
  if (selected && keyName) {
    console.log(`[S2S] Boot - Using key: ${keyName}, present: true, length: ${selected.length}`);
  } else {
    console.error('[S2S] Boot - No valid OpenAI API key found. Fallback failed.');
  }
  console.log('[S2S] Boot - env keys count:', envKeys.length);
} catch (_) {
  console.log('[S2S] Boot - env introspection not available');
}

// Helper utilities for header-based WebSocket handshake and frame relay
// Generates a base64 Sec-WebSocket-Key
function generateWSKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // @ts-ignore - btoa exists in edge runtime
  return btoa(String.fromCharCode(...bytes));
}

// Universal WebSocket frame encoder (RFC6455 compliant)
function encodeFrame(payload: Uint8Array, opcode: number, mask: boolean, fin = true): Uint8Array {
  const payloadLen = payload.length;
  
  // Control frames must be ≤125 bytes and not fragmented
  if ((opcode === 0x8 || opcode === 0x9 || opcode === 0xA) && (payloadLen > 125 || !fin)) {
    throw new Error(`Control frame opcode ${opcode} must be ≤125 bytes and FIN=1`);
  }
  
  // Calculate header length
  let headerLen = 2; // base header
  if (mask) headerLen += 4; // mask key
  let extendedLenBytes = 0;
  if (payloadLen >= 126 && payloadLen <= 0xffff) extendedLenBytes = 2;
  else if (payloadLen > 0xffff) extendedLenBytes = 8;
  headerLen += extendedLenBytes;

  const out = new Uint8Array(headerLen + payloadLen);
  let i = 0;

  // Byte 0: FIN + RSV + opcode
  out[i++] = (fin ? 0x80 : 0) | (opcode & 0x0f);

  // Byte 1: MASK + length
  let maskBit = mask ? 0x80 : 0;
  if (payloadLen < 126) {
    out[i++] = maskBit | payloadLen;
  } else if (payloadLen <= 0xffff) {
    out[i++] = maskBit | 126;
    out[i++] = (payloadLen >> 8) & 0xff;
    out[i++] = payloadLen & 0xff;
  } else {
    out[i++] = maskBit | 127;
    // 64-bit length (big-endian)
    const high = Math.floor(payloadLen / 2 ** 32);
    const low = payloadLen >>> 0;
    out[i++] = (high >>> 24) & 0xff;
    out[i++] = (high >>> 16) & 0xff;
    out[i++] = (high >>> 8) & 0xff;
    out[i++] = high & 0xff;
    out[i++] = (low >>> 24) & 0xff;
    out[i++] = (low >>> 16) & 0xff;
    out[i++] = (low >>> 8) & 0xff;
    out[i++] = low & 0xff;
  }

  // Mask key (if masked)
  let maskKey: Uint8Array | null = null;
  if (mask) {
    maskKey = new Uint8Array(4);
    crypto.getRandomValues(maskKey);
    out.set(maskKey, i);
    i += 4;
  }

  // Payload (masked if required)
  if (mask && maskKey) {
    for (let j = 0; j < payloadLen; j++) {
      out[i + j] = payload[j] ^ maskKey[j % 4];
    }
  } else {
    out.set(payload, i);
  }

  console.log(`[S2S] -> opcode=${opcode} fin=${fin} masked=${mask} len=${payloadLen}`);
  if (opcode === 0x1 && payload.length > 0) {
    // Log preview of text frames (first 120 chars, sanitized)
    const preview = new TextDecoder().decode(payload.subarray(0, Math.min(120, payload.length)))
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '�');
    console.log(`[S2S] -> text preview: "${preview}${payload.length > 120 ? '...' : ''}"`);
  }

  return out;
}

// Enhanced text frame encoder using the universal encoder
function encodeTextFrameMasked(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const payload = encoder.encode(text);
  return encodeFrame(payload, 0x1, true, true);
}

// Enhanced frame decoder with fragmentation support and comprehensive opcode handling
interface FrameResult {
  opcode: number;
  fin: boolean;
  payload: Uint8Array;
  consumed: number;
}

interface ParsedFrame {
  type: 'text' | 'binary' | 'ping' | 'pong' | 'close' | 'continuation';
  data?: string;
  binaryData?: Uint8Array;
  code?: number;
  reason?: string;
  consumed: number;
}

interface FragmentState {
  buffer: Uint8Array;
  opcode: number | null;
}

function decodeFrames(buffer: Uint8Array, state: FragmentState): ParsedFrame[] {
  const results: ParsedFrame[] = [];
  let offset = 0;
  const decoder = new TextDecoder();

  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const fin = (b0 & 0x80) !== 0;
    const rsv = (b0 >>> 4) & 0x07;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = offset + 2;

    // Parse extended length
    if (len === 126) {
      if (buffer.length - pos < 2) break;
      len = (buffer[pos] << 8) | buffer[pos + 1];
      pos += 2;
    } else if (len === 127) {
      if (buffer.length - pos < 8) break;
      // Big-endian 64-bit length
      const high = (buffer[pos] * 2 ** 24) + (buffer[pos + 1] << 16) + (buffer[pos + 2] << 8) + buffer[pos + 3];
      const low = (buffer[pos + 4] * 2 ** 24) + (buffer[pos + 5] << 16) + (buffer[pos + 6] << 8) + buffer[pos + 7];
      pos += 8;
      len = high * 2 ** 32 + low; // Note: may lose precision for very large frames
    }

    // Server frames should not be masked
    if (masked) {
      console.warn('[S2S] <- Server sent masked frame (unexpected)');
      break;
    }

    if (buffer.length - pos < len) break; // incomplete frame

    const payload = buffer.subarray(pos, pos + len);
    const consumed = pos + len - offset;

    console.log(`[S2S] <- opcode=${opcode} fin=${fin} len=${len}`);

    // Handle fragmentation
    if (opcode === 0x0) { // continuation frame
      if (state.opcode === null) {
        console.warn('[S2S] <- Received continuation frame without initial frame');
        offset += consumed;
        continue;
      }

      // Append to fragment buffer
      const newBuffer = new Uint8Array(state.buffer.length + payload.length);
      newBuffer.set(state.buffer, 0);
      newBuffer.set(payload, state.buffer.length);
      state.buffer = newBuffer;

      console.log('[S2S] <- fragment continue');

      if (fin) {
        // Fragmentation complete
        console.log('[S2S] <- fragment end');
        const finalPayload = state.buffer;
        const finalOpcode = state.opcode;

        // Reset fragment state
        state.buffer = new Uint8Array(0);
        state.opcode = null;

        // Process the assembled frame
        if (finalOpcode === 0x1) { // text
          results.push({ type: 'text', data: decoder.decode(finalPayload), consumed });
        } else if (finalOpcode === 0x2) { // binary
          results.push({ type: 'binary', binaryData: finalPayload, consumed });
        }
      } else {
        results.push({ type: 'continuation', consumed });
      }
    } else if (!fin && (opcode === 0x1 || opcode === 0x2)) {
      // Start of fragmented message
      console.log('[S2S] <- fragment start');
      state.opcode = opcode;
      state.buffer = new Uint8Array(payload);
      results.push({ type: 'continuation', consumed });
    } else {
      // Complete frame
      if (opcode === 0x1) { // text
        const text = decoder.decode(payload);
        results.push({ type: 'text', data: text, consumed });
      } else if (opcode === 0x2) { // binary
        results.push({ type: 'binary', binaryData: payload, consumed });
      } else if (opcode === 0x9) { // ping
        console.log(`[S2S] <- OpenAI: ping len=${len}`);
        results.push({ type: 'ping', binaryData: payload, consumed });
      } else if (opcode === 0xA) { // pong
        console.log(`[S2S] <- OpenAI: pong len=${len}`);
        results.push({ type: 'pong', binaryData: payload, consumed });
      } else if (opcode === 0x8) { // close
        let code: number | undefined;
        let reason = '';
        if (len >= 2) {
          code = (payload[0] << 8) | payload[1];
          if (len > 2) {
            reason = decoder.decode(payload.subarray(2));
          }
        }
        console.log(`[S2S] <- OpenAI: close (code: ${code}, reason: "${reason}")`);
        results.push({ type: 'close', code, reason, consumed });
      } else {
        // Unknown opcode - log and skip
        console.warn(`[S2S] <- Unknown opcode ${opcode}, skipping frame`);
        results.push({ type: 'continuation', consumed });
      }
    }

    offset += consumed;
  }

  return results;
}

async function connectOpenAIWithHeaders(ephemeralKey: string) {
  const hostname = 'api.openai.com';
  const port = 443;
  const conn = await Deno.connectTls({ hostname, port });
  const key = generateWSKey();
  const path = `/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
  const headers = [
    `GET ${path} HTTP/1.1`,
    `Host: ${hostname}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    `Authorization: Bearer ${ephemeralKey}`,
    'OpenAI-Beta: realtime=v1',
    // Provide an Origin; some gateways check it
    'Origin: https://uomdyqdvorusucuudwnz.functions.supabase.co',
    '',
    ''
  ].join('\r\n');

  const enc = new TextEncoder();
  await conn.write(enc.encode(headers));

  // Read HTTP response header
  const buf = new Uint8Array(8192);
  let total = 0;
  while (true) {
    const n = await conn.read(buf.subarray(total));
    if (n === null) throw new Error('Upstream closed during handshake');
    total += n;
    const str = new TextDecoder().decode(buf.subarray(0, total));
    const idx = str.indexOf('\r\n\r\n');
    if (idx !== -1) {
      const statusLine = str.split('\r\n', 1)[0] || '';
      console.log('[S2S] Upstream handshake status:', statusLine);
      if (!statusLine.includes('101')) {
        throw new Error('Handshake failed: ' + statusLine);
      }
      break;
    }
    if (total >= buf.length) throw new Error('Handshake header too large');
  }

  // Return minimal interface for sending text and reading frames
  const readerBuffer = new Uint8Array(0);
  let readBuf = readerBuffer;

  const sendText = async (text: string) => {
    const frame = encodeTextFrameMasked(text);
    await conn.write(frame);
  };

  // Send a masked WebSocket PING frame (RFC6455, opcode 0x9) with small payload
  const sendPing = async () => {
    const pingPayload = new TextEncoder().encode("PING"); // 4 bytes
    const frame = encodeFrame(pingPayload, 0x9, true, true);
    await conn.write(frame);
  };

  const sendPong = async (pingPayload?: Uint8Array) => {
    // Send PONG with same payload as received PING (RFC6455 requirement)
    const payload = pingPayload || new Uint8Array(0);
    const frame = encodeFrame(payload, 0xA, true, true);
    await conn.write(frame);
  };

  const close = async (code = 1000, reason = 'Closing') => {
    const encoder = new TextEncoder();
    
    // Character-level truncation to avoid splitting UTF-8 sequences
    let truncatedReason = reason;
    let reasonBytes = encoder.encode(truncatedReason);
    if (reasonBytes.length > 123) {
      console.warn('[S2S] Close reason truncated to fit 123 byte limit');
      // Truncate at character boundaries to preserve UTF-8 validity
      for (let i = reason.length - 1; i >= 0; i--) {
        truncatedReason = reason.substring(0, i);
        reasonBytes = encoder.encode(truncatedReason);
        if (reasonBytes.length <= 123) break;
      }
    }
    const payload = new Uint8Array(2 + reasonBytes.length);
    payload[0] = (code >> 8) & 0xff;
    payload[1] = code & 0xff;
    payload.set(reasonBytes, 2);
    const frame = encodeFrame(payload, 0x8, true, true);
    try { await conn.write(frame); } catch {}
    try { conn.close(); } catch {}
  };

  // Centralized shutdown helper for RFC6455-compliant close handling
  const shutdownConnection = async (code = 1000, reason = 'Closing') => {
    try {
      // Send proper close frame upstream first
      await close(code, reason);
    } catch (e) {
      console.warn('[S2S] Failed to send upstream close frame:', e);
    }
  };

  async function readLoop(onText: (s: string) => void, onClose: (code: number, reason: string) => void) {
    let buffer = new Uint8Array(0);
    const fragmentState: FragmentState = { buffer: new Uint8Array(0), opcode: null };
    try {
      while (true) {
        const chunk = new Uint8Array(4096);
        const n = await conn.read(chunk);
        if (n === null) {
          console.log('[S2S] Upstream EOF - closing cleanly');
          onClose(1000, 'Upstream EOF');
          break;
        }
        const incoming = chunk.subarray(0, n);
        const merged = new Uint8Array(buffer.length + incoming.length);
        merged.set(buffer, 0);
        merged.set(incoming, buffer.length);
        buffer = merged;

        const frames = decodeFrames(buffer, fragmentState);
        let consumedTotal = 0;
        for (const f of frames) {
          consumedTotal += f.consumed;
          if (f.type === 'text' && f.data) {
            onText(f.data);
          } else if (f.type === 'binary' && f.binaryData) {
            // Forward binary data to client (audio, etc.)
            // Note: This would need client-side binary handling
            console.log(`[S2S] <- OpenAI: binary frame len=${f.binaryData.length}`);
          } else if (f.type === 'ping') {
            try { 
              await sendPong(f.binaryData); 
              console.log(`[S2S] -> OpenAI: pong len=${f.binaryData?.length || 0}`);
            } catch (e) { 
              console.error('[S2S] Upstream pong failed:', e); 
            }
          } else if (f.type === 'pong') {
            // Received pong response to our ping
            console.log(`[S2S] <- OpenAI: pong acknowledged len=${f.binaryData?.length || 0}`);
          } else if (f.type === 'close') {
            console.log(`[S2S] <- OpenAI: close frame received (code: ${f.code}, reason: "${f.reason}")`);
            onClose(f.code ?? 1000, f.reason ?? '');
            return;
          } else if (f.type === 'continuation') {
            // Fragmentation in progress, no action needed
          }
        }
        if (consumedTotal > 0) {
          buffer = buffer.subarray(consumedTotal);
        }
      }
    } catch (err: any) {
      // Harden EINTR detection - check for multiple error indicators
      const isEINTR = err?.code === 'EINTR' || 
                      err?.name === 'Interrupted' ||
                      String(err?.message || err).includes('Interrupted: operation canceled') ||
                      String(err?.message || err).includes('EINTR');
      
      if (isEINTR) {
        console.log('[S2S] TLS read interrupted (EINTR) -> treating as clean close');
        onClose(1000, 'Connection interrupted');
      } else {
        console.error('[S2S] Upstream read error:', err);
        onClose(1011, 'Read error');
      }
    }
  }

  return { sendText, sendPing, readLoop, close, shutdownConnection } as const;

  
}

Deno.serve(async (req) => {
  // Allow basic health probes and CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  // Query flags for quick experiments and mode selection
  const reqUrl = new URL(req.url);
  const connectionMode = reqUrl.searchParams.get('mode') || 'headers'; // default to header-based handshake
  const flipProto = reqUrl.searchParams.get('flip_proto') === '1';
  const useHeaderHandshake = connectionMode !== 'ws';
  // Keep-alive config: disable with ka=0, interval via ka_ms (default 20000ms)
  const kaDisable = reqUrl.searchParams.get('ka') === '0';
  const kaMsParam = reqUrl.searchParams.get('ka_ms');
  let keepAliveMs = 20000;
  if (kaMsParam) {
    const v = parseInt(kaMsParam, 10);
    if (!Number.isNaN(v) && v >= 0) keepAliveMs = v;
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  let headerConn: { sendText: (s: string) => Promise<void>; sendPing: () => Promise<void>; readLoop: (onText: (s: string) => void, onClose: (code: number, reason: string) => void) => Promise<void>; close: (code?: number, reason?: string) => Promise<void>; shutdownConnection: (code?: number, reason?: string) => Promise<void> } | null = null;
  const pendingClientMessages: Array<string> = [];
  let upstreamReady = false;
  let sentSessionUpdate = false;
  let sessionInitialized = false;
  let keepAliveTimer: number | undefined;

  // Audio buffer commit gating state
  const audioGatingState: AudioGatingState = {
    accumulatedAudioBytes: 0,
    currentSampleRate: 16000, // Default fallback
    currentAudioThreshold: calculateAudioThreshold(16000),
    deferredCommits: [],
    maxDeferredCommits: 3,
    staleCommitTimeoutMs: 30000 // 30 seconds
  };

  // Allowlist for client-originated events. Block server-only events like session.created.
  const isAllowedClientEvent = (evt: any): boolean => {
    try {
      if (!evt || typeof evt !== 'object') return false;
      const t = (evt as any).type;
      if (typeof t !== 'string') return false;

      // Explicitly disallowed (server-emitted) events
      const disallowed = new Set([
        'session.created',
        'response.created',
        'response.delta',
        'response.done',
        'response.audio.delta',
        'response.audio.done',
        'response.audio_transcript.delta',
        'response.audio_transcript.done',
        'response.function_call_arguments.delta',
        'response.function_call_arguments.done',
        'rate_limits.updated',
        'conversation.updated',
      ]);
      if (disallowed.has(t)) return false;

      // Allowed client -> server events
      const allowed = new Set([
        'input_audio_buffer.append',
        'input_audio_buffer.commit',
        'response.create',
        'response.cancel',
        'conversation.item.create',
        'session.update',
      ]);
      return allowed.has(t);
    } catch (_) {
      return false;
    }
  };

  socket.onopen = async () => {
    console.log('[S2S] Client WebSocket connected');

    try {
      sessionInitialized = false;
      sentSessionUpdate = false;
      audioGatingState.accumulatedAudioBytes = 0;
      audioGatingState.deferredCommits = [];
      audioGatingState.currentSampleRate = 16000;
      audioGatingState.currentAudioThreshold = calculateAudioThreshold(16000);

      // Read API key and verify presence (without exposing it in logs)
      const { name: keyName, value: OPENAI_API_KEY } = getOpenAIKey();
      if (!OPENAI_API_KEY) {
        console.error('[S2S] No OpenAI API key configured');
        try { socket.send(JSON.stringify({ type: 'error', error: 'Missing OpenAI API key on server' })); } catch { }
        socket.close(1011, 'Missing OpenAI API key');
        return;
      }
      console.log(`[S2S] Using key: ${keyName}, present: true, length: ${OPENAI_API_KEY.length}`);

      // 1) Create ephemeral session token – validates the key before attempting WS
      console.log('[S2S] Requesting ephemeral session token...');
      const sessionResp = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_REALTIME_MODEL,
          voice: 'alloy',
          instructions: 'You are a helpful speech-to-speech practice assistant.',
        }),
      });

      if (!sessionResp.ok) {
        const errText = await sessionResp.text();
        console.error('[S2S] Ephemeral token request failed:', errText);
        try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to create OpenAI session' })); } catch { }
        socket.close(1011, 'Ephemeral session request failed');
        return;
      }

      const sessionData = await sessionResp.json();
      const EPHEMERAL_KEY: string | undefined = sessionData?.client_secret?.value;
      if (!EPHEMERAL_KEY) {
        console.error('[S2S] Ephemeral token missing in response');
        try { socket.send(JSON.stringify({ type: 'error', error: 'Invalid OpenAI session response' })); } catch { }
        socket.close(1011, 'Invalid session data');
        return;
      }
      console.log('[S2S] Ephemeral token acquired');

      // 2) Connect upstream WS to OpenAI Realtime API using ephemeral token
      // 2) Connect upstream to OpenAI Realtime API
      if (useHeaderHandshake) {
        // Header-based handshake path (default). Avoids subprotocol forwarding issues.
        console.log('[S2S] Connecting to OpenAI Realtime API via header-based handshake...');
        try {
          headerConn = await connectOpenAIWithHeaders(EPHEMERAL_KEY);
          console.log('[S2S] Upstream TLS+Upgrade established (headers mode)');

          // Start reading frames and forward to client
          headerConn.readLoop(
            async (text: string) => {
              // Parse and filter before forwarding
              try {
                const data = JSON.parse(text);
                const eventType = data?.type;
                
                if (eventType) {
                  console.log('[S2S] <- OpenAI:', eventType);
                  
                  // Block OpenAI audio response events (we only want user transcription)
                  const blockedEvents = [
                    'response.audio.delta',           // Block AI audio chunks
                    'response.audio.done',            // Block AI audio completion
                    'response.audio_transcript.delta', // Block AI transcript
                    'response.audio_transcript.done'   // Block AI transcript completion
                  ];
                  
                  if (blockedEvents.includes(eventType)) {
                    console.log('[S2S] <- Blocked OpenAI audio response:', eventType);
                    return; // Don't forward to client
                  }
                  
                  // Log user transcription events (these are allowed through)
                  if (eventType === 'conversation.item.input_audio_transcription.completed') {
                    console.log('[S2S] ✅ User transcription successful:', data.transcript);
                  }
                  
                  if (eventType === 'conversation.item.input_audio_transcription.failed') {
                    console.log('[S2S] ❌ User transcription failed:', data.error);
                  }
                  
                  if (eventType === 'error') {
                    console.error('[S2S] <- OpenAI error payload:', data);
                  }
                }
                
                // Forward to client (only if not blocked above)
                if (socket.readyState === WebSocket.OPEN) {
                  try { socket.send(text); } catch {}
                }
              } catch {
                // Not JSON - forward as-is
                if (socket.readyState === WebSocket.OPEN) {
                  try { socket.send(text); } catch {}
                }
                return;
              }

              // Log event type if JSON (for session init logic below)
              try {
                const data = JSON.parse(text);
                if (data?.type) {

                  if (data.type === 'session.created' && !sentSessionUpdate) {
                    sentSessionUpdate = true;
                    
                    // Extract client's session config from buffered messages
                    const clientConfig = extractClientSessionConfig(pendingClientMessages);
                    
                    // Merge with required technical defaults
                    const finalConfig = mergeSessionConfig(clientConfig);
                    
                    // Send merged configuration
                    const updateEvent = {
                      type: 'session.update',
                      session: finalConfig
                    };
                    
                    try {
                      await headerConn!.sendText(JSON.stringify(updateEvent));
                      console.log('[S2S] -> OpenAI: session.update sent (merged config)');
                      
                      // Remove client's session.update from buffer (if it exists) to avoid duplicate
                      const sessionUpdateIndex = pendingClientMessages.findIndex(msg => {
                        try {
                          const parsed = JSON.parse(msg);
                          return parsed.type === 'session.update';
                        } catch {
                          return false;
                        }
                      });
                      
                      if (sessionUpdateIndex !== -1) {
                        pendingClientMessages.splice(sessionUpdateIndex, 1);
                        console.log('[S2S] Removed client session.update from buffer (already merged)');
                      }
                    } catch (e) {
                      console.error('[S2S] Failed to send session.update:', e);
                    }
                    
                    console.log('[S2S] Waiting for session.updated before flushing remaining messages');
                  }

                  if (data.type === 'session.updated' && !sessionInitialized) {
                    sessionInitialized = true;
                    console.log('[S2S] OpenAI session initialized (headers mode)');
                    if (pendingClientMessages.length) {
                      console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
                      await flushPendingMessages(
                        async (msg) => { await headerConn!.sendText(msg); },
                        pendingClientMessages,
                        audioGatingState,
                        'headers'
                      );
                    }
                  }
                }
              } catch { /* not JSON */ }
            },
            async (code: number, reason: string) => {
              console.log('[S2S] OpenAI (headers mode) closed:', code, reason);
              if (keepAliveTimer) { try { clearInterval(keepAliveTimer as any); } catch {} keepAliveTimer = undefined; }
              
              // Centralized shutdown: send proper close frame to client
              if (socket.readyState === WebSocket.OPEN) {
                try {
                  // Send RFC6455-compliant close with same code
                  socket.close(code === 1011 ? 1000 : code, reason || 'Upstream closed');
                } catch (e) {
                  console.warn('[S2S] Failed to close client socket properly:', e);
                }
              }
            }
          );

          // Enable true WebSocket keep-alive pings if configured
          if (!kaDisable && keepAliveMs > 0) {
            try {
              keepAliveTimer = setInterval(async () => {
                try {
                  await headerConn!.sendPing();
                  console.log(`[S2S] -> OpenAI: ping (KA) len=4`);
                } catch (e) {
                  console.error('[S2S] Upstream ping failed:', e);
                }
              }, keepAliveMs) as unknown as number;
              console.log(`[S2S] Keep-alive enabled: every ${keepAliveMs}ms`);
            } catch (e) {
              console.error('[S2S] Failed to start keep-alive:', e);
            }
          }

          upstreamReady = true;
        } catch (err) {
          console.error('[S2S] Error creating header-based upstream connection:', err);
          try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream (headers mode)' })); } catch { }
          // Use 1000 for initialization failures to avoid RFC6455 violations
          socket.close(1000, 'OpenAI upstream init failed');
          return;
        }
      } else {
        console.log('[S2S] Connecting to OpenAI Realtime API via WebSocket (subprotocols)...');
        try {
          const upstreamUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
          const baseProtocols: string[] = [
            `openai-insecure-api-key.${EPHEMERAL_KEY}`,
            'openai-beta.realtime-v1',
          ];
          const protocols = flipProto ? [...baseProtocols].reverse() : baseProtocols;
          console.log('[S2S] Protocols check:', protocols.map(p => `"${p}"`).join(', '));

          openAISocket = new WebSocket(upstreamUrl, protocols);

          openAISocket.onopen = () => {
            upstreamReady = true;
            console.log('[S2S] Connected to OpenAI Realtime API');
            console.log('[S2S] Upstream negotiated protocol:', (openAISocket!.protocol || '(none)'));
            // IMPORTANT: send session.update AFTER session.created (handled in onmessage)
          };

          openAISocket.onmessage = async (event: MessageEvent) => {
            try {
              const msg = event.data;
              if (typeof msg === 'string') {
                // Inspect and act on JSON events
                try {
                  const data = JSON.parse(msg);
                  if (data?.type) {
                    console.log('[S2S] <- OpenAI:', data.type);
                    if (data.type === 'error') {
                      console.error('[S2S] <- OpenAI error payload:', data);
                    }
                    if (data.type === 'session.created' && !sentSessionUpdate) {
                      sentSessionUpdate = true;
                      
                      // Extract client's session config from buffered messages
                      const clientConfig = extractClientSessionConfig(pendingClientMessages);
                      
                      // Merge with required technical defaults
                      const finalConfig = mergeSessionConfig(clientConfig);
                      
                      // Send merged configuration
                      const updateEvent = {
                        type: 'session.update',
                        session: finalConfig
                      };
                      
                      try {
                        openAISocket!.send(JSON.stringify(updateEvent));
                        console.log('[S2S] -> OpenAI: session.update sent (merged config)');
                        
                        // Remove client's session.update from buffer (if it exists) to avoid duplicate
                        const sessionUpdateIndex = pendingClientMessages.findIndex(msg => {
                          try {
                            const parsed = JSON.parse(msg);
                            return parsed.type === 'session.update';
                          } catch {
                            return false;
                          }
                        });
                        
                        if (sessionUpdateIndex !== -1) {
                          pendingClientMessages.splice(sessionUpdateIndex, 1);
                          console.log('[S2S] Removed client session.update from buffer (already merged)');
                        }
                      } catch (e) {
                        console.error('[S2S] Failed to send session.update:', e);
                      }
                      
                      console.log('[S2S] Waiting for session.updated before flushing remaining messages');
                    }
                    if (data.type === 'session.updated' && !sessionInitialized) {
                      sessionInitialized = true;
                      console.log('[S2S] OpenAI session initialized (WS mode)');
                      if (pendingClientMessages.length) {
                        console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
                        await flushPendingMessages(
                          async (message) => {
                            if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
                              openAISocket.send(message);
                            } else {
                              throw new Error('Upstream WebSocket not open');
                            }
                          },
                          pendingClientMessages,
                          audioGatingState,
                          'websocket'
                        );
                      }
                    }
                  }
                } catch { /* not JSON */ }

                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(msg);
                }
              } else if (msg instanceof ArrayBuffer) {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(msg);
                }
              } else if (msg instanceof Uint8Array) {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(msg);
                }
              } else if (msg instanceof Blob) {
                try {
                  const buf = await msg.arrayBuffer();
                  if (socket.readyState === WebSocket.OPEN) {
                    socket.send(buf);
                  }
                } catch (e) {
                  console.error('[S2S] Error handling Blob message from OpenAI:', e);
                }
              }
            } catch (err) {
              console.error('[S2S] Error processing OpenAI message:', err);
            }
          };

          openAISocket.onclose = (event: CloseEvent) => {
            console.log('[S2S] OpenAI WebSocket closed:', event.code, event.reason);
            if (socket.readyState === WebSocket.OPEN) {
              // Use the same close code from upstream, or default to 1000
              const closeCode = event.code === 1011 ? 1000 : (event.code || 1000);
              socket.close(closeCode, event.reason || 'Upstream closed');
            }
          };

          openAISocket.onerror = (error: Event | any) => {
            console.error('[S2S] OpenAI WebSocket error:', error);
            if (socket.readyState === WebSocket.OPEN) {
              // Use 1000 for errors to avoid RFC6455 violations
              socket.close(1000, 'Upstream error');
            }
          };
        } catch (err) {
          console.error('[S2S] Error creating OpenAI WebSocket:', err);
          try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream WebSocket' })); } catch { }
          // Use 1000 for initialization failures
          socket.close(1000, 'OpenAI WS init failed');
          return;
        }
      }
    } catch (fatalErr) {
      console.error('[S2S] onopen fatal error:', fatalErr);
      try { socket.send(JSON.stringify({ type: 'error', error: 'Initialization error' })); } catch { }
      // Use 1000 for initialization errors
      socket.close(1000, 'Initialization error');
    }
    };

  // Buffer client messages until upstream is ready
  socket.onmessage = async (event) => {
    try {
      const payload = event.data;

      // If the message is JSON, enforce allowlist for client-originated events
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          if (!isAllowedClientEvent(parsed)) {
            console.warn('[S2S] Blocked disallowed client event:', parsed?.type);
            return;
          }
        } catch (_) { /* not JSON - pass through */ }
      }

      // Only string payloads are supported for upstream (events as JSON)
      if (typeof payload !== 'string') {
        console.warn('[S2S] Dropping non-text client payload in relay');
        return;
      }

      const parsedEvent = parseClientEvent(payload);

      if (!sessionInitialized && parsedEvent.type !== 'session.update') {
        pendingClientMessages.push(payload);
        console.log('[S2S] Buffered client message (session not initialized yet)');
        return;
      }

      // Apply audio buffer commit gating
      const gatingDecision = updateAudioStateAndDecideCommit(parsedEvent, audioGatingState);

      // Handle session.update events to track format changes
      if (parsedEvent.type === 'session.update') {
        try {
          const sessionEvent = JSON.parse(payload);
          
          // Check for audio format changes
          if (sessionEvent?.session?.input_audio_format) {
            const audioFormat = sessionEvent.session.input_audio_format;
            
            // Handle different format structures
            if (typeof audioFormat === 'object' && audioFormat.sample_rate_hz) {
              // New format: { type: 'pcm16', sample_rate_hz: 24000 }
              audioGatingState.currentSampleRate = audioFormat.sample_rate_hz;
              console.log(`[S2S] Audio format detected: ${audioFormat.type} @ ${audioFormat.sample_rate_hz}Hz`);
            } else if (typeof audioFormat === 'string' && audioFormat !== 'pcm16') {
              // Legacy format change detection
              console.log('[S2S] Audio format change detected, resetting audio gating state');
              audioGatingState.accumulatedAudioBytes = 0;
              audioGatingState.deferredCommits = [];
            }
            
            audioGatingState.currentAudioThreshold = calculateAudioThreshold(audioGatingState.currentSampleRate);
            console.log(`[S2S] Updated audio threshold to ${audioGatingState.currentAudioThreshold} bytes (${audioGatingState.currentSampleRate}Hz)`);
          }
          
          // Legacy fallback for direct sample_rate
          if (sessionEvent?.session?.sample_rate) {
            audioGatingState.currentSampleRate = sessionEvent.session.sample_rate;
            audioGatingState.currentAudioThreshold = calculateAudioThreshold(audioGatingState.currentSampleRate);
            console.log(`[S2S] Updated audio threshold to ${audioGatingState.currentAudioThreshold} bytes (${audioGatingState.currentSampleRate}Hz)`);
          }
        } catch (sessionParseErr) {
          console.warn('[S2S] Failed to parse session.update for audio config:', sessionParseErr);
        }
      }

      // Handle deferred commits
      if (gatingDecision.shouldDefer) {
        if (audioGatingState.deferredCommits.length >= audioGatingState.maxDeferredCommits) {
          console.warn(`[S2S] Dropping commit: queue full (${audioGatingState.maxDeferredCommits} max)`);
          return;
        }
        audioGatingState.deferredCommits.push({
          timestamp: Date.now(),
          message: payload
        });
        console.log(`[S2S] Deferred commit queued (${audioGatingState.deferredCommits.length}/${audioGatingState.maxDeferredCommits})`);
        return;
      }

      // Forward the current message first if approved
      if (gatingDecision.shouldForward) {
        if (useHeaderHandshake) {
          if (headerConn) {
            try { await headerConn.sendText(payload); } catch (e) { console.error('[S2S] Upstream send error (headers mode):', e); }
          } else {
            pendingClientMessages.push(payload);
            console.log('[S2S] Buffered client message (upstream not ready yet)');
          }
        } else {
          if (upstreamReady && openAISocket?.readyState === WebSocket.OPEN) {
            openAISocket.send(payload);
          } else {
            pendingClientMessages.push(payload);
            console.log('[S2S] Buffered client message (upstream not ready yet)');
          }
        }
      }

      // After forwarding audio append, check for newly available deferred commits
      if (parsedEvent.type === 'input_audio_buffer.append' && gatingDecision.shouldForward) {
        const readyCommits = drainDeferredCommits(audioGatingState);
        for (const commitMessage of readyCommits) {
          // Forward ready commits after the audio has been sent
          if (useHeaderHandshake) {
            if (headerConn) {
              try { 
                await headerConn.sendText(commitMessage); 
              } catch (e) { 
                console.error('[S2S] Upstream send error for deferred commit (headers mode):', e); 
              }
            } else {
              pendingClientMessages.push(commitMessage);
              console.log('[S2S] Buffered deferred commit (upstream not ready yet)');
            }
          } else {
            if (upstreamReady && openAISocket?.readyState === WebSocket.OPEN) {
              openAISocket.send(commitMessage);
            } else {
              pendingClientMessages.push(commitMessage);
              console.log('[S2S] Buffered deferred commit (upstream not ready yet)');
            }
          }
        }
      }

    } catch (error) {
      console.error('[S2S] Error in message handling:', error);
    }
  };

  socket.onclose = async (event) => {
    console.log('[S2S] Client WebSocket closed:', event.code, event.reason);
    if (keepAliveTimer) { try { clearInterval(keepAliveTimer as any); } catch {} keepAliveTimer = undefined; }
    
    // Centralized shutdown: send proper close frames upstream
    try { 
      if (headerConn) {
        await headerConn.shutdownConnection(1000, 'Client disconnected');
      }
    } catch (e) { 
      console.warn('[S2S] Failed to shutdown header connection:', e); 
    }
    
    try { 
      if (openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.close(1000, 'Client disconnected'); 
      }
    } catch (e) { 
      console.warn('[S2S] Failed to close OpenAI socket:', e); 
    }
  };

  socket.onerror = async (error) => {
    console.error('[S2S] Client WebSocket error:', error);
    if (keepAliveTimer) { try { clearInterval(keepAliveTimer as any); } catch {} keepAliveTimer = undefined; }
    
    // Centralized shutdown on client error
    try { 
      if (headerConn) {
        await headerConn.shutdownConnection(1000, 'Client error');
      }
    } catch (e) { 
      console.warn('[S2S] Failed to shutdown header connection on error:', e); 
    }
    
    try { 
      if (openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.close(1000, 'Client error'); 
      }
    } catch (e) { 
      console.warn('[S2S] Failed to close OpenAI socket on error:', e); 
    }
  };
  return response;
});
