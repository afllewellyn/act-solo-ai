
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
}

// Rate limiting map
const rateLimits = new Map<string, { count: number; resetTime: number }>()

const isRateLimited = (clientId: string): boolean => {
  const now = Date.now()
  const limit = rateLimits.get(clientId)
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(clientId, { count: 1, resetTime: now + 60000 }) // 1 minute window
    return false
  }
  
  if (limit.count >= 10) { // 10 requests per minute
    return true
  }
  
  limit.count++
  return false
}

const validateInput = (text: any): { isValid: boolean; error?: string; sanitized?: string } => {
  if (!text) {
    return { isValid: false, error: 'Text is required' }
  }

  if (typeof text !== 'string') {
    return { isValid: false, error: 'Text must be a string' }
  }

  if (text.length > 5000) {
    return { isValid: false, error: 'Text too long (max 5000 characters)' }
  }

  // Sanitize text - remove HTML tags, normalize whitespace, remove potential script injections
  const sanitized = text
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim()
  
  if (!sanitized || sanitized.length === 0) {
    return { isValid: false, error: 'No valid text content after sanitization' }
  }

  return { isValid: true, sanitized }
}

const validateVoiceId = (voiceId: any): boolean => {
  if (!voiceId || typeof voiceId !== 'string') return false
  return /^[A-Za-z0-9_-]+$/.test(voiceId)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] TTS request received`)

  try {
    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    if (isRateLimited(clientIp)) {
      console.log(`[${timestamp}] Rate limit exceeded for ${clientIp}`)
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
      )
    }

    // Validate request size
    const contentLength = parseInt(req.headers.get('content-length') || '0')
    if (contentLength > 5120) { // 5KB limit
      throw new Error('Request too large')
    }

    const requestData = await req.json()
    const { text, voice_id = '9BWtsMINqrJLrRacOk9x' } = requestData

    // Validate and sanitize inputs
    const textValidation = validateInput(text)
    if (!textValidation.isValid) {
      throw new Error(textValidation.error)
    }

    if (!validateVoiceId(voice_id)) {
      throw new Error('Invalid voice ID format')
    }

    const cleanText = textValidation.sanitized!

    console.log(`[${timestamp}] Processing TTS for voice: ${voice_id}, text length: ${cleanText.length}`)

    // Validate API key with detailed logging
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!apiKey) {
      console.error(`[${timestamp}] ELEVENLABS_API_KEY environment variable not found`)
      throw new Error('API configuration error')
    }
    
    // Trim any whitespace that might cause issues
    const cleanApiKey = apiKey.trim()

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'xi-api-key': cleanApiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: Math.max(0, Math.min(1, 0.5)), // Clamp between 0-1
          similarity_boost: Math.max(0, Math.min(1, 0.5)), // Clamp between 0-1
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
        throw new Error('Authentication failed')
      } else if (response.status === 429) {
        throw new Error('Service rate limit exceeded. Please wait and try again.')
      } else if (response.status === 422) {
        throw new Error('Invalid request parameters')
      } else {
        throw new Error('External service error')
      }
    }

    const responseData = await response.json()
    
    if (!responseData.audio_base64) {
      throw new Error('No audio content in response')
    }

    console.log(`[${timestamp}] Successfully generated audio with timestamps`)

    return new Response(
      JSON.stringify({ 
        audioContent: responseData.audio_base64,
        timestamps: responseData.alignment || null,
        voiceId: voice_id,
        textLength: cleanText.length 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error(`[${timestamp}] TTS Error:`, error.message)
    
    // Don't expose sensitive error details
    const sanitizedError = error.message.includes('API key') 
      ? 'Authentication error'
      : error.message.includes('network')
      ? 'Network error'
      : error.message.includes('ELEVENLABS_API_KEY')
      ? 'Configuration error'
      : error.message
    
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
    )
  }
})
