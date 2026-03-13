

# Fix: CORS 403 Errors for actsolo.ai Production Domain

## Problem

The edge function logs confirm `https://actsolo.ai` is being rejected with "Forbidden origin" on every TTS request. The `ALLOWED_ORIGINS` secret exists but its value is either empty, malformed, or missing the correct domain string. This blocks all TTS, voice loading, and agent token requests from production.

## Root Cause

The `getCorsHeaders()` function in each edge function reads `ALLOWED_ORIGINS`, splits by comma, and does an exact string match. If the secret value has any issue (trailing slash, missing `https://`, extra spaces, wrong value), the match fails silently and returns empty CORS headers, triggering a 403.

## Solution

Hardcode the production domains (`https://actsolo.ai` and `https://www.actsolo.ai`) directly in the `getCorsHeaders()` function across all four affected edge functions. This eliminates dependency on a potentially misconfigured secret while keeping the secret as an additional source of allowed origins.

## Changes

### 1. Update `supabase/functions/text-to-speech/index.ts`
Add `https://actsolo.ai` and `https://www.actsolo.ai` as explicitly allowed origins in `getCorsHeaders()`.

### 2. Update `supabase/functions/get-voices/index.ts`
Same change to `getCorsHeaders()`.

### 3. Update `supabase/functions/eleven-agent-token/index.ts`
Same change to `getCorsHeaders()`.

### 4. Update `supabase/functions/health-realtime/index.ts`
Add the same pattern matching for Lovable domains and production domains (this function currently only checks exact match from the secret).

### 5. Re-set `ALLOWED_ORIGINS` secret
Set the secret value to the correct comma-separated list: `https://actsolo.ai,https://www.actsolo.ai`

This two-pronged approach (hardcoded + secret) ensures the fix works immediately and is resilient against future secret misconfigurations.

## Technical Detail

The updated `getCorsHeaders` will look like:

```text
const isAllowed = origin && (
  allowedOrigins.includes(origin) ||
  origin.endsWith('.lovableproject.com') ||
  origin.endsWith('.lovable.app') ||
  origin === 'https://actsolo.ai' ||
  origin === 'https://www.actsolo.ai'
);
```

Edge functions auto-deploy on save, so changes take effect immediately.

