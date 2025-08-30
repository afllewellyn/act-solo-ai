import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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