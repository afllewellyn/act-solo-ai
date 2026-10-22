# PostHog Replay Vision report

## Recording
- Server-side session recording enabled for project 306156 (`session_recording_opt_in: true`).
- `posthog-js` 1.438.15 added; `src/lib/posthog.ts` is initialized from `src/main.tsx`.
- `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` override the defaults; if unset, init falls back to the public project token and the US host, so deployed builds record without extra env configuration.
- Privacy: all text and inputs are masked, and request/response bodies, headers, console logs and performance capture are disabled locally so script dialogue is never sent.

## Scanners (all enabled, model gemini-3.5-flash-lite, 2 credits/observation)
| Name | Type | Watches | Sampling | Credit cap | Est. monthly |
| --- | --- | --- | --- | --- | --- |
| Practice flow breakage monitor | monitor | sessions with a `$pageview` on `/practice/` | balanced, 100% | 600 | 0 (no recordings yet) |
| User frustration monitor | monitor | sessions with `$rageclick` | balanced, 100% | 300 | 0 |
| Session summaries | summarizer | all sessions | balanced, 25% | 300 | 0 |

Estimates are 0 because no matching recordings exist yet; the 1,200-credit combined cap bounds spend against the 2,500 monthly free credits.

## Skipped / deferred
- The step skills named in the spell book (`replay-vision-*`) were not downloaded; scanners were written from the repo and the scanner tool schemas.
- `npm audit fix` (non-forced) was run: 67 -> 38 vulnerabilities, critical cleared. Remaining need breaking upgrades.

## Where results appear
Replay Vision in PostHog: https://us.posthog.com/project/306156/replay-vision. First observations arrive as new recordings complete. Rate observations thumbs up/down to tune each scanner.
