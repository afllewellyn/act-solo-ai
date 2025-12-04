import { getScriptLines } from '@/components/practice/rehearsal/scriptParser';

/**
 * Core interfaces for the rehearsal state machine
 */
export interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

export type TextFilter = 'all' | 'italic';
export type RehearsalState = 'IDLE' | 'WAITING_FOR_ACTOR_CUE' | 'AI_SPEAKING' | 'TRANSITIONING' | 'COMPLETE';

export interface ScriptLine {
  type: 'actor' | 'ai';
  content: string;
  dialogue: string;
}

export interface RehearsalStateMachineConfig {
  scriptContent: string;
  characters: Character[];
  textFilter?: TextFilter;
  onStateChange?: (state: RehearsalState) => void;
  onLineChange?: (lineIndex: number, line: ScriptLine | null) => void;
  onCueWordsChange?: (cueWords: string[]) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onScriptUpdated?: (hasContent: boolean) => void;
  onNoMatches?: (filter: TextFilter) => void;
}

/**
 * Script Rehearsal State Machine
 * 
 * Centralized state management for script rehearsal flow.
 * Handles line progression, state transitions, and event coordination.
 */
export class ScriptRehearsalStateMachine {
  private config: RehearsalStateMachineConfig;
  private state: RehearsalState = 'IDLE';
  private currentLineIndex = 0;
  private scriptLines: ScriptLine[] = [];
  private currentCueWords: string[] = [];
  private stopRequested = false;
  private textFilter: TextFilter = 'all';

  constructor(config: RehearsalStateMachineConfig) {
    this.config = config;
    this.textFilter = config.textFilter ?? 'all';
    this.initialize();
  }

  private initialize() {
    this.parseScript();
    console.log(`🎭 State Machine: Initialized with ${this.scriptLines.length} lines`);
  }

  private parseScript() {
    // Use simplified text-based parsing
    this.scriptLines = getScriptLines(
      this.config.scriptContent,
      this.textFilter
    );
    
    console.log(`🎭 State Machine: Parsed ${this.scriptLines.length} lines for rehearsal (filter: ${this.textFilter})`);
    
    // Check if we have content and emit appropriate events
    if (this.scriptLines.length === 0) {
      console.log(`📝 No script content found`);
      this.config.onScriptUpdated?.(false);
    } else {
      this.config.onScriptUpdated?.(true);
    }
  }

  /**
   * Start the rehearsal state machine
   */
  start(): void {
    if (this.state !== 'IDLE') {
      console.warn('State machine already running');
      return;
    }

    console.log('🎭 State Machine: Starting rehearsal');
    this.stopRequested = false;
    this.currentLineIndex = 0;
    this.setState('TRANSITIONING');
    
    // Add small delay to ensure proper initialization
    setTimeout(() => {
      if (!this.stopRequested) {
        this.processCurrentLine();
      }
    }, 100);
  }

  /**
   * Stop the rehearsal immediately
   */
  stop(): void {
    console.log('🛑 State Machine: Emergency stop requested');
    this.stopRequested = true;
    this.setState('IDLE');
    this.currentLineIndex = 0;
    this.currentCueWords = [];
    this.config.onCueWordsChange?.([]);
  }

  /**
   * Advance to the next line
   */
  advanceToNextLine(): void {
    if (this.stopRequested) return;

    this.currentLineIndex++;
    console.log(`⏭️ State Machine: Advanced to line ${this.currentLineIndex}/${this.scriptLines.length}`);
    console.log(`⏭️ Previous state: ${this.state}`);
    
    this.setState('TRANSITIONING');
    
    // Small delay to allow UI updates
    setTimeout(() => {
      if (!this.stopRequested) {
        this.processCurrentLine();
      }
    }, 100);
  }

  /**
   * Handle actor cue detection
   */
  handleActorCueDetected(): void {
    console.log('✅ State Machine: Actor cue DETECTED - advancing');
    console.log('✅ Previous state:', this.state);
    
    if (this.stopRequested || this.state !== 'WAITING_FOR_ACTOR_CUE') {
      console.warn('⚠️ Cue detected but state is not WAITING_FOR_ACTOR_CUE:', this.state);
      return;
    }

    console.log('✅ Advancing to next line...');
    this.advanceToNextLine();
  }

  /**
   * Handle actor timeout
   */
  handleActorTimeout(): void {
    if (this.stopRequested || this.state !== 'WAITING_FOR_ACTOR_CUE') return;

    console.log('⏰ State Machine: Actor timeout');
    this.advanceToNextLine();
  }

  /**
   * Handle AI speech completion
   */
  handleAISpeechComplete(): void {
    if (this.stopRequested || this.state !== 'AI_SPEAKING') return;

    console.log('✅ State Machine: AI speech completed');
    this.advanceToNextLine();
  }

