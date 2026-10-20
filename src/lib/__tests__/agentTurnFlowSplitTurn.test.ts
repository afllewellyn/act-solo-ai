import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentTurnFlow, USER_TURN_CUE_MS, NO_AUDIO_FALLBACK_MS, actorPaceMs } from '../agentTurnFlow';
import { getScriptLines } from '@/components/practice/rehearsal/scriptParser';

const html = '<p><strong>I need you to hear me.</strong></p><p></p><p><strong>This is still my thought.</strong></p><p><strong>And this is the end.</strong></p><p><em>I hear you now.</em></p><p><em>And I am leaving.</em></p>';

function setup() {
  const lines = getScriptLines(html, 'italic');
  const state = { current: 0 };
  const cued: number[] = [];
  const flow = createAgentTurnFlow({
    getLines: () => lines, getCurrentIndex: () => state.current,
    advanceFrom: (i) => { if (i + 1 < lines.length) state.current = i + 1; },
    cueAgent: (i) => cued.push(i), isActive: () => true,
    setSpeaking: () => {}, setListening: () => {},
  });
  return { flow, state, cued };
}

describe('split bold actor speech', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits 4 seconds of silence after the actor finishes before cueing the AI', () => {
    const { flow, cued } = setup();
    flow.onUserSpeechEnded('I need you to hear me. This is still my thought. And this is the end.');
    expect(USER_TURN_CUE_MS).toBe(4000);
    vi.advanceTimersByTime(3999);
    expect(cued).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(cued).toEqual([3]);
  });

  it('restarts the 4 second wait when the actor starts speaking again during the pause', () => {
    const { flow, cued } = setup();
    flow.onUserSpeechEnded('I need you to hear me. This is still my thought. And this is the end.');
    vi.advanceTimersByTime(2000);
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(3999);
    expect(cued).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(cued).toEqual([3]);
  });

  it('discards an AI reply that starts after the first bold paragraph', () => {
    const { flow, state, cued } = setup();
    expect(flow.onResponseStarted()).toBe(false);
    flow.onAudioStarted();
    flow.onResponseEnded('I hear you now.');
    flow.onAudioEnded();
    vi.advanceTimersByTime(10000);
    expect(state.current).toBe(0);
    expect(cued).toEqual([]);
  });

  it('keeps the highlight on unfinished bold lines after a partial transcript + early reply', () => {
    const { flow, state } = setup();
    flow.onUserSpeechEnded('I need you to hear me');
    expect(state.current).toBe(1);
    expect(flow.onResponseStarted()).toBe(false);
    flow.onResponseEnded('I hear you now.');
    vi.advanceTimersByTime(NO_AUDIO_FALLBACK_MS + 100);
    expect(state.current).toBe(1);
  });

  it('answers normally once the last bold paragraph is spoken', () => {
    const { flow, state, cued } = setup();
    flow.onUserSpeechEnded('I need you to hear me. This is still my thought. And this is the end.');
    expect(state.current).toBe(3);
    vi.advanceTimersByTime(USER_TURN_CUE_MS + 10);
    expect(cued).toEqual([3]);
    expect(flow.onResponseStarted()).toBe(true);
    flow.onAudioStarted();
    flow.onResponseEnded('I hear you now.');
    flow.onAudioEnded();
    expect(state.current).toBe(4);
  });

  it('walks the bold paragraphs at reading pace once the actor starts, stopping on the last one', () => {
    const { flow, state } = setup();
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(actorPaceMs({ dialogue: 'I need you to hear me.' } as never) - 1);
    expect(state.current).toBe(0);
    vi.advanceTimersByTime(1);
    expect(state.current).toBe(1);
    vi.advanceTimersByTime(60000);
    expect(state.current).toBe(2); // the last bold paragraph, never the AI line
  });

  it('a partial transcript never pulls the paced highlight backwards or into the AI line', () => {
    const { flow, state, cued } = setup();
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(60000);
    expect(state.current).toBe(2);
    flow.onUserSpeechEnded('I need you to hear me');
    expect(state.current).toBe(2);
    vi.advanceTimersByTime(USER_TURN_CUE_MS + 10);
    expect(cued).toEqual([]);
  });

  it('discards a reply on the last paragraph while the transcript shows the actor is not done', () => {
    const { flow, state } = setup();
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(60000);
    flow.onUserSpeechEnded('I need you to hear me');
    expect(flow.onResponseStarted()).toBe(false);
    flow.onResponseEnded('I hear you now.');
    vi.advanceTimersByTime(NO_AUDIO_FALLBACK_MS + 100);
    expect(state.current).toBe(2);
  });

  it('advances to the AI line once the transcript confirms the last paragraph', () => {
    const { flow, state, cued } = setup();
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(60000);
    flow.onUserSpeechEnded('I need you to hear me');
    flow.onUserSpeechEnded('This is still my thought. And this is the end.');
    expect(state.current).toBe(3);
    vi.advanceTimersByTime(USER_TURN_CUE_MS + 10);
    expect(cued).toEqual([3]);
  });

  it('recovers after a discarded reply if the actor stays silent on the last paragraph', () => {
    const { flow, state, cued } = setup();
    flow.onUserSpeechStarted();
    vi.advanceTimersByTime(60000);
    flow.onUserSpeechEnded('I need you to hear me');
    expect(flow.onResponseStarted()).toBe(false);
    vi.advanceTimersByTime(USER_TURN_CUE_MS + 10);
    expect(state.current).toBe(3);
    expect(cued).toEqual([3]);
  });
});
