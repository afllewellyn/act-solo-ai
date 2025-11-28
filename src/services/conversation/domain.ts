/**
 * Domain types for script rehearsal conversation
 * Phase 1: Domain definitions
 */

/**
 * Script cue for conversation context
 */
export interface Cue {
  text: string;           // Full cue text
  characterName: string;  // Who speaks this cue
  cueWords: string[];     // Keywords for detection
  nextLine: string;       // What agent should say next
  lineNumber: number;     // Position in script
  isUserLine: boolean;    // True if user speaks this line
}

/**
 * Script context sent to conversation engine
 * Enables domain-aware responses
 */
export interface ScriptContext {
  scriptTitle: string;
  scene?: string;           // Current scene identifier
  currentLine: number;      // Current line position
  totalLines: number;       // Total lines for progress
  currentCue?: Cue;
  nextCue?: Cue;            // Immediate next cue
  upcomingCues: Cue[];      // Lookahead (2-3 cues)
  sessionStartTime: number;
  customInstructions?: string; // Additional prompts
}

/**
 * Configuration for conversation engine
 */
export interface ConversationEngineConfig {
  agentId?: string;       // ElevenLabs agent ID
  voiceId?: string;       // Fallback voice ID
  language?: string;      // Default: 'en'
  enableTranscription?: boolean;   // Enable user speech transcription
  enableInterruption?: boolean;    // Allow interruption handling
  initialContext?: ScriptContext;  // Initial script context
  customInstructions?: string;
}
