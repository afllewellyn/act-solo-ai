import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_ID, isRemovedVoice, resolveVoiceId } from '@/lib/voices';

describe('voices', () => {
  it('treats Aria as removed and falls back to the default', () => {
    expect(isRemovedVoice('9BWtsMINqrJLrRacOk9x')).toBe(true);
    expect(resolveVoiceId('9BWtsMINqrJLrRacOk9x')).toBe(DEFAULT_VOICE_ID);
    expect(resolveVoiceId(undefined)).toBe(DEFAULT_VOICE_ID);
  });

  it('keeps other voices', () => {
    expect(resolveVoiceId('CwhRBWXzGAHq8TQ4Fs17')).toBe('CwhRBWXzGAHq8TQ4Fs17');
  });
});
