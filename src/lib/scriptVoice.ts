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
