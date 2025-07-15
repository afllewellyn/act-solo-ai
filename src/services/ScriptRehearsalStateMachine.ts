import { ScriptParserService } from './ScriptParserService';

/**
 * Core interfaces for the rehearsal state machine
 */
export interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

export type TextFilter = 'all' | 'bold' | 'italic';
export type RehearsalState = 'IDLE' | 'WAITING_FOR_ACTOR_CUE' | 'AI_SPEAKING' | 'TRANSITIONING' | 'COMPLETE';

export interface ScriptLine {
  type: 'actor' | 'ai';
  content: string;
  dialogue: string;
}

export interface RehearsalStateMachineConfig {
  scriptContent: string;
  characters: Character[];
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
    this.initialize();
  }

  private initialize() {
    this.parseScript();
    console.log(`🎭 State Machine: Initialized with ${this.scriptLines.length} lines`);
  }

  private parseScript() {
    this.scriptLines = ScriptParserService.parseScriptLines(
      this.config.scriptContent,
      this.config.characters,
      this.textFilter
    );
    
    // Check if we have content and emit appropriate events
    if (this.scriptLines.length === 0) {
      console.log(`📝 No content found for filter: ${this.textFilter}`);
      this.config.onNoMatches?.(this.textFilter);
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
    this.processCurrentLine();
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
    console.log(`⏭️ State Machine: Advanced to line ${this.currentLineIndex}`);
    
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
    if (this.stopRequested || this.state !== 'WAITING_FOR_ACTOR_CUE') return;

    console.log('🎭 State Machine: Actor cue detected');
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
    
    const cueWords = this.extractCueWords(line.content);
    this.currentCueWords = cueWords;
    this.config.onCueWordsChange?.(cueWords);
    
    this.setState('WAITING_FOR_ACTOR_CUE');
  }

  /**
   * Handle AI line - transition to speaking state
   */
  private handleAILine(line: ScriptLine): void {
    console.log('🤖 State Machine: Processing AI line');
    
    this.currentCueWords = [];
    this.config.onCueWordsChange?.([]);
    
    this.setState('AI_SPEAKING');
  }

  /**
   * Extract cue words from actor line
   */
  private extractCueWords(lineText: string): string[] {
    const cleanText = lineText
      .replace(/^[A-Z][A-Z\s\-\'\.]+:\s*/, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanText.split(' ').filter(word => word.length > 1);
    const fillerWords = ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as'];
    const meaningfulWords = words.filter(word => 
      !fillerWords.includes(word.toLowerCase()) && word.length > 2
    );
    
    if (meaningfulWords.length >= 2) {
      return [meaningfulWords.slice(-2).join(' ')];
    } else if (meaningfulWords.length === 1) {
      return [meaningfulWords[0]];
    } else {
      return words.slice(-2);
    }
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
   * Set text filter and re-parse script
   */
  setTextFilter(filter: TextFilter): void {
    if (this.textFilter === filter) return;
    
    console.log(`🔄 State Machine: Changing text filter from ${this.textFilter} to ${filter}`);
    this.textFilter = filter;
    
    // Re-parse the script with new filter
    this.parseScript();
    
    // If rehearsal is active, restart from beginning
    if (this.state !== 'IDLE') {
      this.currentLineIndex = 0;
      this.currentCueWords = [];
      this.config.onCueWordsChange?.([]);
      this.setState('TRANSITIONING');
      setTimeout(() => {
        if (!this.stopRequested) {
          this.processCurrentLine();
        }
      }, 100);
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