/**
 * Character data structure for script roles - Simplified
 * NOTE: Character roles are no longer used for text filtering
 */
export interface Character {
  name: string; // Character name (for display only)
  voice: string; // Assigned ElevenLabs voice ID
  isUserRole: boolean; // Deprecated: Not used in text-based filtering
}

/**
 * Text filter options for selective script reading
 * - 'italic': AI reads italic lines, user reads bold lines (rehearsal mode)
 * - 'all': AI reads entire script (listen mode)
 */
export type TextFilter = 'all' | 'italic';

/**
 * Props for RehearsalMode hook - Simplified for text-based filtering
 * No longer requires character role assignments
 */
export interface RehearsalModeProps {
  scriptContent: string; // Full script content with HTML formatting
  selectedVoice: string; // ElevenLabs voice for all AI text
  playbackSpeed: number; // TTS playback speed (0.5x - 2x)
  textFilter: TextFilter; // Which parts of the script to read aloud (bold/italic/all)
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