import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

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
      // Read API key without exposing it in logs
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      const hasKey = !!OPENAI_API_KEY;
      console.log('[S2S] OPENAI_API_KEY present:', hasKey, hasKey ? `(len=${OPENAI_API_KEY!.length})` : '');

      if (!OPENAI_API_KEY) {
        console.error('[S2S] Missing OpenAI API key');
        try { socket.send(JSON.stringify({ type: 'error', error: 'Missing OpenAI API key on server' })); } catch { }
        socket.close(1008, 'Missing API key');
        return;
      }

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
        openAISocket = new WebSocket(
          'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
          {
            headers: {
              'Authorization': `Bearer ${EPHEMERAL_KEY}`,
              'OpenAI-Beta': 'realtime=v1'
            }
          } as any // Edge runtime supports headers option
        );
      } catch (err) {
        console.error('[S2S] Error creating OpenAI WebSocket:', err);
        try { socket.send(JSON.stringify({ type: 'error', error: 'Failed to initialize upstream WebSocket' })); } catch { }
        socket.close(1011, 'OpenAI WS init failed');
        return;
      }

      openAISocket.onopen = () => {
        upstreamReady = true;
        console.log('[S2S] Connected to OpenAI Realtime API');

        // Flush any buffered client messages
        if (pendingClientMessages.length) {
          console.log(`[S2S] Flushing ${pendingClientMessages.length} buffered client messages`);
          pendingClientMessages.splice(0).forEach((m) => {
            try { openAISocket?.send(m); } catch (e) { console.error('[S2S] Flush send error:', e); }
          });
        }
      };

      openAISocket.onmessage = (event) => {
        // Forward upstream events to client; also inject session.update after session.created
        try {
          let forwarded = false;
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              if (data?.type) {
                console.log('[S2S] <- OpenAI:', data.type);
                if (data.type === 'session.created') {
                  // Send session.update with critical audio settings
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
                        silence_duration_ms: 900
                      },
                      tool_choice: 'auto',
                      temperature: 0.8,
                      max_response_output_tokens: 'inf'
                    }
                  } as const;
                  try {
                    openAISocket?.send(JSON.stringify(updateEvent));
                    console.log('[S2S] -> OpenAI: session.update sent');
                  } catch (e) {
                    console.error('[S2S] Failed to send session.update:', e);
                  }
                }
              }
            } catch {
              // not JSON, just forward
            }
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
            forwarded = true;
          }
          if (!forwarded) {
            console.warn('[S2S] Upstream message not forwarded (socket not open)');
          }
        } catch (error) {
          console.error('[S2S] Error processing OpenAI message:', error);
        }
      };

      openAISocket.onerror = (error) => {
        console.error('[S2S] OpenAI WebSocket error:', error);
        try { socket.send(JSON.stringify({ type: 'error', error: 'OpenAI connection error' })); } catch { }
      };

      openAISocket.onclose = (event) => {
        console.log('[S2S] OpenAI WebSocket closed:', event.code, event.reason);
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(event.code, event.reason);
        }
      };

    } catch (error) {
      console.error('[S2S] Fatal error during setup:', error);
      try { socket.send(JSON.stringify({ type: 'error', error: 'Server setup error' })); } catch { }
      socket.close(1011, 'Server setup error');
    }
  };

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