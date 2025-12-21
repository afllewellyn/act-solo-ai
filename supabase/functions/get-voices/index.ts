import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Rate limiting map
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const isRateLimited = (clientId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(clientId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(clientId, { count: 1, resetTime: now + 300000 }); // 5 minute window
    return false;
  }
  
  if (limit.count >= 5) { // 5 requests per 5 minutes
    return true;
  }
  
  limit.count++;
  return false;
};

const sanitizeVoiceData = (voice: any) => {
  // Validate and sanitize voice data
  if (!voice || typeof voice !== 'object') return null;

  const sanitized = {
    id: typeof voice.voice_id === 'string' ? voice.voice_id.replace(/[^A-Za-z0-9_-]/g, '') : '',
    name: typeof voice.name === 'string' ? voice.name.slice(0, 50).replace(/[<>]/g, '') : 'Unknown',
    category: typeof voice.category === 'string' ? voice.category.slice(0, 20).replace(/[<>]/g, '') : 'Unknown',
    gender: voice.labels?.gender ? String(voice.labels.gender).slice(0, 10).replace(/[<>]/g, '') : 'Unknown',
    accent: voice.labels?.accent ? String(voice.labels.accent).slice(0, 20).replace(/[<>]/g, '') : 'Unknown'
  };

  // Validate ID format
  if (!/^[A-Za-z0-9_-]+$/.test(sanitized.id)) {
    return null;
  }

  return sanitized;
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] Get voices request from origin: ${origin}`);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Return 403 for disallowed origins
  if (origin && Object.keys(corsHeaders).length === 0) {
    console.log(`[${timestamp}] Forbidden origin: ${origin}`);
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(clientIp)) {
      console.log(`[${timestamp}] Rate limit exceeded for ${clientIp}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please wait before making another request.',
          timestamp,
          type: 'RATE_LIMIT_ERROR'
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Validate API key
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('API configuration error');
    }

    console.log(`[${timestamp}] Fetching voices from ElevenLabs API`);

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': apiKey.trim(),
      },
    });

    console.log(`[${timestamp}] ElevenLabs API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${timestamp}] ElevenLabs API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        throw new Error('Authentication failed');
      } else if (response.status === 429) {
        throw new Error('Service rate limit exceeded. Please wait and try again.');
      } else {
        throw new Error('External service error');
      }
    }

    const voicesData = await response.json();
    
    if (!voicesData.voices || !Array.isArray(voicesData.voices)) {
      throw new Error('Invalid response format');
    }
    
    // Transform and sanitize the response to include only the needed data
    const voices = voicesData.voices
      .map(sanitizeVoiceData)
      .filter(Boolean) // Remove any null results from sanitization
      .slice(0, 100); // Limit to 100 voices max

    console.log(`[${timestamp}] Successfully fetched and sanitized ${voices.length} voices`);

    return new Response(
      JSON.stringify({ voices }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${timestamp}] Get voices error:`, err.message);
    
    // Don't expose sensitive error details
    const sanitizedError = err.message.includes('API key') 
      ? 'Authentication error'
      : err.message.includes('network')
      ? 'Network error'
      : err.message.includes('ELEVENLABS_API_KEY')
      ? 'Configuration error'
      : err.message;

    return new Response(
      JSON.stringify({ 
        error: sanitizedError,
        timestamp,
        type: 'GET_VOICES_ERROR'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
