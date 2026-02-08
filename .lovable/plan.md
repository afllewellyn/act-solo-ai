

# Plan: Connect Contact Form to Resend (sending to afllewellyn@gmail.com)

## Overview
Wire up the contact form so submissions are emailed to **afllewellyn@gmail.com** via Resend, using a new Supabase Edge Function. Also simplify the Contact page layout as previously requested (remove the sidebar, full-width form).

## Prerequisites

Before I can build this, you will need:

1. **A Resend account** -- sign up free at [resend.com](https://resend.com)
2. **A Resend API key** -- create one at [resend.com/api-keys](https://resend.com/api-keys)
3. **Domain verification** -- either verify your own domain at [resend.com/domains](https://resend.com/domains), or use Resend's default test domain (`onboarding@resend.dev`) for initial testing

I will prompt you to securely store the `RESEND_API_KEY` as a Supabase secret before writing any code.

## Changes

### 1. Add `RESEND_API_KEY` Secret
Store the Resend API key as a Supabase secret so the edge function can access it.

### 2. Create Edge Function: `supabase/functions/send-contact-email/index.ts`
A public edge function that:
- Accepts POST requests with `name`, `email`, and `message`
- Validates all inputs server-side (non-empty, valid email, length limits)
- Sends an email via Resend **to afllewellyn@gmail.com**
- Sets **Reply-To** as the submitter's email so you can reply directly
- Uses your verified domain for the "from" address (or Resend's test domain)
- Returns success/error with proper CORS headers
- Includes logging for debugging

### 3. Update `supabase/config.toml`
Add the new function with `verify_jwt = false` (public contact form).

### 4. Update `src/pages/Contact.tsx`
- Remove the "Other ways to reach us" section and email sidebar
- Make the form full-width (single column layout)
- Remove the `Mail` icon import
- Add form state management with `useState`
- Add client-side Zod validation (name, email, message)
- Call edge function via `supabase.functions.invoke('send-contact-email', ...)`
- Show loading spinner on submit button
- Display success/error toast notifications
- Clear form on success

## Technical Details

### Email Configuration
- **To**: afllewellyn@gmail.com
- **From**: `ActSolo <noreply@yourdomain.com>` (your verified domain) or `onboarding@resend.dev` for testing
- **Reply-To**: the submitter's email address
- **Subject**: "ActSolo Contact: [submitter name]"

### Validation (Client + Server)
- **name**: required, 1-100 characters, trimmed
- **email**: required, valid email format, max 255 characters
- **message**: required, 1-2000 characters, trimmed

### Request Flow
```text
User fills form
      |
      v
Client-side Zod validation
      |
      v
supabase.functions.invoke('send-contact-email')
      |
      v
Edge Function validates inputs
      |
      v
Resend API sends email --> afllewellyn@gmail.com
      |
      v
Toast: "Message sent!" or error
```

