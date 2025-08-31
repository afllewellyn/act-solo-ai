import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  console.log('[S2S] Starting WebSocket upgrade for OpenAI Realtime API');

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.error('[S2S] Missing OpenAI API key');
    socket.close(1000, 'Missing API key');
    return response;
  }

  let openAISocket: WebSocket | null = null;

  socket.onopen = () => {
    console.log('[S2S] Client WebSocket connected, connecting to OpenAI...');
    
    try {
      openAISocket = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1"
          }
        }
      );

      openAISocket.onopen = () => {
        console.log('[S2S] Connected to OpenAI Realtime API');
      };

      openAISocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[S2S] Received from OpenAI:', data.type);
          
          // Forward OpenAI messages to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        } catch (error) {
          console.error('[S2S] Error processing OpenAI message:', error);
        }
      };

      openAISocket.onerror = (error) => {
        console.error('[S2S] OpenAI WebSocket error:', error);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'error',
            error: 'OpenAI connection error'
          }));
        }
      };

      openAISocket.onclose = (event) => {
        console.log('[S2S] OpenAI WebSocket closed:', event.code, event.reason);
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(event.code, event.reason);
        }
      };

    } catch (error) {
      console.error('[S2S] Error connecting to OpenAI:', error);
      socket.close(1000, 'Failed to connect to OpenAI');
    }
  };

  socket.onmessage = (event) => {
    try {
      console.log('[S2S] Received from client, forwarding to OpenAI');
      
      if (openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.send(event.data);
      } else {
        console.warn('[S2S] OpenAI socket not ready, buffering message');
      }
    } catch (error) {
      console.error('[S2S] Error forwarding client message:', error);
    }
  };

  socket.onclose = (event) => {
    console.log('[S2S] Client WebSocket closed:', event.code, event.reason);
    if (openAISocket?.readyState === WebSocket.OPEN) {
      openAISocket.close();
    }
  };

  socket.onerror = (error) => {
    console.error('[S2S] Client WebSocket error:', error);
    if (openAISocket?.readyState === WebSocket.OPEN) {
      openAISocket.close();
    }
  };

  return response;
});