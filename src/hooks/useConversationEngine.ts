/**
 * useConversationEngine - React hook for ConversationEngine lifecycle
 * Phase 3: React integration with factory pattern
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createConversationEngine } from '@/services/conversation/engineFactory';
import type { 
  ConversationEngine, 
  ConversationStatus, 
  ConversationEvent,
  ConversationControlCommand 
} from '@/services/conversation/types';
import type { ConversationEngineConfig, ScriptContext } from '@/services/conversation/domain';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface UseConversationEngineOptions {
  /** Called when user speech is detected */
  onUserSpeechStarted?: () => void;
  /** Called when user speech ends with optional transcript */
  onUserSpeechEnded?: (transcript?: string) => void;
  /** Called when agent starts responding */
  onAgentResponseStarted?: () => void;
  /** Called for each text chunk from agent */
  onAgentResponseDelta?: (delta: string) => void;
  /** Called when agent finishes responding */
  onAgentResponseEnded?: (fullText: string) => void;
  /** Called when agent audio starts playing */
  onAgentAudioStarted?: () => void;
  /** Called for each audio chunk from agent */
  onAgentAudioDelta?: (audioData: ArrayBuffer) => void;
  /** Called when agent audio finishes */
  onAgentAudioEnded?: () => void;
  /** Called on any error */
  onError?: (error: Error) => void;
  /** Called when status changes */
  onStatusChange?: (status: ConversationStatus) => void;
}

interface UseConversationEngineReturn {
  /** Current engine status */
  status: ConversationStatus;
  /** Whether the engine is currently active */
  isActive: boolean;
  /** Whether feature flag is enabled */
  isEnabled: boolean;
  /** Start the conversation engine */
  start: (config: ConversationEngineConfig) => Promise<void>;
  /** Stop the conversation engine */
  stop: () => Promise<void>;
  /** Send text to the agent */
  sendText: (text: string) => Promise<void>;
  /** Update script context */
  updateContext: (context: ScriptContext) => Promise<void>;
  /** Send control command */
  sendControl: (command: ConversationControlCommand) => Promise<void>;
}

export function useConversationEngine(
  options: UseConversationEngineOptions = {}
): UseConversationEngineReturn {
  const {
    onUserSpeechStarted,
    onUserSpeechEnded,
    onAgentResponseStarted,
    onAgentResponseDelta,
    onAgentResponseEnded,
    onAgentAudioStarted,
    onAgentAudioDelta,
    onAgentAudioEnded,
    onError,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<ConversationStatus>('idle');
  const engineRef = useRef<ConversationEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const responseBufferRef = useRef<string>('');

  // Check if feature flag is enabled
  const isEnabled = isFeatureEnabled('conversation_engine_eleven');

  // Handle events from the engine
  const handleEvent = useCallback((event: ConversationEvent) => {
    console.log('[useConversationEngine] Event:', event.type);

    switch (event.type) {
      case 'user_speech_started':
        onUserSpeechStarted?.();
        break;

      case 'user_speech_ended':
        onUserSpeechEnded?.(event.transcript);
        break;

      case 'agent_response_started':
        responseBufferRef.current = '';
        onAgentResponseStarted?.();
        break;

      case 'agent_response_delta':
        responseBufferRef.current += event.delta;
        onAgentResponseDelta?.(event.delta);
        break;

      case 'agent_response_ended':
        onAgentResponseEnded?.(responseBufferRef.current);
        responseBufferRef.current = '';
        break;

      case 'agent_response':
        // Complete response in single event
        onAgentResponseEnded?.(event.text);
        break;

      case 'agent_audio_started':
        onAgentAudioStarted?.();
        break;

      case 'agent_audio_delta':
        onAgentAudioDelta?.(event.audioData);
        break;

      case 'agent_audio_ended':
        onAgentAudioEnded?.();
        break;

      case 'status_changed':
        setStatus(event.status);
        onStatusChange?.(event.status);
        break;

      case 'error':
        onError?.(event.error);
        break;
    }
  }, [
    onUserSpeechStarted,
    onUserSpeechEnded,
    onAgentResponseStarted,
    onAgentResponseDelta,
    onAgentResponseEnded,
    onAgentAudioStarted,
    onAgentAudioDelta,
    onAgentAudioEnded,
    onError,
    onStatusChange,
  ]);

  // Start engine
  const start = useCallback(async (config: ConversationEngineConfig) => {
    if (!isEnabled) {
      console.warn('[useConversationEngine] Feature flag disabled, using stub engine');
    }

    if (engineRef.current) {
      console.warn('[useConversationEngine] Engine already running, stopping first');
      await stop();
    }

    try {
      setStatus('connecting');
      console.log('[useConversationEngine] Creating engine with config:', config);
      
      const engine = await createConversationEngine(config);
      engineRef.current = engine;

      // Subscribe to events
      unsubscribeRef.current = engine.onEvent(handleEvent);

      // Start the engine
      await engine.start();
      console.log('[useConversationEngine] Engine started successfully');
    } catch (error) {
      console.error('[useConversationEngine] Failed to start engine:', error);
      setStatus('error');
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [isEnabled, handleEvent, onError]);

  // Stop engine
  const stop = useCallback(async () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (engineRef.current) {
      try {
        await engineRef.current.stop();
        console.log('[useConversationEngine] Engine stopped');
      } catch (error) {
        console.error('[useConversationEngine] Error stopping engine:', error);
      }
      engineRef.current = null;
    }

    setStatus('idle');
  }, []);

  // Send text
  const sendText = useCallback(async (text: string) => {
    if (!engineRef.current) {
      console.warn('[useConversationEngine] No engine to send text to');
      return;
    }
    await engineRef.current.sendText(text);
  }, []);

  // Update context
  const updateContext = useCallback(async (context: ScriptContext) => {
    if (!engineRef.current) {
      console.warn('[useConversationEngine] No engine to update context');
      return;
    }
    await engineRef.current.updateContext(context);
  }, []);

  // Send control command
  const sendControl = useCallback(async (command: ConversationControlCommand) => {
    if (!engineRef.current) {
      console.warn('[useConversationEngine] No engine to send control to');
      return;
    }
    await engineRef.current.sendControl(command);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (engineRef.current) {
        engineRef.current.stop().catch(console.error);
      }
    };
  }, []);

  return {
    status,
    isActive: status === 'ready',
    isEnabled,
    start,
    stop,
    sendText,
    updateContext,
    sendControl,
  };
}
