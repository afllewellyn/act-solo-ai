import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

function normalizeOrigin(origin: string | null): { url: URL | null; hostname: string | null } {
  if (!origin) return { url: null, hostname: null };
  try {
    const url = new URL(origin);
    return { url, hostname: url.hostname.toLowerCase() };
  } catch {
    return { url: null, hostname: null };
  }
}

function parseAllowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean);
}

function matchesPattern(pattern: string, url: URL): boolean {
  if (pattern === '*') return true;

  // Pattern with protocol
  if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
    try {
      const p = new URL(pattern);
      const isWildcard = p.hostname.startsWith('*.');
      const hostOk = isWildcard
        ? url.hostname.endsWith(p.hostname.slice(1))
        : url.hostname === p.hostname;
      const protoOk = url.protocol === p.protocol;
      const portOk = p.port ? url.port === p.port : true;
      return hostOk && protoOk && portOk;
    } catch {
      return false;
    }
  }

  // Hostname-only pattern (supports wildcard and optional :port)
  const [hostPart, portPart] = pattern.split(':');
  const isWildcard = hostPart.startsWith('*.');
  const hostOk = isWildcard
    ? url.hostname.endsWith(hostPart.slice(1))
    : url.hostname === hostPart;
  const portOk = portPart ? url.port === portPart : true;
  return hostOk && portOk;
}

function isOriginAllowed(origin: string | null): boolean {
  const { url } = normalizeOrigin(origin);
  if (!url) return false;
  const patterns = parseAllowedOrigins();
  return patterns.some(p => matchesPattern(p, url));
}

function getCorsHeaders(origin: string | null, allowedMethods: string): Record<string, string> {
  if (isOriginAllowed(origin) && origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': allowedMethods,
      'Vary': 'Origin',
    };
  }
  return {};
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin, 'POST, OPTIONS');
  const patterns = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim());
  const allowed = (origin ? isOriginAllowed(origin) : false);
  console.log(`[CORS][tts-stream] origin=${origin} allowed=${allowed} patterns=${patterns.join(' | ')}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Return 403 for disallowed origins
  if (origin && Object.keys(corsHeaders).length === 0) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  try {
    const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL', model = 'eleven_turbo_v2_5' } = await req.json();
    
    if (!text) {
      throw new Error('Text is required');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    console.log(`[Streaming TTS] Starting stream for text: "${text.substring(0, 50)}..."`);
    console.log(`[Streaming TTS] Voice ID: ${voiceId}, Model: ${model}`);

    // Create streaming response to ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        },
        output_format: 'mp3_44100_128'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Streaming TTS] ElevenLabs API error: ${response.status} - ${errorText}`);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    console.log(`[Streaming TTS] Successfully connected to ElevenLabs stream`);

    // Create a readable stream that will relay the audio data
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          let chunkCount = 0;
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`[Streaming TTS] Stream complete. Total chunks: ${chunkCount}`);
              controller.close();
              break;
            }

            chunkCount++;
            console.log(`[Streaming TTS] Streaming chunk ${chunkCount}, size: ${value.length} bytes`);
            
            // Forward the audio chunk to the client
            controller.enqueue(value);
          }
        } catch (error) {
          console.error(`[Streaming TTS] Stream error:`, error);
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });

    // Return streaming response
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[Streaming TTS] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});