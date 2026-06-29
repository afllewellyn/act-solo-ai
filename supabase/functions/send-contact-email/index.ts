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
}

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
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[send-contact-email] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body: ContactRequest = await req.json();
    console.log("[send-contact-email] Received contact form submission from:", body.email);

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

    const resend = new Resend(apiKey);

    const emailResponse = await resend.emails.send({
      from: "ActSolo <onboarding@resend.dev>",
      to: ["afllewellyn@gmail.com"],
      replyTo: email,
      subject: `ActSolo Contact: ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <hr />
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br />")}</p>
        <hr />
        <p style="color: #888; font-size: 12px;">
          Sent from the ActSolo contact form. Reply directly to this email to respond to ${name}.
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
