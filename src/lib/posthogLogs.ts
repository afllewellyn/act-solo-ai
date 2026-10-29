import posthog from 'posthog-js';

// Structured logs to PostHog Logs. Attributes must be short ids, enums, counts or error
// names: never script text, titles, transcripts or emails (scripts are user content).
// Console capture is deliberately off in posthog.ts, so only these calls are sent.

type Attributes = Record<string, string | number | boolean | undefined>;
type Level = 'info' | 'warn' | 'error';

function send(level: Level, message: string, attributes?: Attributes) {
  // Analytics must never break the app.
  try {
    posthog.logger[level](message, attributes);
  } catch {
    /* ignore */
  }
}

export const log = {
  info: (message: string, attributes?: Attributes) => send('info', message, attributes),
  warn: (message: string, attributes?: Attributes) => send('warn', message, attributes),
  error: (message: string, attributes?: Attributes) => send('error', message, attributes),
};

// Error messages can embed user content, so only the class name is logged.
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
