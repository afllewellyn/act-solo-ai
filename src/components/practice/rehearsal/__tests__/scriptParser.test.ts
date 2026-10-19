import { describe, it, expect } from 'vitest';
import { getScriptLines } from '../scriptParser';
import { countLineRoles, detectCharacterNames, hideCharacterNamePrefixHtml } from '../textUtils';

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

  it('groups consecutive same-role paragraphs into one turn', () => {
    const splitActorTurn =
      '<p><strong>I need you to hear me.</strong></p>' +
      '<p><strong>This is still my thought.</strong></p>' +
      '<p><em>I hear you.</em></p>';
    const lines = getScriptLines(splitActorTurn, 'italic');

    expect(lines.map(l => [l.type, l.turnId, l.isTurnEnd])).toEqual([
      ['actor', 0, false],
      ['actor', 0, true],
      ['ai', 1, true],
    ]);
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

describe('hideCharacterNamePrefixHtml', () => {
  it('hides a name prefix without changing the dialogue formatting', () => {
    expect(hideCharacterNamePrefixHtml('<strong>BEN: Where were you?</strong>'))
      .toBe('<strong>Where were you?</strong>');
  });

  it('hides a prefix split across inline formatting nodes', () => {
    expect(hideCharacterNamePrefixHtml('<strong>BEN</strong>: <em>Where were you?</em>'))
      .toBe('<strong></strong><em>Where were you?</em>');
  });

  it('leaves unnamed dialogue untouched', () => {
    expect(hideCharacterNamePrefixHtml('<em>Where were you?</em>'))
      .toBe('<em>Where were you?</em>');
  });
});

describe('getScriptLines line breaks', () => {
  it('splits a bold and italic line joined by <br> into separate actor and AI lines', () => {
    const lines = getScriptLines('<p><strong>My line.</strong><br><em>Your line.</em></p>', 'italic');
    expect(lines.map(l => l.type)).toEqual(['actor', 'ai']);
    expect(lines[0].isTurnEnd).toBe(true);
  });
});
