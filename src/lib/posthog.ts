import posthog from 'posthog-js'

// The project token is public by design (write-only), like the Supabase anon key.
const key =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ||
  'phc_XtQnsnMxa9JMZYf0iDogUSz0kD8hytsyLFJRUkYihuo'
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

export function initPostHog() {
  if (!key) {
    if (import.meta.env.DEV) {
      console.error(
        'VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured',
      )
    }
    return
  }
  posthog.init(key, {
    api_host: host,
    defaults: '2025-05-24',
    capture_exceptions: true,
    session_recording: {
      // Scripts and rehearsal dialogue are user content: never send their text to PostHog.
      maskAllInputs: true,
      maskTextSelector: '*',
    },
  })
}
