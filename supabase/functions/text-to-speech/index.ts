import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] TTS request received`)

  try {
    const { text, voice_id = '9BWtsMINqrJLrRacOk9x' } = await req.json()

    // Validate input
    if (!text) {
      throw new Error('Text is required')
    }

    if (typeof text !== 'string') {
      throw new Error('Text must be a string')
    }

    if (text.length > 5000) {
      throw new Error('Text too long (max 5000 characters)')
    }

    // Clean text - remove HTML tags and normalize whitespace
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim()
    
    if (!cleanText) {
      throw new Error('No valid text content after cleaning')
    }

    console.log(`[${timestamp}] Processing TTS for voice: ${voice_id}, text length: ${cleanText.length}`)

    // Validate API key with detailed logging
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    console.log(`[${timestamp}] API Key check - Defined: ${!!apiKey}, Length: ${apiKey?.length || 0}`)
    
    if (!apiKey) {
      console.error(`[${timestamp}] ELEVENLABS_API_KEY environment variable not found`)
      throw new Error('ElevenLabs API key not configured')
    }
    
    // TEMPORARY: Log full key with delimiters to check for encoding issues
    console.log(`[${timestamp}] Full API key with delimiters: [START]${apiKey}[END]`)
    console.log(`[${timestamp}] API key bytes:`, Array.from(new TextEncoder().encode(apiKey)))
    
    // Log first/last 4 characters for debugging
    const keyPreview = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : '[too short]'
    console.log(`[${timestamp}] Using API key: ${keyPreview}`)
    
    // Trim any whitespace that might cause issues
    const cleanApiKey = apiKey.trim()
    console.log(`[${timestamp}] After trim - Length: ${cleanApiKey.length}, Same as original: ${apiKey === cleanApiKey}`)

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voice_id, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': cleanApiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    })

    console.log(`[${timestamp}] ElevenLabs API response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${timestamp}] ElevenLabs API error: ${response.status} - ${errorText}`)
      
      if (response.status === 401) {
        throw new Error('Invalid API key')
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait and try again.')
      } else if (response.status === 422) {
        throw new Error('Invalid voice ID or request parameters')
      } else {
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
      }
    }

    const audioBuffer = await response.arrayBuffer()
    
    if (audioBuffer.byteLength === 0) {
      throw new Error('Empty audio response from ElevenLabs')
    }

    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)))
    
    console.log(`[${timestamp}] Successfully generated audio, size: ${audioBuffer.byteLength} bytes`)

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        voiceId: voice_id,
        textLength: cleanText.length 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error(`[${timestamp}] TTS Error:`, error.message)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp,
        type: 'TTS_ERROR'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})