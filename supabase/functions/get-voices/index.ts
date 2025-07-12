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
  console.log(`[${timestamp}] Get voices request received`)

  try {
    // Validate API key
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured')
    }

    console.log(`[${timestamp}] Fetching voices from ElevenLabs API`)

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': apiKey,
      },
    })

    console.log(`[${timestamp}] ElevenLabs API response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${timestamp}] ElevenLabs API error: ${response.status} - ${errorText}`)
      
      if (response.status === 401) {
        throw new Error('Invalid API key')
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait and try again.')
      } else {
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
      }
    }

    const voicesData = await response.json()
    
    // Transform the response to include only the needed data
    const voices = voicesData.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category,
      gender: voice.labels?.gender || 'Unknown',
      accent: voice.labels?.accent || 'Unknown'
    }))

    console.log(`[${timestamp}] Successfully fetched ${voices.length} voices`)

    return new Response(
      JSON.stringify({ voices }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error(`[${timestamp}] Get voices error:`, error.message)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp,
        type: 'GET_VOICES_ERROR'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})