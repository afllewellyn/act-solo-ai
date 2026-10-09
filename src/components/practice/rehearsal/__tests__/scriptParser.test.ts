import { describe, it, expect } from 'vitest';
import { getScriptLines } from '../scriptParser';
import { countLineRoles, detectCharacterNames } from '../textUtils';

const unnamed =
  '<p><strong>I thought you were gone.</strong></p>' +
  '<p><em>I never left.</em></p>' +
  '<p>She turns away.</p>' +
  '<p></p>' +
  '<p><strong>Then prove it.</strong></p>';

const named =
  '<p><strong>BEN: Where were you?</strong></p>' +
  '<p><em>MAYA: Out.</em></p>';

describe('getScriptLines (names optional)', () => {
  it('reads roles from formatting alone: italic = AI, bold = you, plain = note', () => {
    const lines = getScriptLines(unnamed, 'italic');
    expect(lines.map(l => l.type)).toEqual(['actor', 'ai', 'note', 'actor']);
    expect(lines[1].dialogue).toBe('I never left.');
  });

  it('numbers paragraphs among non-empty <p>, skipping blank ones', () => {
    const lines = getScriptLines(unnamed, 'italic');
    expect(lines.map(l => l.paragraphIndex)).toEqual([0, 1, 2, 3]);
  });

  it('still strips an optional NAME: prefix from the dialogue', () => {
    const lines = getScriptLines(named, 'italic');
    expect(lines.map(l => [l.type, l.dialogue])).toEqual([
      ['actor', 'Where were you?'],
      ['ai', 'Out.'],
    ]);
  });

  it('listen mode: the AI reads every line', () => {
    expect(getScriptLines(unnamed, 'all').every(l => l.type === 'ai')).toBe(true);
  });
});

describe('countLineRoles / detectCharacterNames', () => {
  it('counts yours / AI / notes without any names', () => {
    expect(countLineRoles(unnamed)).toEqual({ actor: 2, ai: 1, note: 1 });
  });

  it('finds names only when present, one per paragraph', () => {
    expect(detectCharacterNames(named)).toEqual(['BEN', 'MAYA']);
    expect(detectCharacterNames(unnamed)).toEqual([]);
  });
});
