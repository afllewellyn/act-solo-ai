import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const readOpenAIKey = () => {
  const names = ["OPENAI_API_KEY", "OPENAI_API_KEY_RELAY"] as const;
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return { name, value } as const;
  }
  return { name: null as string | null, value: undefined as string | undefined } as const;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let keys: string[] = [];
    try {
      const obj = (Deno.env as any).toObject?.();
      keys = obj ? Object.keys(obj) : [];
    } catch (_) {
      keys = [];
    }

    const { name, value } = readOpenAIKey();
    const body = {
      env_keys_count: keys.length,
      env_keys_sample: keys.slice(0, 20),
      has_OPENAI_API_KEY: !!Deno.env.get("OPENAI_API_KEY"),
      has_OPENAI_API_KEY_RELAY: !!Deno.env.get("OPENAI_API_KEY_RELAY"),
      selected_key_name: name,
      selected_key_len: value?.length ?? 0,
      timestamp: new Date().toISOString()
    };

    console.log("[env-debug] keys:", body.env_keys_count, "openai:", body.selected_key_name ? "present" : "missing");

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[env-debug] error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
