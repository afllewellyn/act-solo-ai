import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentTurnFlow } from '../agentTurnFlow';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

function setup(script: Array<[ScriptLine['type'], string]>, start = 0) {
  const lines = script.map(([type, dialogue], i): ScriptLine => ({ type, dialogue, content: dialogue, paragraphIndex: i, turnId: i, isTurnEnd: true }));
  const state = { current: start };
  const moves: string[] = [];
  const flow = createAgentTurnFlow({
    getLines: () => lines,
    getCurrentIndex: () => state.current,
    advanceFrom: (i) => { if (i + 1 < lines.length) state.current = i + 1; },
    cueAgent: () => {},
    isActive: () => true,
    setSpeaking: () => {},
    setListening: () => {},
    onMove: (reason) => moves.push(reason),
  });
  return { flow, state, moves };
}

describe('AI line highlighting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves to the AI line as soon as the AI starts answering', () => {
    const { flow, state, moves } = setup([['actor', 'Where were you'], ['ai', 'At the station all night long'], ['actor', 'Liar']]);
    flow.onResponseStarted();
    expect(state.current).toBe(1);
    expect(moves).toEqual(['ai_start']);
  });

  it('steps forward exactly one line when the AI finishes, without a double move', () => {
    const { flow, state } = setup([['actor', 'Where were you'], ['ai', 'At the station all night long'], ['ai', 'Waiting for the late train home'], ['actor', 'Liar']]);
    flow.onResponseStarted();
    flow.onAudioStarted();
    flow.onResponseEnded('something improvised entirely');
    flow.onAudioEnded();
    expect(state.current).toBe(2);
  });

  it('a weak or far match never skips past the next actor line', () => {
    const { flow, state } = setup([['ai', 'At the station all night long'], ['actor', 'Liar'], ['ai', 'My phone died I swear it did']]);
    flow.onResponseStarted();
    flow.onResponseEnded('My phone died I swear it did');
    flow.onAudioEnded();
    expect(state.current).toBe(1);
  });

  it('audio ending with no reply text still steps forward within 800ms', () => {
    const { flow, state } = setup([['ai', 'At the station all night long'], ['actor', 'Liar'], ['ai', 'Fine']]);
    flow.onAudioStarted();
    flow.onAudioEnded();
    vi.advanceTimersByTime(799);
    expect(state.current).toBe(0);
    vi.advanceTimersByTime(2);
    expect(state.current).toBe(1);
  });

  it('real ElevenLabs order (text, then audio end) reaches the actor line as soon as the voice stops', () => {
    const { flow, state } = setup([['actor', 'Where were you'], ['ai', 'At the station all night long'], ['actor', 'Liar']]);
    flow.onAudioStarted();
    flow.onResponseStarted();
    flow.onResponseEnded('At the station all night long');
    expect(state.current).toBe(1);
    flow.onAudioEnded();
    expect(state.current).toBe(2);
  });
});
