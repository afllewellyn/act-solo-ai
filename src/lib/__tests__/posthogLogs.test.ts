import { describe, it, expect, vi, beforeEach } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { logger } }));

import { log, errorName } from '../posthogLogs';

describe('posthogLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards level, message and attributes to posthog.logger', () => {
    log.warn('Sign-in failed', { method: 'email', status: 400 });
    expect(logger.warn).toHaveBeenCalledWith('Sign-in failed', { method: 'email', status: 400 });
  });

  it('never throws when PostHog throws', () => {
    logger.error.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => log.error('x')).not.toThrow();
  });

  it('errorName returns the class name, not the message', () => {
    expect(errorName(new TypeError('Hamlet: to be or not to be'))).toBe('TypeError');
    expect(errorName('plain string')).toBe('string');
  });
});
