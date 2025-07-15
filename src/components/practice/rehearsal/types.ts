/**
 * Character data structure for script roles
 */
export interface Character {
  name: string; // Character name (must match script format: "NAME:")
  voice: string; // Assigned ElevenLabs voice ID for this character
  isUserRole: boolean; // Whether this character is played by the user (not AI)
}

/**
 * Text filter options for selective script reading
 */
export type TextFilter = 'all' | 'bold' | 'italic';

/**
 * Props for RehearsalMode hook
 * Manages interactive back-and-forth script rehearsal with voice recognition
 */
export interface RehearsalModeProps {
  scriptContent: string; // Full script content with HTML formatting
  characters: Character[]; // Character assignments for voice roles
  selectedVoice: string; // Default ElevenLabs voice for AI lines
  playbackSpeed: number; // TTS playback speed (0.5x - 2x)
  textFilter: TextFilter; // Which parts of the script to read aloud
  isActive: boolean; // Whether rehearsal mode is currently active
  onComplete: () => void; // Callback when script rehearsal is finished
  onStop: () => void; // Callback when rehearsal is stopped/cancelled
}

/**
 * Parsed script line object
 */
export interface ScriptLine {
  type: 'actor' | 'ai';
  content: string;
  dialogue: string;
}