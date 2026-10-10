// Shared auth gate for edge functions that spend third-party credits.
//
// `verify_jwt = false` in config.toml means the platform does not check the
// caller's token, and the `Origin` allow-list only constrains browsers — any
// script can omit or forge that header. Functions that call paid APIs must
// therefore verify a signed-in *user* themselves.
//
// The anon/publishable key is itself a valid JWT but carries no user, so
// Supabase Auth rejects it here; only a real user session token passes.

export interface AuthedUser {
  id: string;
}

export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    console.error('[auth] SUPABASE_URL / SUPABASE_ANON_KEY not available in function env');
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${match[1]}`, apikey: anonKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === 'string' ? { id: user.id } : null;
  } catch (err) {
    console.error('[auth] token verification failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
