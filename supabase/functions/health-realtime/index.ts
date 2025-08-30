


function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim());
  
  if (origin && allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
  }
  
  return {};
}

// @ts-ignore - Deno-specific API
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Return 403 for disallowed origins
  if (origin && Object.keys(corsHeaders).length === 0) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
// @ts-ignore - Deno-specific API
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

    // Step 2: Test WebSocket handshake with OpenAI Realtime API (authenticated)
    // Note: The standard WebSocket constructor in Edge Functions cannot send custom headers.
    // We'll perform a manual TLS WebSocket handshake so we can include Authorization and OpenAI-Beta headers.
    const testWebSocketHandshake = async (token: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const hostname = 'api.openai.com';
        const port = 443;
        const path = '/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

// @ts-ignore - Deno-specific API
        const conn = await Deno.connectTls({ hostname, port });
        const enc = new TextEncoder();
        const dec = new TextDecoder();

        // Generate Sec-WebSocket-Key
        const keyBytes = crypto.getRandomValues(new Uint8Array(16));
        const secKey = btoa(String.fromCharCode(...Array.from(keyBytes)));

        const request =
          `GET ${path} HTTP/1.1\r\n` +
          `Host: ${hostname}\r\n` +
          `Connection: Upgrade\r\n` +
          `Upgrade: websocket\r\n` +
          `Sec-WebSocket-Version: 13\r\n` +
          `Sec-WebSocket-Key: ${secKey}\r\n` +
          `Authorization: Bearer ${token}\r\n` +
          `OpenAI-Beta: realtime=v1\r\n` +
          `Origin: https://functions.supabase.co\r\n` +
          `\r\n`;

        await conn.write(enc.encode(request));

        // Read response headers
        let headerText = '';
        const buf = new Uint8Array(4096);
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const n = await conn.read(buf);
          if (n === null) break;
          headerText += dec.decode(buf.subarray(0, n));
          if (headerText.includes('\r\n\r\n')) break; // end of headers
        }

        try { conn.close(); } catch (_) {}

        const statusLine = headerText.split('\r\n')[0] || headerText;
        if (headerText.startsWith('HTTP/1.1 101')) {
          console.log('[Health Realtime] WebSocket handshake 101 Switching Protocols');
          return { success: true };
        } else {
          console.error('[Health Realtime] WebSocket handshake failed:', statusLine);
          return { success: false, error: statusLine };
        }
      } catch (err) {
        console.error('[Health Realtime] WebSocket handshake exception:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    };

    const wsTestResult = await testWebSocketHandshake(ephemeralData.client_secret.value);

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

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Health Realtime] Health check failed:', err.message);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});