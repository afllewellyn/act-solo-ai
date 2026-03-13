import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
  
  // Check if origin matches allowed patterns
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.lovable.app') ||
    origin === 'https://actsolo.ai' ||
    origin === 'https://www.actsolo.ai'
  );
  
  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
  
  return {};
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Return 403 for disallowed origins (check BEFORE OPTIONS handler)
  if (origin && Object.keys(corsHeaders).length === 0) {
    console.error('[ElevenAgentToken] Forbidden origin:', origin);
    return new Response('Forbidden', { status: 403 });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")?.trim();
    const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID")?.trim();

    if (!ELEVENLABS_API_KEY) {
      console.error('[ElevenAgentToken] ELEVENLABS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ELEVENLABS_AGENT_ID) {
      console.error('[ElevenAgentToken] ELEVENLABS_AGENT_ID not configured');
      return new Response(
        JSON.stringify({ error: 'ElevenLabs Agent ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ElevenAgentToken] Fetching signed URL for agent: ${ELEVENLABS_AGENT_ID}`);

    // Call ElevenLabs Conversational AI API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ElevenAgentToken] ElevenLabs API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get signed URL from ElevenLabs',
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[ElevenAgentToken] Successfully generated signed URL');

    return new Response(
      JSON.stringify({
        signed_url: data.signed_url,
        expires_at: data.expires_at,
        agent_id: ELEVENLABS_AGENT_ID,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('[ElevenAgentToken] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
