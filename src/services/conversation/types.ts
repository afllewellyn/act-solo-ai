/**
 * ConversationEngine abstraction - Provider-agnostic interface
 * Phase 1: Core type definitions
 */

import type { ScriptContext, ConversationEngineConfig } from './domain';

/**
 * Conversation engine lifecycle states
 */
export type ConversationStatus = 
  | 'idle'         // Not started
  | 'connecting'   // Establishing connection
  | 'ready'        // Connected and ready
  | 'error'        // Error state
  | 'disconnected'; // Cleanly disconnected

/**
 * Control commands sent to the engine
 */
export type ConversationControlCommand = 
  | { type: 'pause_agent' }
  | { type: 'resume_agent' }
  | { type: 'clear_buffer' }
  | { type: 'interrupt' };

/**
 * Normalized conversation events (provider-agnostic)
 */
export type ConversationEvent =
  | UserSpeechStartedEvent
  | UserSpeechEndedEvent
  | AgentResponseStartedEvent
  | AgentResponseDeltaEvent
  | AgentResponseEndedEvent
  | AgentResponseEvent
  | AgentAudioStartedEvent
  | AgentAudioDeltaEvent
  | AgentAudioEndedEvent
  | ToolCallEvent
  | ErrorEvent
  | StatusChangedEvent;

export interface UserSpeechStartedEvent {
  type: 'user_speech_started';
  timestamp: number;
}

export interface UserSpeechEndedEvent {
  type: 'user_speech_ended';
  timestamp: number;
  transcript?: string; // Optional transcript if available
}

export interface AgentResponseStartedEvent {
  type: 'agent_response_started';
  timestamp: number;
}

export interface AgentResponseDeltaEvent {
  type: 'agent_response_delta';
  delta: string; // Text chunk
  timestamp: number;
}

export interface AgentResponseEndedEvent {
  type: 'agent_response_ended';
  timestamp: number;
}

export interface AgentResponseEvent {
  type: 'agent_response';
  text: string; // Complete response text
  timestamp: number;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolName: string;
  parameters: Record<string, any>;
  timestamp: number;
}

export interface ErrorEvent {
  type: 'error';
  error: Error;
  timestamp: number;
}

export interface AgentAudioStartedEvent {
  type: 'agent_audio_started';
  timestamp: number;
}

export interface AgentAudioDeltaEvent {
  type: 'agent_audio_delta';
  audioData: ArrayBuffer;
  timestamp: number;
}

export interface AgentAudioEndedEvent {
  type: 'agent_audio_ended';
  timestamp: number;
}

export interface StatusChangedEvent {
  type: 'status_changed';
  status: ConversationStatus;
  previousStatus?: ConversationStatus;
  timestamp: number;
}

/**
 * Provider-agnostic ConversationEngine interface
 * 
 * All conversation engines (ElevenLabs, OpenAI, etc.) implement this interface.
 * UI components depend only on this interface, not on provider specifics.
 */
export interface ConversationEngine {
  /**
   * Start the conversation engine
   * Establishes connection, initializes audio streams
   */
  start(): Promise<void>;

  /**
   * Stop the conversation engine
   * Closes connections, releases audio resources
   */
  stop(): Promise<void>;

  /**
   * Send text message to the agent
   * @param text - Text to send
   */
  sendText(text: string): Promise<void>;

  /**
   * Update script context for domain-aware responses
   * @param context - Current script context (cues, notes, etc.)
   */
  updateContext(context: ScriptContext): Promise<void>;

  /**
   * Send control command to the engine
   * @param command - Control command (pause, resume, interrupt, reset)
   */
  sendControl(command: ConversationControlCommand): Promise<void>;

  /**
   * Subscribe to conversation events
   * @param callback - Event handler
   * @returns Unsubscribe function
   */
  onEvent(callback: (event: ConversationEvent) => void): () => void;

  /**
   * Get current engine status
   */
  getStatus(): ConversationStatus;
}
