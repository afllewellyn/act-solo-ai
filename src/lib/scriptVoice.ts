/**
 * The AI scene-partner voice is remembered per script inside the existing
 * `scripts.characters` JSON column, as a reserved entry (no schema change).
 */
export const DEFAULT_VOICE_KEY = '__default';

type RawCharacter = { name?: string; voice?: string; [key: string]: unknown };

const asList = (raw: unknown): RawCharacter[] =>
  Array.isArray(raw) ? (raw as RawCharacter[]).filter(c => c && typeof c === 'object') : [];

/** Real (named) characters, without the reserved voice entry. */
export function getNamedCharacters(raw: unknown): RawCharacter[] {
  return asList(raw).filter(c => c.name !== DEFAULT_VOICE_KEY);
}

/** The voice saved for this script, if any. */
export function getSavedVoice(raw: unknown): string | undefined {
  return asList(raw).find(c => c.name === DEFAULT_VOICE_KEY)?.voice || undefined;
}

/** Characters JSON to save: the named characters plus the reserved voice entry. */
export function withSavedVoice(raw: unknown, voiceId: string): RawCharacter[] {
  return [...getNamedCharacters(raw), { name: DEFAULT_VOICE_KEY, voice: voiceId }];
}

const nameKey = (name: unknown): string => (typeof name === 'string' ? name.toUpperCase() : '');

/**
 * Characters JSON to save when a script's text is saved. The named characters
 * come from the text (`detected`), each keeping the voice previously chosen for
 * it (matched case-insensitively by name, else `defaultVoiceId`). The reserved
 * voice entry of the existing list is carried over untouched, so editing a
 * script can never lose or change its saved voice.
 */
export function buildCharactersForSave(
  existingRaw: unknown,
  detected: ReadonlyArray<{ name: string; role: string }>,
  defaultVoiceId: string,
): RawCharacter[] {
  const previous = getNamedCharacters(existingRaw);
  const named = detected.map((c) => ({
    name: c.name,
    voice: previous.find((p) => nameKey(p.name) === nameKey(c.name))?.voice || defaultVoiceId,
    isUserRole: c.role === 'you',
  }));
  const savedVoice = getSavedVoice(existingRaw);
  return savedVoice ? withSavedVoice(named, savedVoice) : named;
}
