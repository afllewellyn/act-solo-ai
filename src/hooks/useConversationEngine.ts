/**
 * useConversationEngine - React hook for ConversationEngine lifecycle
 * Phase 3: React integration with factory pattern
 * Phase 3.5: Expose derived telemetry state (lastError, reconnectCount)
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

/**
 * Engines that expose reconnection/error telemetry (e.g. ElevenAgentsEngine).
 * Detected by duck typing so this hook does not statically import a concrete
 * engine class — a static import would defeat the factory's dynamic import and
 * pull the engine into the main bundle (see engineFactory.ts).
 */
interface TelemetryCapableEngine {
  getReconnectCount(): number;
  getLastError(): Error | null;
}

function hasTelemetry(
  engine: ConversationEngine
): engine is ConversationEngine & TelemetryCapableEngine {
  const candidate = engine as Partial<TelemetryCapableEngine>;
  return (
    typeof candidate.getReconnectCount === 'function' &&
    typeof candidate.getLastError === 'function'
  );
}

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
  /** Last error encountered (for UI diagnostics) */
  lastError: Error | null;
  /** Current reconnection attempt count (0 if connected) */
  reconnectCount: number;
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
  const [lastError, setLastError] = useState<Error | null>(null);
  const [reconnectCount, setReconnectCount] = useState<number>(0);
  
  const engineRef = useRef<ConversationEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const responseBufferRef = useRef<string>('');

  // Check if feature flag is enabled
  const isEnabled = isFeatureEnabled('conversation_engine_eleven');

  // Poll engine for telemetry state (reconnectCount, lastError)
  const updateTelemetryState = useCallback(() => {
    const engine = engineRef.current;
    if (engine && hasTelemetry(engine)) {
      setReconnectCount(engine.getReconnectCount());
      setLastError(engine.getLastError());
    }
  }, []);

  // Handle events from the engine
  const handleEvent = useCallback((event: ConversationEvent) => {
    // Update telemetry state on relevant events
    updateTelemetryState();

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
        setLastError(event.error);
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
    updateTelemetryState,
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
      setLastError(null);
      setReconnectCount(0);
      
      const engine = await createConversationEngine(config);
      engineRef.current = engine;

      // Subscribe to events
      unsubscribeRef.current = engine.onEvent(handleEvent);

      // Start the engine
      await engine.start();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setStatus('error');
      setLastError(err);
      onError?.(err);
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
      } catch (error) {
        console.error('[useConversationEngine] Error stopping engine:', error);
      }
      engineRef.current = null;
    }

    setStatus('idle');
    setReconnectCount(0);
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
    lastError,
    reconnectCount,
  };
}
