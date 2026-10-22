import { describe, it, expect } from 'vitest';
import { findSpokenActorTurnEnd, findSpokenAiLine } from '../lineMatching';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

const line = (type: ScriptLine['type'], dialogue: string, i: number): ScriptLine => ({
  type, dialogue, content: dialogue, paragraphIndex: i,
});

const lines = [
  line('actor', 'Where were you last night?', 0),
  line('ai', 'I was at the station waiting for the late train.', 1),
  line('actor', 'You never called.', 2),
  line('ai', 'My phone died, I swear it did.', 3),
];

describe('findSpokenAiLine', () => {
  it('matches the line the AI actually said', () => {
    expect(findSpokenAiLine(lines, 0, 'I was at the station, waiting for the late train.')).toBe(1);
  });

  it('never jumps over an actor line that has not been spoken', () => {
    expect(findSpokenAiLine(lines, 0, 'My phone died, I swear it did')).toBe(-1);
  });

  it('catches up across consecutive AI lines within the window', () => {
    const run = [
      line('ai', 'The train was late again tonight.', 0),
      line('ai', 'So I walked the whole way home.', 1),
      line('ai', 'And then the rain started pouring down.', 2),
    ];
    expect(findSpokenAiLine(run, 0, 'So I walked the whole way home')).toBe(1);
    expect(findSpokenAiLine(run, 0, 'And then the rain started pouring down')).toBe(-1); // beyond 2 AI lines
  });

  it('ignores short lines and weak matches', () => {
    const run = [line('ai', 'Fine.', 0), line('ai', 'I was at the station all night.', 1)];
    expect(findSpokenAiLine(run, 0, 'Fine.')).toBe(-1);
    expect(findSpokenAiLine(run, 0, 'I was at home')).toBe(-1);
  });

  it('never matches behind the current position', () => {
    expect(findSpokenAiLine(lines, 2, 'I was at the station waiting for the late train')).toBe(-1);
  });

  it('returns -1 for unrelated speech', () => {
    expect(findSpokenAiLine(lines, 0, 'completely different words here')).toBe(-1);
  });

  it('finds the final paragraph covered in a split actor turn', () => {
    const splitTurn = [
      line('actor', 'I need you to hear me.', 0),
      line('actor', 'This is still my thought.', 1),
      line('ai', 'I hear you.', 2),
    ];

    expect(findSpokenActorTurnEnd(splitTurn, 0, 'I need you to hear me. This is still my thought.')).toBe(1);
  });
});
