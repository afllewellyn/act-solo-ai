// Lightweight health check: confirms the Supabase backend (PostgREST -> Postgres)
// is reachable. It deliberately does NOT call OpenAI or any other paid API —
// this endpoint is unauthenticated and may be polled by uptime monitors, so
// every request must cost nothing. (The name is legacy; the old OpenAI
// realtime session/WebSocket check was removed.)

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
  }

  return {};
}

// @ts-ignore Deno.serve is provided by the Supabase Edge (Deno) runtime
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Return 403 for disallowed browser origins
  if (origin && Object.keys(corsHeaders).length === 0) {
    return new Response('Forbidden', { status: 403 });
  }

  const json = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify({ ...body, timestamp: new Date().toISOString() }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    console.error('[Health] SUPABASE_URL / SUPABASE_ANON_KEY not available in function env');
    return json({ status: 'unhealthy', checks: { database: 'unconfigured' } }, 503);
  }

  try {
    // One-row read through PostgREST. RLS returns an empty list for the anon
    // role, which is fine: a 2xx proves the API gateway and Postgres answered.
    const started = performance.now();
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=user_id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) {
      console.error('[Health] Database ping failed with status', res.status);
      return json({ status: 'unhealthy', checks: { database: 'unreachable' }, latency_ms: latencyMs }, 503);
    }

    return json({ status: 'healthy', checks: { database: 'reachable' }, latency_ms: latencyMs }, 200);
  } catch (error: unknown) {
    console.error('[Health] Database ping error:', error instanceof Error ? error.message : String(error));
    return json({ status: 'unhealthy', checks: { database: 'unreachable' } }, 503);
  }
});
