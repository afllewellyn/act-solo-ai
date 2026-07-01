## QA Summary — All Verified

**1. Practice route auth redirect (high)**
- Signed-out visit to `/practice/abc-123` now redirects to `http://localhost:8080/login` (verified via headless browser).

**2. Back / Scripts navigation (medium)**
- Breadcrumb link, Back button, and fetch-error fallback in `src/pages/Practice.tsx` all point to `/manage-scripts` (verified in source).

**3. TS build error in `useSpeechRecognition.tsx`**
- Removed the redundant `SpeechRecognitionEvent` and `SpeechRecognitionErrorEvent` interface redeclarations that conflicted with TypeScript's built-in DOM lib types.
- `npx tsgo --noEmit -p tsconfig.app.json` → exit 0, no errors.

## Nothing left to change

No further code edits proposed. Approve this plan to acknowledge, or tell me the next thing to tackle (e.g., publish, run an SEO/security scan, or work on another feature).