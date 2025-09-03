import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { connectWebSocket } from "https://deno.land/std@0.168.0/ws/mod.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

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

serve(async (req) => {
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
          model: 'gpt-4o-realtime-preview-2024-12-17',
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
        const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        const headers = new Headers({
          'Authorization': `Bearer ${EPHEMERAL_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
          'Origin': 'https://functions.supabase.co',
        });

        // Use Deno std/ws client to pass headers (mirrors health-realtime approach)
        // @ts-ignore - std/ws client returns a compatible WebSocket-like object
        const ws: any = await connectWebSocket(url, headers);
        openAISocket = ws as unknown as WebSocket;
        upstreamReady = true;
        (openAISocket as any).readyState = WebSocket.OPEN;
        console.log('[S2S] Connected to OpenAI Realtime API');

        // Flush any buffered client messages
        if (pendingClientMessages.length) {
          console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
          pendingClientMessages.splice(0).forEach((m) => {
            try { (ws as any).send(m as any); } catch (e) { console.error('[S2S] Flush send error:', e); }
          });
        }

        // Pump upstream -> client
        (async () => {
          try {
            for await (const msg of ws) {
              try {
                if (typeof msg === 'string') {
                  try {
                    const data = JSON.parse(msg);
                    if (data?.type) {
                      console.log('[S2S] <- OpenAI:', data.type);
                      if (data.type === 'session.created') {
                        const updateEvent = {
                          type: 'session.update',
                          session: {
                            modalities: ['text', 'audio'],
                            instructions: 'You are a helpful speech rehearsal assistant.',
                            voice: 'alloy',
                            input_audio_format: 'pcm16',
                            output_audio_format: 'pcm16',
                            input_audio_transcription: { model: 'whisper-1' },
                            turn_detection: {
                              type: 'server_vad',
                              threshold: 0.5,
                              prefix_padding_ms: 300,
                              silence_duration_ms: 900,
                            },
                            tool_choice: 'auto',
                            temperature: 0.8,
                            max_response_output_tokens: 'inf',
                          },
                        } as const;
                        try {
                          ws.send(JSON.stringify(updateEvent));
                          console.log('[S2S] -> OpenAI: session.update sent');
                        } catch (e) {
                          console.error('[S2S] Failed to send session.update:', e);
                        }
                      }
                    }
                  } catch { /* not JSON */ }
                  if (socket.readyState === WebSocket.OPEN) {
                    socket.send(msg);
                  }
                } else if (msg instanceof Uint8Array) {
                  if (socket.readyState === WebSocket.OPEN) {
                    socket.send(msg);
                  }
                }
              } catch (err) {
                console.error('[S2S] Error processing OpenAI message:', err);
              }
            }
            // Loop ended (upstream closed)
            console.log('[S2S] OpenAI WebSocket closed (loop end)');
            (openAISocket as any).readyState = WebSocket.CLOSED;
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1000, 'Upstream closed');
            }
          } catch (loopErr) {
            console.error('[S2S] Upstream read loop error:', loopErr);
            (openAISocket as any).readyState = WebSocket.CLOSED;
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1011, 'Upstream error');
            }
          }
        })();
      } catch (err) {
        console.error('[S2S] Error creating OpenAI WebSocket:', err);
        try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream WebSocket' })); } catch { }
        socket.close(1011, 'OpenAI WS init failed');
        return;
      }
  // Buffer client messages until upstream is ready
  socket.onmessage = (event) => {
    try {
      if (upstreamReady && openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.send(event.data);
      } else {
        pendingClientMessages.push(event.data);
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