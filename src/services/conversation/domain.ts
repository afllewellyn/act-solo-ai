/**
 * Domain types for script rehearsal conversation
 * Phase 1: Domain definitions
 */

/**
 * Agent role determines conversation behavior
 */
export type AgentRole = 
  | 'scene-partner'  // Reads other character's lines
  | 'coach';         // Provides feedback and guidance

/**
 * Performance note from coach
 */
export interface PerformanceNote {
  type: 'feedback' | 'encouragement' | 'correction';
  text: string;
  timestamp: number;
  lineReference?: string; // Which script line triggered this note
}

/**
 * Script cue for conversation context
 */
export interface Cue {
  text: string;           // Cue text to listen for
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
  currentCue?: Cue;
  upcomingCues: Cue[];    // Next 2-3 cues for context
  recentNotes: PerformanceNote[];
  sessionStartTime: number;
  agentRole: AgentRole;
  customInstructions?: string; // Additional prompts
}

/**
 * Configuration for conversation engine
 */
export interface ConversationEngineConfig {
  agentRole: AgentRole;
  agentId?: string;       // ElevenLabs agent ID
  voiceId?: string;       // Fallback voice ID
  language?: string;      // Default: 'en'
  enableFeedback?: boolean; // Coach provides notes
  customInstructions?: string;
}
