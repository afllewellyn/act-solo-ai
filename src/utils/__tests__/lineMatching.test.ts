import { describe, it, expect } from 'vitest';
import { findSpokenAiLine } from '../lineMatching';
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

  it('catches up to a later AI line when a turn was missed', () => {
    expect(findSpokenAiLine(lines, 0, 'My phone died, I swear it did')).toBe(3);
  });

  it('never matches behind the current position', () => {
    expect(findSpokenAiLine(lines, 2, 'I was at the station waiting for the late train')).toBe(-1);
  });

  it('returns -1 for unrelated speech', () => {
    expect(findSpokenAiLine(lines, 0, 'completely different words here')).toBe(-1);
  });
});
