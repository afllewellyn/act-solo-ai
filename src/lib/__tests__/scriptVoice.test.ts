import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_KEY,
  buildCharactersForSave,
  getNamedCharacters,
  getSavedVoice,
  withSavedVoice,
} from '@/lib/scriptVoice';
import { detectCharacterRoles } from '@/lib/scriptMeta';
import { DEFAULT_VOICE_ID } from '@/lib/voices';

const MAYA = { name: 'MAYA', voice: 'voice-maya', isUserRole: true };
const DANIEL = { name: 'DANIEL', voice: 'voice-daniel', isUserRole: false };
const SAVED = { name: DEFAULT_VOICE_KEY, voice: 'voice-picked' };

describe('getNamedCharacters', () => {
  it('strips the reserved __default entry', () => {
    expect(getNamedCharacters([MAYA, SAVED, DANIEL])).toEqual([MAYA, DANIEL]);
  });

  it('returns an empty list for a __default-only list', () => {
    expect(getNamedCharacters([SAVED])).toEqual([]);
  });

  it('returns an empty list for non-array input', () => {
    expect(getNamedCharacters(null)).toEqual([]);
    expect(getNamedCharacters(undefined)).toEqual([]);
    expect(getNamedCharacters('MAYA')).toEqual([]);
    expect(getNamedCharacters({ name: 'MAYA' })).toEqual([]);
  });

  it('ignores entries that are not objects', () => {
    expect(getNamedCharacters([null, 'MAYA', 3, MAYA])).toEqual([MAYA]);
  });
});

describe('getSavedVoice', () => {
  it('reads the voice from the reserved entry', () => {
    expect(getSavedVoice([MAYA, SAVED])).toBe('voice-picked');
  });

  it('is undefined when there is no reserved entry', () => {
    expect(getSavedVoice([MAYA, DANIEL])).toBeUndefined();
  });

  it('is undefined when the reserved entry has no voice', () => {
    expect(getSavedVoice([{ name: DEFAULT_VOICE_KEY }])).toBeUndefined();
    expect(getSavedVoice([{ name: DEFAULT_VOICE_KEY, voice: '' }])).toBeUndefined();
  });

  it('is undefined for non-array input', () => {
    expect(getSavedVoice(null)).toBeUndefined();
    expect(getSavedVoice(undefined)).toBeUndefined();
    expect(getSavedVoice('voice-picked')).toBeUndefined();
  });
});

describe('withSavedVoice', () => {
  it('round-trips the voice and keeps the named characters', () => {
    const saved = withSavedVoice([MAYA, DANIEL], 'voice-picked');
    expect(getSavedVoice(saved)).toBe('voice-picked');
    expect(getNamedCharacters(saved)).toEqual([MAYA, DANIEL]);
  });

  it('replaces an existing reserved entry instead of adding a second one', () => {
    const saved = withSavedVoice([MAYA, SAVED], 'voice-new');
    expect(saved.filter((c) => c.name === DEFAULT_VOICE_KEY)).toEqual([
      { name: DEFAULT_VOICE_KEY, voice: 'voice-new' },
    ]);
    expect(getSavedVoice(saved)).toBe('voice-new');
  });

  it('works on a __default-only list', () => {
    expect(withSavedVoice([SAVED], 'voice-new')).toEqual([{ name: DEFAULT_VOICE_KEY, voice: 'voice-new' }]);
  });

  it('works on non-array input', () => {
    expect(withSavedVoice(null, 'voice-new')).toEqual([{ name: DEFAULT_VOICE_KEY, voice: 'voice-new' }]);
    expect(withSavedVoice(undefined, 'voice-new')).toEqual([{ name: DEFAULT_VOICE_KEY, voice: 'voice-new' }]);
  });

  it('does not mutate its input', () => {
    const input = [MAYA, SAVED];
    withSavedVoice(input, 'voice-new');
    expect(input).toEqual([MAYA, SAVED]);
  });
});

