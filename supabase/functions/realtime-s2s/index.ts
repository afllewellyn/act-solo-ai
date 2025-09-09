
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// Model configuration
const OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview-2025-06-03';

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

Deno.serve(async (req) => {
  // Allow basic health probes and CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  const pendingClientMessages: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  let upstreamReady = false;

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
      console.log('[S2S] Connecting to OpenAI Realtime API via WebSocket...');
      try {
        const upstreamUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
        const protocols: string[] = [
          `openai-insecure-api-key.${EPHEMERAL_KEY}`,
          'openai-beta.realtime-v1',
        ];
        console.log('[S2S] Protocols check:', protocols.map(p => `"${p}"`).join(', '));

        openAISocket = new WebSocket(upstreamUrl, protocols);

        openAISocket.onopen = () => {
          upstreamReady = true;
          console.log('[S2S] Connected to OpenAI Realtime API');

          // Send minimal session.update (text-only, no server VAD) before flushing
          const updateEvent = {
            type: 'session.update',
            session: {
              modalities: ['text'],
              turn_detection: { type: 'none' },
            },
          } as const;
          try {
            openAISocket!.send(JSON.stringify(updateEvent));
            console.log('[S2S] -> OpenAI: session.update sent');
          } catch (e) {
            console.error('[S2S] Failed to send session.update:', e);
          }

          // Flush any buffered client messages
          if (pendingClientMessages.length) {
            console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
            while (pendingClientMessages.length > 0) {
              const m = pendingClientMessages.shift()!;
              try { openAISocket!.send(m as any); } catch (e) { console.error('[S2S] Flush send error:', e); }
            }
          }
        };

        openAISocket.onmessage = async (event: MessageEvent) => {
          try {
            const msg = event.data;
            if (typeof msg === 'string') {
              try {
                const data = JSON.parse(msg);
                if (data?.type) {
                  console.log('[S2S] <- OpenAI:', data.type);
                  if (data.type === 'error') {
                    console.error('[S2S] <- OpenAI error payload:', data);
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
    } catch (fatalErr) {
      console.error('[S2S] onopen fatal error:', fatalErr);
      try { socket.send(JSON.stringify({ type: 'error', error: 'Initialization error' })); } catch { }
      socket.close(1011, 'Initialization error');
    }
    };

  // Buffer client messages until upstream is ready
  socket.onmessage = (event) => {
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

      if (upstreamReady && openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.send(payload);
      } else {
        pendingClientMessages.push(payload);
        console.log('[S2S] Buffered client message (upstream not ready yet)');
      }
    } catch (error) {
      console.error('[S2S] Error forwarding client message:', error);
    }
  };

  socket.onclose = (event) => {
    console.log('[S2S] Client WebSocket closed:', event.code, event.reason);
    try { openAISocket?.close(); } catch { }
  };

  socket.onerror = (error) => {
    console.error('[S2S] Client WebSocket error:', error);
    try { openAISocket?.close(); } catch { }
  };

  return response;
});