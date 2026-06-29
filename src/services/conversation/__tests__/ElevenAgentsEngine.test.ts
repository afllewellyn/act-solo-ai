/**
 * Unit tests for ElevenAgentsEngine
 * Tests event normalization, context formatting, and control commands with mocked WebSocket
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElevenAgentsEngine } from '../ElevenAgentsEngine';
import type { ConversationEvent, ConversationControlCommand } from '../types';
import type { ScriptContext, Cue } from '../domain';

// Mock WebSocket with constants
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

class MockWebSocket {
  public readyState = WS_CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  
  private sentMessages: string[] = [];

  // Test controls for reconnection scenarios
  static connectionCount = 0;
  static autoFail = false;

  constructor(public url: string) {
    // Track the most recently created socket so tests can drive it
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- publish the latest mock socket to the test module
    mockWsInstance = this;
    MockWebSocket.connectionCount++;
    // Simulate connection after a tick — or an abnormal close when autoFail is on
    setTimeout(() => {
      if (MockWebSocket.autoFail) {
        this.close(1006, 'simulated failure');
        return;
      }
      this.readyState = WS_OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = WS_CLOSED;
    this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
  }

  // Test helper
  getSentMessages() {
    return this.sentMessages.map(msg => JSON.parse(msg));
  }

  // Simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

// Install the mock class itself as the global WebSocket so `new WebSocket(url)`
// constructs correctly (an arrow function can't be used as a constructor), and
// expose the readyState constants as statics.
(global as unknown as Record<string, unknown>).WebSocket = Object.assign(MockWebSocket, {
  CONNECTING: WS_CONNECTING,
  OPEN: WS_OPEN,
  CLOSING: 2,
  CLOSED: WS_CLOSED,
});

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { signed_url: 'wss://test.elevenlabs.io/v1/conversational-ai/ws/test' },
        error: null,
      }),
    },
  },
}));

// Mock MediaDevices
const mockGetUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [{ stop: vi.fn() }],
});
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

// Mock AudioContext
class MockAudioContext {
  public state = 'running';
  public sampleRate = 16000;
  public destination = {};
  public audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };
  
  createMediaStreamSource() {
    return { 
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  
  createScriptProcessor(bufferSize: number, numberOfInputChannels: number, numberOfOutputChannels: number) {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    };
  }
  
  async close() {
    this.state = 'closed';
  }
}

// Mock AudioWorkletNode
class MockAudioWorkletNode {
  public port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    close: vi.fn(),
    postMessage: vi.fn(),
  };
  
  connect = vi.fn();
  disconnect = vi.fn();
}

global.AudioWorkletNode = MockAudioWorkletNode as unknown as typeof AudioWorkletNode;

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Track mock WebSocket instance
let mockWsInstance: MockWebSocket | null = null;

describe('ElevenAgentsEngine', () => {
  let engine: ElevenAgentsEngine;
  let events: ConversationEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    events = [];
    mockWsInstance = null;
    MockWebSocket.connectionCount = 0;
    MockWebSocket.autoFail = false;

    engine = new ElevenAgentsEngine({
      agentId: 'test-agent-id',
      voiceId: 'test-voice-id',
      language: 'en',
    });

    unsubscribe = engine.onEvent((event) => {
      events.push(event);
    });
  });

  afterEach(async () => {
    unsubscribe?.();
    await engine.stop();
    vi.clearAllMocks();
  });

  // Connect and drive the engine all the way to 'ready'. The engine only reaches
  // 'ready' after the server sends conversation_initiation_metadata, which then
  // triggers async microphone init. Uses real timers, so call before switching
  // to fake timers.
  async function connectToReady() {
    await engine.start();
    await new Promise(resolve => setTimeout(resolve, 10)); // socket opens, init sent
    mockWsInstance?.simulateMessage({ type: 'conversation_initiation_metadata' });
    await new Promise(resolve => setTimeout(resolve, 10)); // mic init -> 'ready'
  }

  describe('Event Normalization', () => {
    it('should emit user_speech_ended for a user transcript event', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for connection

      mockWsInstance?.simulateMessage({
        type: 'user_transcript',
        user_transcription_event: { user_transcript: 'Hello' },
      });

      const speechEvents = events.filter(e => e.type === 'user_speech_ended');
      expect(speechEvents.length).toBeGreaterThan(0);
    });

    it('should emit user_speech_ended with the transcript text', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      mockWsInstance?.simulateMessage({
        type: 'user_transcript',
        user_transcription_event: { user_transcript: 'Hello world' },
      });

      const endEvents = events.filter(e => e.type === 'user_speech_ended');
      expect(endEvents.length).toBe(1);
      expect(endEvents[0]).toMatchObject({
        type: 'user_speech_ended',
        transcript: 'Hello world',
      });
    });

    it('should emit agent_response_started -> deltas -> ended -> complete', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      // First response chunk
      mockWsInstance?.simulateMessage({
        type: 'agent_response',
        agent_response_event: { agent_response: 'Hello ' },
      });

      // Second response chunk
      mockWsInstance?.simulateMessage({
        type: 'agent_response',
        agent_response_event: { agent_response: 'there!' },
      });

      // End response
      mockWsInstance?.simulateMessage({
        type: 'agent_response_end',
      });

      const startedEvents = events.filter(e => e.type === 'agent_response_started');
      const deltaEvents = events.filter(e => e.type === 'agent_response_delta');
      const responseEvents = events.filter(e => e.type === 'agent_response');
      const endedEvents = events.filter(e => e.type === 'agent_response_ended');

      expect(startedEvents.length).toBe(1);
      expect(deltaEvents.length).toBe(2);
      expect(deltaEvents[0]).toMatchObject({ delta: 'Hello ' });
      expect(deltaEvents[1]).toMatchObject({ delta: 'there!' });
      expect(responseEvents.length).toBe(1);
      expect(responseEvents[0]).toMatchObject({ text: 'Hello there!' });
      expect(endedEvents.length).toBe(1);
    });

    it('should emit agent_audio_started -> deltas -> ended', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      // First audio chunk
      mockWsInstance?.simulateMessage({
        type: 'audio',
        audio_event: { audio_base_64: btoa('audio_data_1') },
      });

      // Second audio chunk
      mockWsInstance?.simulateMessage({
        type: 'audio',
        audio_event: { audio_base_64: btoa('audio_data_2') },
      });

      // End audio
      mockWsInstance?.simulateMessage({
        type: 'audio_end',
      });

      const startedEvents = events.filter(e => e.type === 'agent_audio_started');
      const deltaEvents = events.filter(e => e.type === 'agent_audio_delta');
      const endedEvents = events.filter(e => e.type === 'agent_audio_ended');

      expect(startedEvents.length).toBe(1);
      expect(deltaEvents.length).toBe(2);
      expect(endedEvents.length).toBe(1);
    });

    it('should handle interruption and emit final response/audio end', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Start response and audio
      mockWsInstance?.simulateMessage({
        type: 'agent_response',
        agent_response_event: { agent_response: 'Partial ' },
      });
      mockWsInstance?.simulateMessage({
        type: 'audio',
        audio_event: { audio_base_64: btoa('audio_data') },
      });

      // Interrupt
      mockWsInstance?.simulateMessage({
        type: 'interruption',
      });

      const responseEvents = events.filter(e => e.type === 'agent_response');
      const responseEndedEvents = events.filter(e => e.type === 'agent_response_ended');
      const audioEndedEvents = events.filter(e => e.type === 'agent_audio_ended');

      expect(responseEvents.length).toBe(1);
      expect(responseEvents[0]).toMatchObject({ text: 'Partial ' });
      expect(responseEndedEvents.length).toBe(1);
      expect(audioEndedEvents.length).toBe(1);
    });

    it('should emit tool_call events', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      mockWsInstance?.simulateMessage({
        type: 'tool_call',
        tool_name: 'get_weather',
        parameters: { location: 'San Francisco' },
      });

      const toolEvents = events.filter(e => e.type === 'tool_call');
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({
        type: 'tool_call',
        toolName: 'get_weather',
        parameters: { location: 'San Francisco' },
      });
    });
  });

  describe('Control Commands', () => {
    it('should send interrupt command', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      await engine.sendControl({ type: 'interrupt' });

      const messages = mockWsInstance?.getSentMessages() || [];
      const interruptMsg = messages.find(m => m.type === 'interrupt');
      expect(interruptMsg).toBeDefined();
    });

    it('should send clear_buffer command', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      await engine.sendControl({ type: 'clear_buffer' });

      const messages = mockWsInstance?.getSentMessages() || [];
      const clearMsg = messages.find(m => m.type === 'clear_buffer');
      expect(clearMsg).toBeDefined();
    });

    it('should send interrupt for pause_agent', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      await engine.sendControl({ type: 'pause_agent' });

      const messages = mockWsInstance?.getSentMessages() || [];
      const interruptMsg = messages.find(m => m.type === 'interrupt');
      expect(interruptMsg).toBeDefined();
    });

  it('should handle resume_agent as graceful no-op (no error)', async () => {
    await engine.start();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clear any previous events
    events.length = 0;

    await engine.sendControl({ type: 'resume_agent' });

    // Should NOT emit any error events - it's a graceful no-op
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(0);
  });
  });

  describe('Context Formatting', () => {
    it('should format complete script context', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      const cue: Cue = {
        text: 'To be or not to be',
        characterName: 'Hamlet',
        cueWords: ['be', 'not'],
        nextLine: 'That is the question',
        lineNumber: 42,
        isUserLine: false,
      };

      const context: ScriptContext = {
        scriptTitle: 'Hamlet',
        scene: 'Act 3, Scene 1',
        currentLine: 42,
        totalLines: 100,
        currentCue: cue,
        nextCue: { ...cue, text: 'That is the question', lineNumber: 43, isUserLine: true },
        upcomingCues: [
          { ...cue, text: 'Whether tis nobler', lineNumber: 44, isUserLine: false },
        ],
        sessionStartTime: Date.now(),
        customInstructions: 'Be dramatic',
      };

      await engine.updateContext(context);

      const messages = mockWsInstance?.getSentMessages() || [];
      const contextMsg = messages.find(m => m.type === 'contextual_update');
      
      expect(contextMsg).toBeDefined();
      expect(contextMsg?.text).toContain('Hamlet');
      expect(contextMsg?.text).toContain('Act 3, Scene 1');
      expect(contextMsg?.text).toContain('Line 42 of 100');
      expect(contextMsg?.text).toContain('To be or not to be');
      expect(contextMsg?.text).toContain('That is the question');
      expect(contextMsg?.text).toContain('Whether tis nobler');
      expect(contextMsg?.text).toContain('Be dramatic');
    });

    it('should format minimal script context', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      const context: ScriptContext = {
        scriptTitle: 'Simple Script',
        currentLine: 1,
        totalLines: 10,
        upcomingCues: [],
        sessionStartTime: Date.now(),
      };

      await engine.updateContext(context);

      const messages = mockWsInstance?.getSentMessages() || [];
      const contextMsg = messages.find(m => m.type === 'contextual_update');
      
      expect(contextMsg).toBeDefined();
      expect(contextMsg?.text).toContain('Simple Script');
      expect(contextMsg?.text).toContain('Line 1 of 10');
    });
  });

  describe('Connection Lifecycle', () => {
    it('should transition from idle -> connecting -> ready', async () => {
      expect(engine.getStatus()).toBe('idle');

      const startPromise = engine.start();
      expect(engine.getStatus()).toBe('connecting');

      await startPromise;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Server acknowledges initialization; engine then inits mic and goes ready
      mockWsInstance?.simulateMessage({ type: 'conversation_initiation_metadata' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(engine.getStatus()).toBe('ready');
    });

    it('should emit status_changed events', async () => {
      await connectToReady();

      const statusEvents = events.filter(e => e.type === 'status_changed');
      expect(statusEvents.length).toBeGreaterThanOrEqual(2);
      
      // Should have connecting -> ready transition
      const connectingEvent = statusEvents.find(e => e.status === 'connecting');
      const readyEvent = statusEvents.find(e => e.status === 'ready');
      
      expect(connectingEvent).toBeDefined();
      expect(readyEvent).toBeDefined();
    });

    it('should clean up resources on stop', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      await engine.stop();

      expect(engine.getStatus()).toBe('disconnected');
      
      // Should emit disconnected status
      const statusEvents = events.filter(e => e.type === 'status_changed');
      const disconnectedEvent = statusEvents.find(e => e.status === 'disconnected');
      expect(disconnectedEvent).toBeDefined();
    });

    it('should handle cleanup of active response on close', async () => {
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Start a response
      mockWsInstance?.simulateMessage({
        type: 'agent_response',
        agent_response_event: { agent_response: 'Incomplete' },
      });

      // Close connection without ending response
      mockWsInstance?.close();

      // Should emit final response and ended events
      const responseEvents = events.filter(e => e.type === 'agent_response');
      const endedEvents = events.filter(e => e.type === 'agent_response_ended');
      
      expect(responseEvents.length).toBe(1);
      expect(responseEvents[0]).toMatchObject({ text: 'Incomplete' });
      expect(endedEvents.length).toBe(1);
    });
  });

  describe('Exponential Backoff Reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not reconnect on intentional stop', async () => {
      vi.useRealTimers(); // Need real timers for initial connection
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      vi.useFakeTimers();
      
      // Stop intentionally
      await engine.stop();
      
      // Advance time past any potential reconnection delay
      await vi.advanceTimersByTimeAsync(5000);
      
      // Should remain disconnected, not try to reconnect
      expect(engine.getStatus()).toBe('disconnected');
      
      // Should not have any status_changed to 'connecting' after disconnected
      const statusEvents = events.filter(e => e.type === 'status_changed');
      const lastStatusEvent = statusEvents[statusEvents.length - 1];
      expect(lastStatusEvent?.status).toBe('disconnected');
    });

    it('should not reconnect on clean close (code 1000)', async () => {
      vi.useRealTimers();
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      vi.useFakeTimers();
      events.length = 0; // Clear previous events
      
      // Simulate clean close
      mockWsInstance?.close(1000);
      
      // Advance time past any potential reconnection delay
      await vi.advanceTimersByTimeAsync(5000);
      
      expect(engine.getStatus()).toBe('disconnected');
      
      // Should not have 'connecting' status after the close
      const connectingAfterClose = events.filter(e => 
        e.type === 'status_changed' && e.status === 'connecting'
      );
      expect(connectingAfterClose.length).toBe(0);
    });

    it('should attempt reconnection on abnormal close', async () => {
      vi.useRealTimers();
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      vi.useFakeTimers();
      events.length = 0;
      
      // Simulate abnormal close (e.g., network error)
      mockWsInstance?.close(1006, 'Connection lost');
      
      // Should transition to connecting status for reconnection attempt
      const connectingEvents = events.filter(e => 
        e.type === 'status_changed' && e.status === 'connecting'
      );
      expect(connectingEvents.length).toBe(1);
    });

    it('should wait a backoff delay before reconnecting on abnormal close', async () => {
      vi.useRealTimers();
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));

      vi.useFakeTimers();

      // Every subsequent connection fails abnormally, forcing repeated reconnects
      MockWebSocket.autoFail = true;
      const startCount = MockWebSocket.connectionCount;

      // Trigger abnormal close to schedule the first reconnect
      mockWsInstance?.close(1006);

      // Reconnection is delayed, not immediate — nothing happens within the first second
      await vi.advanceTimersByTimeAsync(999);
      expect(MockWebSocket.connectionCount).toBe(startCount);

      // The first reconnect fires shortly after the 1s base delay
      await vi.advanceTimersByTimeAsync(500);
      expect(MockWebSocket.connectionCount).toBe(startCount + 1);

      // Reconnections keep happening as each attempt fails
      await vi.advanceTimersByTimeAsync(10000);
      expect(MockWebSocket.connectionCount).toBeGreaterThanOrEqual(startCount + 2);
    });

    it('should give up after max reconnection attempts and emit error', async () => {
      vi.useRealTimers();
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      vi.useFakeTimers();
      events.length = 0;

      // Every reconnection attempt fails abnormally
      MockWebSocket.autoFail = true;

      // Initial abnormal close kicks off the reconnection cycle
      mockWsInstance?.close(1006);

      // Advance well past the full backoff sequence (1+2+4+8+16 = 31s)
      await vi.advanceTimersByTimeAsync(60000);

      // After the max attempts the engine gives up with an error and disconnects
      const errorEvents = events.filter(e => e.type === 'error');
      const maxAttemptsError = errorEvents.find(e =>
        e.error?.message?.includes('maximum reconnection attempts')
      );
      expect(maxAttemptsError).toBeDefined();
      expect(engine.getStatus()).toBe('disconnected');
    });

    it('should reset reconnect attempts on successful connection', async () => {
      vi.useRealTimers();
      await connectToReady();
      expect(engine.getStatus()).toBe('ready');

      // Stop and reconnect should reach ready again from a clean state
      await engine.stop();
      await connectToReady();

      expect(engine.getStatus()).toBe('ready');
    });

    it('should clear pending reconnection timeout on manual stop', async () => {
      vi.useRealTimers();
      await engine.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      vi.useFakeTimers();
      
      // Trigger abnormal close to start reconnection timer
      mockWsInstance?.close(1006);
      
      // Immediately stop before reconnection timer fires
      await engine.stop();
      
      // Advance past the reconnection delay
      await vi.advanceTimersByTimeAsync(5000);
      
      // Should remain disconnected, reconnection should be cancelled
      expect(engine.getStatus()).toBe('disconnected');
    });
  });
});
