import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Disabled: env-debug was for temporary testing only.
serve(() => new Response("Not found", { status: 404 }));