describe('buildCharactersForSave', () => {
  const detected = [
    { name: 'MAYA', role: 'you' as const },
    { name: 'DANIEL', role: 'ai' as const },
  ];

  it('keeps the __default entry when a script is edited', () => {
    const result = buildCharactersForSave([MAYA, DANIEL, SAVED], detected, DEFAULT_VOICE_ID);
    expect(getSavedVoice(result)).toBe('voice-picked');
    expect(result.filter((c) => c.name === DEFAULT_VOICE_KEY)).toHaveLength(1);
  });

  it('never replaces the saved voice with the default voice id', () => {
    const result = buildCharactersForSave([SAVED], detected, DEFAULT_VOICE_ID);
    expect(getSavedVoice(result)).toBe('voice-picked');
    expect(getSavedVoice(result)).not.toBe(DEFAULT_VOICE_ID);
  });

  it('keeps each character\'s previously chosen voice', () => {
    const result = buildCharactersForSave([MAYA, DANIEL, SAVED], detected, DEFAULT_VOICE_ID);
    expect(getNamedCharacters(result)).toEqual([
      { name: 'MAYA', voice: 'voice-maya', isUserRole: true },
      { name: 'DANIEL', voice: 'voice-daniel', isUserRole: false },
    ]);
  });

  it('matches previous characters case-insensitively by name', () => {
    const previous = [{ name: 'Maya', voice: 'voice-maya' }, { name: 'daniel', voice: 'voice-daniel' }];
    const result = buildCharactersForSave(previous, detected, DEFAULT_VOICE_ID);
    expect(result.map((c) => c.voice)).toEqual(['voice-maya', 'voice-daniel']);
  });

  it('gives a new character the default voice and leaves the others alone', () => {
    const result = buildCharactersForSave(
      [MAYA, SAVED],
      [...detected, { name: 'ELLA', role: 'ai' as const }],
      DEFAULT_VOICE_ID,
    );
    expect(getNamedCharacters(result)).toEqual([
      { name: 'MAYA', voice: 'voice-maya', isUserRole: true },
      { name: 'DANIEL', voice: DEFAULT_VOICE_ID, isUserRole: false },
      { name: 'ELLA', voice: DEFAULT_VOICE_ID, isUserRole: false },
    ]);
    expect(getSavedVoice(result)).toBe('voice-picked');
  });

  it('updates the role from the text but keeps the voice', () => {
    const result = buildCharactersForSave([MAYA, SAVED], [{ name: 'MAYA', role: 'ai' }], DEFAULT_VOICE_ID);
    expect(getNamedCharacters(result)).toEqual([{ name: 'MAYA', voice: 'voice-maya', isUserRole: false }]);
  });

  it('drops a character that is no longer in the text', () => {
    const result = buildCharactersForSave([MAYA, DANIEL, SAVED], [{ name: 'MAYA', role: 'you' }], DEFAULT_VOICE_ID);
    expect(getNamedCharacters(result).map((c) => c.name)).toEqual(['MAYA']);
    expect(getSavedVoice(result)).toBe('voice-picked');
  });

  it('adds no __default entry for a new script (nothing existing)', () => {
    for (const existing of [undefined, null, []]) {
      const result = buildCharactersForSave(existing, detected, DEFAULT_VOICE_ID);
      expect(result).toEqual([
        { name: 'MAYA', voice: DEFAULT_VOICE_ID, isUserRole: true },
        { name: 'DANIEL', voice: DEFAULT_VOICE_ID, isUserRole: false },
      ]);
      expect(getSavedVoice(result)).toBeUndefined();
    }
  });

  it('adds no __default entry when the existing list never had one', () => {
    const result = buildCharactersForSave([MAYA, DANIEL], detected, DEFAULT_VOICE_ID);
    expect(result.some((c) => c.name === DEFAULT_VOICE_KEY)).toBe(false);
  });

  it('still keeps __default after every NAME: line is removed', () => {
    const noNames = detectCharacterRoles('<p>Just a monologue with no speaker labels.</p>');
    expect(noNames).toEqual([]);
    const result = buildCharactersForSave([MAYA, DANIEL, SAVED], noNames, DEFAULT_VOICE_ID);
    expect(result).toEqual([{ name: DEFAULT_VOICE_KEY, voice: 'voice-picked' }]);
  });

  it('returns an empty list for a new script with no characters', () => {
    expect(buildCharactersForSave(undefined, [], DEFAULT_VOICE_ID)).toEqual([]);
  });

  it('survives a repeated edit and save', () => {
    const first = buildCharactersForSave([SAVED], detected, DEFAULT_VOICE_ID);
    const second = buildCharactersForSave(first, detected, DEFAULT_VOICE_ID);
    const third = buildCharactersForSave(second, [], DEFAULT_VOICE_ID);
    expect(getSavedVoice(second)).toBe('voice-picked');
    expect(getSavedVoice(third)).toBe('voice-picked');
  });

  it('works with real detected characters from the editor HTML', () => {
    const html = '<p><strong>MAYA: Hi.</strong></p><p><em>Daniel: Hello.</em></p>';
    const result = buildCharactersForSave([MAYA, SAVED], detectCharacterRoles(html), DEFAULT_VOICE_ID);
    expect(result).toEqual([
      { name: 'MAYA', voice: 'voice-maya', isUserRole: true },
      { name: 'DANIEL', voice: DEFAULT_VOICE_ID, isUserRole: false },
      { name: DEFAULT_VOICE_KEY, voice: 'voice-picked' },
    ]);
  });

  it('does not mutate the existing list', () => {
    const existing = [MAYA, SAVED];
    buildCharactersForSave(existing, detected, DEFAULT_VOICE_ID);
    expect(existing).toEqual([MAYA, SAVED]);
  });
});
