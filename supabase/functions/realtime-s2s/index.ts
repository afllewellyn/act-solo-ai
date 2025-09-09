
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

// Minimal WebSocket frame encoder for client->server text frames (masked as required by RFC6455)
function encodeTextFrameMasked(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const payload = encoder.encode(text);
  const maskKey = new Uint8Array(4);
  crypto.getRandomValues(maskKey);

  const payloadLen = payload.length;
  let headerLen = 2 + 4; // base header + mask
  let extendedLenBytes = 0;
  if (payloadLen >= 126 && payloadLen <= 0xffff) extendedLenBytes = 2;
  else if (payloadLen > 0xffff) extendedLenBytes = 8;
  headerLen += extendedLenBytes;

  const out = new Uint8Array(headerLen + payloadLen);
  let i = 0;
  // FIN=1, opcode=1 (text)
  out[i++] = 0x80 | 0x1;

  // MASK bit set + length/extended
  if (payloadLen < 126) {
    out[i++] = 0x80 | payloadLen;
  } else if (payloadLen <= 0xffff) {
    out[i++] = 0x80 | 126;
    out[i++] = (payloadLen >> 8) & 0xff;
    out[i++] = payloadLen & 0xff;
  } else {
    out[i++] = 0x80 | 127;
    // 64-bit length
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

  // Mask key
  out.set(maskKey, i);
  i += 4;

  // Masked payload
  for (let j = 0; j < payloadLen; j++) {
    out[i + j] = payload[j] ^ maskKey[j % 4];
  }

  return out;
}

// Minimal parser for server->client frames (no mask expected). Handles text, ping, close.
function parseServerFrames(buffer: Uint8Array): Array<{ type: 'text' | 'ping' | 'pong' | 'close'; data?: string; code?: number; reason?: string; consumed: number }> {
  const results: Array<{ type: 'text' | 'ping' | 'pong' | 'close'; data?: string; code?: number; reason?: string; consumed: number }> = [];
  let offset = 0;
  const decoder = new TextDecoder();

  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0; // server frames should be unmasked
    let len = b1 & 0x7f;
    let pos = offset + 2;

    if (len === 126) {
      if (buffer.length - pos < 2) break; // need more
      len = (buffer[pos] << 8) | buffer[pos + 1];
      pos += 2;
    } else if (len === 127) {
      if (buffer.length - pos < 8) break; // need more
      const high = (buffer[pos] * 2 ** 24) + (buffer[pos + 1] << 16) + (buffer[pos + 2] << 8) + buffer[pos + 3];
      const low = (buffer[pos + 4] * 2 ** 24) + (buffer[pos + 5] << 16) + (buffer[pos + 6] << 8) + buffer[pos + 7];
      pos += 8;
      // JS can't handle >2^53 precisely; assume not needed here
      len = high * 2 ** 32 + low;
    }

    if (masked) {
      // server frames should not be masked; if they are, we can't handle safely
      break;
    }

    if (buffer.length - pos < len) break; // incomplete frame

    const payload = buffer.subarray(pos, pos + len);
    const consumed = pos + len - offset;

    if (!fin) {
      // fragmentation not supported in this minimal parser
      // wait for FIN frames by breaking (keep buffer)
      break;
    }

    if (opcode === 0x1) { // text
      results.push({ type: 'text', data: decoder.decode(payload), consumed });
    } else if (opcode === 0x9) { // ping
      results.push({ type: 'ping', consumed });
    } else if (opcode === 0xA) { // pong
      results.push({ type: 'pong', consumed });
    } else if (opcode === 0x8) { // close
      let code: number | undefined;
      let reason = '';
      if (len >= 2) {
        code = (payload[0] << 8) | payload[1];
        if (len > 2) {
          reason = new TextDecoder().decode(payload.subarray(2));
        }
      }
      results.push({ type: 'close', code, reason, consumed });
    } else {
      // ignore other opcodes
      results.push({ type: 'pong', consumed });
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

  const sendPong = async () => {
    const out = new Uint8Array([0x8A, 0x00]); // FIN + pong, no payload
    await conn.write(out);
  };

  const close = async (code = 1000, reason = 'Closing') => {
    const reasonBytes = new TextEncoder().encode(reason);
    const payloadLen = 2 + reasonBytes.length;
    let header: number[] = [0x88]; // FIN + opcode close
    if (payloadLen < 126) header.push(payloadLen);
    else if (payloadLen <= 0xffff) header.push(126, (payloadLen >> 8) & 0xff, payloadLen & 0xff);
    else throw new Error('Close reason too long');
    const frame = new Uint8Array(header.length + payloadLen);
    frame.set(header, 0);
    frame[header.length] = (code >> 8) & 0xff;
    frame[header.length + 1] = code & 0xff;
    frame.set(reasonBytes, header.length + 2);
    try { await conn.write(frame); } catch {}
    try { conn.close(); } catch {}
  };

  async function readLoop(onText: (s: string) => void, onClose: (code: number, reason: string) => void) {
    let buffer = new Uint8Array(0);
    try {
      while (true) {
        const chunk = new Uint8Array(4096);
        const n = await conn.read(chunk);
        if (n === null) {
          onClose(1000, 'Upstream EOF');
          break;
        }
        const incoming = chunk.subarray(0, n);
        const merged = new Uint8Array(buffer.length + incoming.length);
        merged.set(buffer, 0);
        merged.set(incoming, buffer.length);
        buffer = merged;

        const frames = parseServerFrames(buffer);
        let consumedTotal = 0;
        for (const f of frames) {
          consumedTotal += f.consumed;
          if (f.type === 'text' && f.data) {
            onText(f.data);
          } else if (f.type === 'ping') {
            try { await sendPong(); } catch (e) { console.error('[S2S] Upstream pong failed:', e); }
          } else if (f.type === 'close') {
            onClose(f.code ?? 1000, f.reason ?? '');
            return;
          }
        }
        if (consumedTotal > 0) {
          buffer = buffer.subarray(consumedTotal);
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes('Interrupted: operation canceled')) {
        console.log('[S2S] Upstream read interrupted (graceful shutdown).');
        onClose(1000, 'Interrupted');
      } else {
        console.error('[S2S] Upstream read error:', err);
        onClose(1011, 'Read error');
      }
    }
  }

  return { sendText, readLoop, close } as const;
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

  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  let headerConn: { sendText: (s: string) => Promise<void>; readLoop: (onText: (s: string) => void, onClose: (code: number, reason: string) => void) => Promise<void>; close: (code?: number, reason?: string) => Promise<void> } | null = null;
  const pendingClientMessages: Array<string> = [];
  let upstreamReady = false;
  let sentSessionUpdate = false;

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
              // Forward to client first
              if (socket.readyState === WebSocket.OPEN) {
                try { socket.send(text); } catch {}
              }

              // Log event type if JSON
              try {
                const data = JSON.parse(text);
                if (data?.type) {
                  console.log('[S2S] <- OpenAI:', data.type);
                  if (data.type === 'error') {
                    console.error('[S2S] <- OpenAI error payload:', data);
                  }

                  if (data.type === 'session.created' && !sentSessionUpdate) {
                    const updateEvent = {
                      type: 'session.update',
                      session: {
                        modalities: ['text', 'audio'],
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 1000 },
                        input_audio_transcription: { model: 'whisper-1' },
                      },
                    } as const;

                    try {
                      await headerConn!.sendText(JSON.stringify(updateEvent));
                      sentSessionUpdate = true;
                      console.log('[S2S] -> OpenAI: session.update sent');
                    } catch (e) {
                      console.error('[S2S] Failed to send session.update:', e);
                    }

                    // Flush buffered client messages (strings only)
                    if (pendingClientMessages.length) {
                      console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
                      while (pendingClientMessages.length > 0) {
                        const m = pendingClientMessages.shift()!;
                        try { await headerConn!.sendText(m); } catch (e) { console.error('[S2S] Flush send error:', e); }
                      }
                    }
                  }
                }
              } catch { /* not JSON */ }
            },
            (code: number, reason: string) => {
              console.log('[S2S] OpenAI (headers mode) closed:', code, reason);
              if (socket.readyState === WebSocket.OPEN) {
                try { socket.close(1000, 'Upstream closed'); } catch {}
              }
            }
          );

          upstreamReady = true;
        } catch (err) {
          console.error('[S2S] Error creating header-based upstream connection:', err);
          try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream (headers mode)' })); } catch { }
          socket.close(1011, 'OpenAI upstream init failed');
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
                      const updateEvent = {
                        type: 'session.update',
                        session: {
                          modalities: ['text', 'audio'],
                          input_audio_format: 'pcm16',
                          output_audio_format: 'pcm16',
                          turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 1000 },
                          input_audio_transcription: { model: 'whisper-1' },
                        },
                      } as const;
                      try {
                        openAISocket!.send(JSON.stringify(updateEvent));
                        sentSessionUpdate = true;
                        console.log('[S2S] -> OpenAI: session.update sent');
                      } catch (e) {
                        console.error('[S2S] Failed to send session.update:', e);
                      }
                      if (pendingClientMessages.length) {
                        console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
                        while (pendingClientMessages.length > 0) {
                          const m = pendingClientMessages.shift()!;
                          try { openAISocket!.send(m as any); } catch (e) { console.error('[S2S] Flush send error:', e); }
                        }
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
              socket.close(1000, 'Upstream closed');
            }
          };

          openAISocket.onerror = (error: Event | any) => {
            console.error('[S2S] OpenAI WebSocket error:', error);
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1011, 'Upstream error');
            }
          };
        } catch (err) {
          console.error('[S2S] Error creating OpenAI WebSocket:', err);
          try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream WebSocket' })); } catch { }
          socket.close(1011, 'OpenAI WS init failed');
          return;
        }
      }
    } catch (fatalErr) {
      console.error('[S2S] onopen fatal error:', fatalErr);
      try { socket.send(JSON.stringify({ type: 'error', error: 'Initialization error' })); } catch { }
      socket.close(1011, 'Initialization error');
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
    } catch (error) {
      console.error('[S2S] Error forwarding client message:', error);
    }
  };

  socket.onclose = (event) => {
    console.log('[S2S] Client WebSocket closed:', event.code, event.reason);
    try { openAISocket?.close(); } catch { }
    try { headerConn?.close(); } catch { }
  };

  socket.onerror = (error) => {
    console.error('[S2S] Client WebSocket error:', error);
    try { openAISocket?.close(); } catch { }
    try { headerConn?.close(); } catch { }
  };
  return response;
});