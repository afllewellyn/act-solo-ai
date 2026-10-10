/** Voices that are no longer offered; saved selections fall back to the default. */
export const REMOVED_VOICE_IDS = ['9BWtsMINqrJLrRacOk9x']; // Aria

/** Default scene-partner voice (Sarah). */
export const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

export const isRemovedVoice = (voiceId: string | undefined | null): boolean =>
  !!voiceId && REMOVED_VOICE_IDS.includes(voiceId);

/** Map a saved voice id to one that is still offered. */
export const resolveVoiceId = (voiceId: string | undefined | null): string =>
  !voiceId || isRemovedVoice(voiceId) ? DEFAULT_VOICE_ID : voiceId;