  /**
   * Process the current line based on type
   */
  private processCurrentLine(): void {
    if (this.stopRequested) return;

    if (this.currentLineIndex >= this.scriptLines.length) {
      console.log('🎯 State Machine: Rehearsal complete!');
      this.setState('COMPLETE');
      this.config.onComplete?.();
      return;
    }

    const currentLine = this.scriptLines[this.currentLineIndex];
    console.log(`📝 State Machine: Processing line ${this.currentLineIndex}: ${currentLine.type}`);

    // Notify listeners of line change
    this.config.onLineChange?.(this.currentLineIndex, currentLine);

    if (currentLine.type === 'actor') {
      this.handleActorLine(currentLine);
    } else if (currentLine.type === 'ai') {
      this.handleAILine(currentLine);
    }
  }

  /**
   * Handle actor line - extract cues and wait for actor
   */
  private handleActorLine(line: ScriptLine): void {
    console.log('👤 State Machine: Processing actor line');
    console.log('👤 Line content:', line.content.substring(0, 100));
    
    const cueWords = this.extractCueWords(line.content);
    console.log('👤 Extracted cue words:', cueWords);
    
    this.currentCueWords = cueWords;
    this.config.onCueWordsChange?.(cueWords);
    
    this.setState('WAITING_FOR_ACTOR_CUE');
    
    console.log('⏸️ State Machine: PAUSED - waiting for actor cue detection');
    console.log('⏸️ Current state:', this.state);
    console.log('⏸️ Will only advance when handleActorCueDetected() is called');
    
    // CRITICAL: The state machine MUST wait here for actor cue detection
    // AudioManager should start listening via onCueWordsChange callback
    // State machine will only advance when handleActorCueDetected() is called
  }

  /**
   * Handle AI line - transition to speaking state
   */
  private handleAILine(line: ScriptLine): void {
    console.log('🤖 State Machine: Processing AI line');
    
    this.currentCueWords = [];
    this.config.onCueWordsChange?.([]);
    
    this.setState('AI_SPEAKING');
    
    // CRITICAL: Do not trigger TTS here - let the onLineChange callback handle it
    // This ensures proper state management and prevents race conditions
  }

  /**
   * Extract cue words from actor line
   */
  private extractCueWords(lineText: string): string[] {
    // Remove character name prefix (e.g., "ACTOR: ")
    const cleanText = lineText
      .replace(/^[A-Z][A-Z\s\-\'\.]+:\s*/, '')  // Remove "NAME: " prefix
      .replace(/<[^>]*>/g, ' ')                  // Remove HTML tags
      .replace(/\s+/g, ' ')                       // Normalize whitespace
      .trim();
    
    // Split into words and filter empty strings
    const words = cleanText.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) {
      console.warn('⚠️ No words found in actor line');
      return [];
    }
    
    // Get the very last word and remove punctuation
    const lastWord = words[words.length - 1]
      .replace(/[.,!?;:'"()]/g, '')  // Strip punctuation
      .trim();
    
    console.log(`🎯 Cue word extracted: "${lastWord}" from line: "${cleanText}"`);
    
    return lastWord.length > 0 ? [lastWord] : [];
  }

  /**
   * Set state and notify listeners
   */
  private setState(newState: RehearsalState): void {
    if (this.state === newState) return;
    
    console.log(`🔄 State Machine: ${this.state} → ${newState}`);
    this.state = newState;
    this.config.onStateChange?.(newState);
  }

  /**
   * Set text filter and re-parse the script
   */
  setTextFilter(filter: TextFilter): void {
    if (this.textFilter === filter) return;
    
    console.log(`🔄 State Machine: Text filter changed to ${filter} - reparsing script`);
    this.textFilter = filter;
    
    // Re-parse script with new filter
    this.parseScript();
    
    // Keep currentLineIndex within bounds if script shrunk
    if (this.currentLineIndex >= this.scriptLines.length) {
      this.currentLineIndex = Math.max(0, this.scriptLines.length - 1);
    }
    
    // Clear cue words since current line might have changed
    this.currentCueWords = [];
    this.config.onCueWordsChange?.([]);
    
    // Notify listeners about the current line
    const currentLine = this.scriptLines[this.currentLineIndex] || null;
    this.config.onLineChange?.(this.currentLineIndex, currentLine);
    
    // Check if new filter has no matches
    if (this.scriptLines.length === 0) {
      console.log(`⚠️ No lines match filter: ${filter}`);
      this.config.onNoMatches?.(filter);
      this.config.onScriptUpdated?.(false);
    } else {
      this.config.onScriptUpdated?.(true);
    }
    
    // If rehearsal is running, update state for current line
    if (this.state !== 'IDLE') {
      this.processCurrentLine();
    }
  }

  // Getters
  getState(): RehearsalState { return this.state; }
  getCurrentLineIndex(): number { return this.currentLineIndex; }
  getCurrentLine(): ScriptLine | null { 
    return this.scriptLines[this.currentLineIndex] || null; 
  }
  getCurrentCueWords(): string[] { return [...this.currentCueWords]; }
  getTotalLines(): number { return this.scriptLines.length; }
  getTextFilter(): TextFilter { return this.textFilter; }
}