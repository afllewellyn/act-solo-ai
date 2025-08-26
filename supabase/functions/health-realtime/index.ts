import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('[Health Realtime] Testing ephemeral token generation...');

    // Step 1: Request ephemeral token from OpenAI REST API
    const ephemeralResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions: "Health check test session - you are a helpful assistant."
      }),
    });

    if (!ephemeralResponse.ok) {
      const errorText = await ephemeralResponse.text();
      console.error('[Health Realtime] Ephemeral token request failed:', errorText);
      throw new Error(`Ephemeral token request failed: ${ephemeralResponse.status}`);
    }

    const ephemeralData = await ephemeralResponse.json();
    console.log('[Health Realtime] Ephemeral token generated successfully');

    // Step 2: Test WebSocket handshake with OpenAI Realtime API
    const wsTestUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
    
    // Create a test WebSocket connection
    const ws = new WebSocket(wsTestUrl, [], {
      headers: {
        "Authorization": `Bearer ${ephemeralData.client_secret.value}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    const wsTestResult = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, error: 'WebSocket connection timeout' });
      }, 5000);

      ws.onopen = () => {
        console.log('[Health Realtime] WebSocket connection opened successfully');
        clearTimeout(timeout);
        ws.close();
        resolve({ success: true });
      };

      ws.onerror = (error) => {
        console.error('[Health Realtime] WebSocket connection error:', error);
        clearTimeout(timeout);
        resolve({ success: false, error: 'WebSocket connection failed' });
      };

      ws.onmessage = (event) => {
        console.log('[Health Realtime] WebSocket message received:', event.data);
      };
    });

    // Return health check results
    return new Response(JSON.stringify({
      status: 'healthy',
      checks: {
        openai_api_key: 'configured',
        ephemeral_token_generation: 'success',
        websocket_handshake: wsTestResult.success ? 'success' : 'failed',
        websocket_error: !wsTestResult.success ? wsTestResult.error : undefined
      },
      timestamp: new Date().toISOString(),
      environment: 'production'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Health Realtime] Health check failed:', error);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});