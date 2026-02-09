import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
  
  // Check if origin matches allowed patterns
  const isAllowed = origin && (
    // Exact match from ALLOWED_ORIGINS env var
    allowedOrigins.includes(origin) ||
    // Pattern match for Lovable platform domains (safe - Lovable controls these)
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.lovable.app')
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

// Rate limiting map
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const isRateLimited = (clientId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(clientId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(clientId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return false;
  }
  
  if (limit.count >= 10) { // 10 requests per minute
    return true;
  }
  
  limit.count++;
  return false;
};

const validateInput = (text: any): { isValid: boolean; error?: string; sanitized?: string } => {
  if (!text) {
    return { isValid: false, error: 'Text is required' };
  }

  if (typeof text !== 'string') {
    return { isValid: false, error: 'Text must be a string' };
  }

  if (text.length > 5000) {
    return { isValid: false, error: 'Text too long (max 5000 characters)' };
  }

  // Sanitize text - remove HTML tags, normalize whitespace, remove potential script injections
  const sanitized = text
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
  
  if (!sanitized || sanitized.length === 0) {
    return { isValid: false, error: 'No valid text content after sanitization' };
  }

  return { isValid: true, sanitized };
};

const validateVoiceId = (voiceId: any): boolean => {
  if (!voiceId || typeof voiceId !== 'string') return false;
  return /^[A-Za-z0-9_-]+$/.test(voiceId);
};

// Structured server logging helper
const serverLog = (event: string, context: Record<string, unknown> = {}) => {
  const payload = {
    event,
    component: 'TTSServer',
    engine: 'webspeech',
    ts: new Date().toISOString(),
    ...context,
  };
  try {
    console.log(JSON.stringify(payload));
  } catch (_) {
    console.log(`[TTSServer] ${event}`);
  }
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] TTS request from origin: ${origin}`);

  // Return 403 for disallowed origins (check BEFORE OPTIONS handler)
  if (origin && Object.keys(corsHeaders).length === 0) {
    console.log(`[${timestamp}] Forbidden origin: ${origin}`);
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Validate request size
    const contentLength = parseInt(req.headers.get('content-length') || '0');
    if (contentLength > 5120) { // 5KB limit
      throw new Error('Request too large');
    }

    const requestData = await req.json();
    const { text, voice_id = '9BWtsMINqrJLrRacOk9x', request_id, line_idx } = requestData;
    const requestId = request_id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req_${Date.now()}`);
    const lineIdx = typeof line_idx === 'number' ? line_idx : undefined;

    // Validate and sanitize inputs
    const textValidation = validateInput(text);
    if (!textValidation.isValid) {
      throw new Error(textValidation.error);
    }

    if (!validateVoiceId(voice_id)) {
      throw new Error('Invalid voice ID format');
    }

    const cleanText = textValidation.sanitized!;

    console.log(`[${timestamp}] Processing TTS for voice: ${voice_id}, text length: ${cleanText.length}`);

    // Server timing: request start
    const t_tts_request_start = new Date().toISOString();
    serverLog('tts_request_start', { requestId, lineIdx, t_tts_request_start });

    // Validate API key with detailed logging
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      console.error(`[${timestamp}] ELEVENLABS_API_KEY environment variable not found`);
      throw new Error('API configuration error');
    }
    
    // Trim any whitespace that might cause issues
    const cleanApiKey = apiKey.trim();

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'xi-api-key': cleanApiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_v3',
        voice_settings: {
          stability: 0.0, // Creative mode (v3 accepts 0.0/0.5/1.0) — max emotional range for dramatic delivery
          similarity_boost: Math.max(0, Math.min(1, 0.78)), // Higher for clear, consistent voice identity
          style: Math.max(0, Math.min(1, 0.45)), // Unlock v3 style exaggeration for expressive acting
          use_speaker_boost: true
        }
      }),
    });

    console.log(`[${timestamp}] ElevenLabs API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${timestamp}] ElevenLabs API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        throw new Error('Authentication failed');
      } else if (response.status === 429) {
        throw new Error('Service rate limit exceeded. Please wait and try again.');
      } else if (response.status === 422) {
        throw new Error('Invalid request parameters');
      } else {
        throw new Error('External service error');
      }
    }

    // Stream and measure timings
    if (!response.body) {
      throw new Error('No response body from ElevenLabs');
    }

    const reader = response.body.getReader();
    let bytes_streamed = 0;
    let t_tts_first_byte: string | null = null;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (!t_tts_first_byte) {
          t_tts_first_byte = new Date().toISOString();
          const latency_ms_endToFirstByte = new Date(t_tts_first_byte).getTime() - new Date(t_tts_request_start).getTime();
          serverLog('tts_first_byte', { requestId, lineIdx, t_tts_request_start, t_tts_first_byte, latency_ms_endToFirstByte });
        }
        bytes_streamed += value.byteLength;
        chunks.push(value);
      }
    }

    const t_tts_stream_end = new Date().toISOString();
    serverLog('tts_stream_end', { requestId, lineIdx, t_tts_stream_end, bytes_streamed });

    // Concatenate chunks and parse JSON
    const total = new Uint8Array(bytes_streamed);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const jsonText = new TextDecoder().decode(total);
    const responseData = JSON.parse(jsonText);

    if (!responseData.audio_base64) {
      throw new Error('No audio content in response');
    }

    console.log(`[${timestamp}] Successfully generated audio with timestamps`);

    return new Response(
      JSON.stringify({ 
        audioContent: responseData.audio_base64,
        timestamps: responseData.alignment || null,
        voiceId: voice_id,
        textLength: cleanText.length,
        requestId,
        lineIdx
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${timestamp}] TTS Error:`, errorMessage);
    
    // Don't expose sensitive error details
    const sanitizedError = errorMessage.includes('API key') 
      ? 'Authentication error'
      : errorMessage.includes('network')
      ? 'Network error'
      : errorMessage.includes('ELEVENLABS_API_KEY')
      ? 'Configuration error'
      : errorMessage;
    
    return new Response(
      JSON.stringify({ 
        error: sanitizedError,
        timestamp,
        type: 'TTS_ERROR'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
