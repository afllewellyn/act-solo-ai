import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAgentTurnFlow,
  AI_TO_AI_CUE_MS,
  NO_AUDIO_FALLBACK_MS,
  USER_TURN_CUE_MS,
} from '../agentTurnFlow';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

const line = (type: ScriptLine['type'], dialogue: string, i: number): ScriptLine => ({
  type,
  dialogue,
  content: `<p>${dialogue}</p>`,
  paragraphIndex: i,
});

function setup(script: Array<[ScriptLine['type'], string]>) {
  const lines = script.map(([type, text], i) => line(type, text, i));
  const state = { current: 0, active: true };
  const calls = { advanced: [] as number[], cued: [] as number[], speaking: 0, listening: 0 };
  const flow = createAgentTurnFlow({
    getLines: () => lines,
    getCurrentIndex: () => state.current,
    advanceFrom: (index) => {
      calls.advanced.push(index);
      if (index + 1 < lines.length) state.current = index + 1;
    },
    cueAgent: (index) => calls.cued.push(index),
    isActive: () => state.active,
    setSpeaking: () => { calls.speaking++; },
    setListening: () => { calls.listening++; },
  });
  /** Agent speaks `text`: text arrives, audio streams, text completes, then audio finishes playing. */
  const agentSpeaks = (text: string) => {
    flow.onResponseStarted();
    flow.onAudioStarted();
    flow.onResponseEnded(text);
  };
  return { flow, state, calls, lines, agentSpeaks };
}

describe('agentTurnFlow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the audio to finish playing before moving the highlight', () => {
    const { flow, state, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
    ]);
    agentSpeaks('Where were you last night');
    expect(state.current).toBe(0); // text is complete but the line is still being spoken
    flow.onAudioEnded();
    expect(state.current).toBe(1);
  });

  it('advances when audio finished before the text did', () => {
    const { flow, state } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
    ]);
    flow.onResponseStarted();
    flow.onAudioStarted();
    flow.onAudioEnded();
    expect(state.current).toBe(0);
    flow.onResponseEnded('Where were you last night');
    expect(state.current).toBe(1);
  });

  it('moves on if the response ends and no audio ever plays', () => {
    const { flow, state } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
    ]);
    flow.onResponseStarted();
    flow.onResponseEnded('Where were you last night');
    expect(state.current).toBe(0);
    vi.advanceTimersByTime(NO_AUDIO_FALLBACK_MS);
    expect(state.current).toBe(1);
  });

  it('cues the agent for an AI line that follows an AI line (no stall)', () => {
    const { flow, state, calls, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['ai', 'Do not lie to me'],
      ['actor', 'I would never'],
    ]);
    agentSpeaks('Where were you last night');
    flow.onAudioEnded();
    expect(state.current).toBe(1);
    expect(calls.cued).toEqual([]);
    vi.advanceTimersByTime(AI_TO_AI_CUE_MS);
    expect(calls.cued).toEqual([1]);
  });

  it('does not cue the agent when the next line is the user’s', () => {
    const { flow, calls, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
    ]);
    agentSpeaks('Where were you last night');
    flow.onAudioEnded();
    vi.advanceTimersByTime(USER_TURN_CUE_MS * 2);
    expect(calls.cued).toEqual([]);
  });

  it('advances past the user’s line once they have spoken, and lets the agent answer on its own', () => {
    const { flow, state, calls } = setup([
      ['actor', 'I was at the library'],
      ['ai', 'Which library'],
    ]);
    flow.onUserSpeechEnded('I was at the library');
    expect(state.current).toBe(1);
    flow.onResponseStarted(); // agent answers by itself
    vi.advanceTimersByTime(USER_TURN_CUE_MS * 2);
    expect(calls.cued).toEqual([]);
  });

  it('cues the agent if it stays silent after the user’s line', () => {
    const { flow, calls } = setup([
      ['actor', 'I was at the library'],
      ['ai', 'Which library'],
    ]);
    flow.onUserSpeechEnded('I was at the library');
    vi.advanceTimersByTime(USER_TURN_CUE_MS - 1);
    expect(calls.cued).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls.cued).toEqual([1]);
  });

  it('ignores speech heard while the agent is talking (its own voice) and empty transcripts', () => {
    const { flow, state, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
      ['ai', 'Which library'],
      ['actor', 'The one on Main Street'],
    ]);
    agentSpeaks('Where were you last night'); // highlight stays on line 0 until audio ends
    flow.onUserSpeechEnded('where were you last night'); // echo, current line is the AI line anyway
    flow.onAudioEnded();
    expect(state.current).toBe(1); // now the user's turn
    flow.onResponseStarted(); // agent starts talking again (e.g. a stray reply)
    flow.onUserSpeechEnded('echo of the agent');
    expect(state.current).toBe(1);
    flow.onResponseEnded('Which library');
    flow.onAudioEnded();
    expect(state.current).toBe(3); // caught up to what was actually spoken
    flow.onUserSpeechEnded('   ');
    expect(state.current).toBe(3);
  });

  it('does nothing while paused or stopped', () => {
    const { flow, state, calls, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['ai', 'Do not lie to me'],
    ]);
    state.active = false;
    agentSpeaks('Where were you last night');
    flow.onAudioEnded();
    vi.advanceTimersByTime(60_000);
    expect(state.current).toBe(0);
    expect(calls.cued).toEqual([]);
  });

  it('reset() cancels pending cues and per-turn state', () => {
    const { flow, calls, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['ai', 'Do not lie to me'],
    ]);
    agentSpeaks('Where were you last night');
    flow.onAudioEnded();
    flow.reset();
    vi.advanceTimersByTime(AI_TO_AI_CUE_MS * 4);
    expect(calls.cued).toEqual([]);
  });

  it('cues a line at most once', () => {
    const { flow, calls, agentSpeaks } = setup([
      ['actor', 'Hi'],
      ['ai', 'Hello there'],
      ['ai', 'Welcome'],
    ]);
    flow.onUserSpeechEnded('Hi');
    vi.advanceTimersByTime(USER_TURN_CUE_MS);
    expect(calls.cued).toEqual([1]);
    flow.markCued(1);
    vi.advanceTimersByTime(USER_TURN_CUE_MS * 4);
    expect(calls.cued).toEqual([1]);
    agentSpeaks('Hello there'); // keeps flowing afterwards
  });

  it('runs a whole scene without any manual advance', () => {
    const { flow, state, calls, agentSpeaks } = setup([
      ['ai', 'Where were you last night'],
      ['actor', 'I was at the library'],
      ['ai', 'Which library'],
      ['ai', 'Do not lie to me'],
      ['actor', 'The one on Main Street'],
      ['ai', 'Fine'],
    ]);
    const visited = [state.current];
    const track = () => visited.push(state.current);

    agentSpeaks('Where were you last night'); flow.onAudioEnded(); track(); // -> 1 (user)
    flow.onUserSpeechEnded('I was at the library'); track();                // -> 2 (agent answers)
    agentSpeaks('Which library'); flow.onAudioEnded(); track();             // -> 3 (AI -> AI)
    vi.advanceTimersByTime(AI_TO_AI_CUE_MS);
    expect(calls.cued).toEqual([3]);                                        // agent cued, not stalled
    agentSpeaks('Do not lie to me'); flow.onAudioEnded(); track();          // -> 4 (user)
    flow.onUserSpeechEnded('The one on Main Street'); track();              // -> 5 (agent answers)
    agentSpeaks('Fine'); flow.onAudioEnded();                               // end of the scene

    expect(visited).toEqual([0, 1, 2, 3, 4, 5]);
    expect(calls.advanced).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
