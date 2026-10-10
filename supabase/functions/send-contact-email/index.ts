import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactRequest {
  name: string;
  email: string;
  message: string;
  /** Honeypot: hidden in the form, so only bots fill it in. */
  website?: string;
}

// Escape user text before it goes into the HTML email (prevents injected links/images/markup).
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Soft per-IP limit (in-memory, per function instance) to protect the inbox and Resend quota.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const isRateLimited = (clientId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(clientId);
  if (!limit || now > limit.resetTime) {
    rateLimits.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (limit.count >= RATE_LIMIT_MAX) return true;
  limit.count++;
  return false;
};

// Prefer the platform-set client IP; for x-forwarded-for take the last hop (the first can be client-supplied).
const getClientId = (req: Request): string => {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",").pop()!.trim();
  return "unknown";
};

function validateInput(body: ContactRequest): string | null {
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return "Name is required";
  }
  if (body.name.trim().length > 100) {
    return "Name must be 100 characters or less";
  }
  if (!body.email || typeof body.email !== "string" || body.email.trim().length === 0) {
    return "Email is required";
  }
  if (body.email.trim().length > 255) {
    return "Email must be 255 characters or less";
  }
  if (!EMAIL_REGEX.test(body.email.trim())) {
    return "Invalid email format";
  }
  if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
    return "Message is required";
  }
  if (body.message.trim().length > 2000) {
    return "Message must be 2000 characters or less";
  }
  return null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    if (isRateLimited(getClientId(req))) {
      return new Response(
        JSON.stringify({ error: "Too many messages. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[send-contact-email] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body: ContactRequest = await req.json();

    // Honeypot filled in => a bot. Pretend it worked so it learns nothing, and send nothing.
    if (typeof body.website === "string" && body.website.trim().length > 0) {
      console.log("[send-contact-email] Honeypot triggered; dropping submission");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[send-contact-email] Received contact form submission");

    const validationError = validateInput(body);
    if (validationError) {
      console.log("[send-contact-email] Validation failed:", validationError);
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const name = body.name.trim();
    const email = body.email.trim();
    const message = body.message.trim();

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);

    const resend = new Resend(apiKey);

    const emailResponse = await resend.emails.send({
      from: "ActSolo <onboarding@resend.dev>",
      to: ["afllewellyn@gmail.com"],
      replyTo: email,
      subject: `ActSolo Contact: ${name.replace(/[\r\n]+/g, " ")}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <hr />
        <p><strong>Message:</strong></p>
        <p>${safeMessage.replace(/\n/g, "<br />")}</p>
        <hr />
        <p style="color: #888; font-size: 12px;">
          Sent from the ActSolo contact form. Reply directly to this email to respond to ${safeName}.
        </p>
      `,
    });

    console.log("[send-contact-email] Email sent successfully:", JSON.stringify(emailResponse));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("[send-contact-email] Error:", error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: "Failed to send message. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
