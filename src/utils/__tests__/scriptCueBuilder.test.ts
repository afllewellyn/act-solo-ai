import { describe, expect, it } from 'vitest';
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { buildScriptContext, extractCueWords } from '@/utils/scriptCueBuilder';

const ai = (dialogue: string, paragraphIndex = 0): ScriptLine => ({
  type: 'ai',
  content: dialogue,
  dialogue,
  paragraphIndex,
});
const actor = (dialogue: string, paragraphIndex = 0): ScriptLine => ({
  type: 'actor',
  content: dialogue,
  dialogue,
  paragraphIndex,
});
const note = (dialogue: string, paragraphIndex = 0): ScriptLine => ({
  type: 'note',
  content: dialogue,
  dialogue,
  paragraphIndex,
});

// Covers all four patterns: AI first, actor -> AI, AI -> AI, AI -> actor
const scene: ScriptLine[] = [
  ai('Where were you last night?'),
  actor('I was working late at the office'),
  ai('Working. Of course you were.'),
  ai('And I suppose the phone was broken too.'),
  actor('It was dead, I swear to you'),
];

const build = (lines: ScriptLine[] = scene, index = 0) =>
  buildScriptContext('Late Night', lines, index, 'italic', 1234);

describe('extractCueWords', () => {
  it('returns the last three significant words', () => {
    expect(extractCueWords('I was working late at the office')).toEqual(['late', 'the', 'office']);
  });

  it('skips words of two letters or fewer', () => {
    expect(extractCueWords('We go to it now')).toEqual(['now']);
  });
});

describe('buildScriptContext', () => {
  it('lists the whole scene in order as one interleaved script', () => {
    const { customInstructions } = build();
    expect(customInstructions).toBeDefined();
    const text = customInstructions as string;

    const positions = scene.map((line) => text.indexOf(`"${line.dialogue}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(text).toContain('1. AI: "Where were you last night?"');
    expect(text).toContain('2. YOU: "I was working late at the office"');
    expect(text).toContain('3. AI: "Working. Of course you were."');
    expect(text).toContain('4. AI: "And I suppose the phone was broken too."');
    expect(text).toContain('5. YOU: "It was dead, I swear to you"');
  });

  it('includes the cue words for each of the user lines, and none for AI lines', () => {
    const text = build().customInstructions as string;
    expect(text).toContain(`(cue words: "${extractCueWords('I was working late at the office').join(' ')}")`);
    expect(text).toContain(`(cue words: "${extractCueWords('It was dead, I swear to you').join(' ')}")`);
    expect(text.match(/cue words:/g)).toHaveLength(2);
  });

  it('tells the agent to say several AI lines back-to-back without waiting', () => {
    const text = build().customInstructions as string;
    expect(text).toMatch(/back-to-back/i);
    expect(text).toMatch(/in sequence without waiting/i);
  });

  it('tells the agent to open the scene itself when it starts with an AI line', () => {
    const text = build().customInstructions as string;
    expect(text).toMatch(/scene starts with an AI line, begin it/i);
  });

  it('tells the agent to speak after the cue words, never repeat, never improvise, and keep its place', () => {
    const text = build().customInstructions as string;
    expect(text).toMatch(/exactly as written/i);
    expect(text).toMatch(/Never say a YOU line/i);
    expect(text).toMatch(/Never repeat a line/i);
    expect(text).toMatch(/stumbles or skips/i);
    expect(text).toMatch(/last AI line you said/i);
    expect(text).toMatch(/finish a YOU line/i);
  });

  it('has no "YOUR NEXT LINE" position hint, whatever the current line', () => {
    for (const index of [0, 1, 2, 4]) {
      const context = build(scene, index);
      expect(context.customInstructions).not.toMatch(/YOUR NEXT LINE/i);
    }
  });

  it('gives the same prompt whatever the current line, since the app no longer tracks position', () => {
    expect(build(scene, 0).customInstructions).toBe(build(scene, 3).customInstructions);
  });

  it('leaves stage notes out of the scene', () => {
    const text = build([note('She crosses to the window.'), ...scene]).customInstructions as string;
    expect(text).not.toContain('She crosses to the window.');
    expect(text).toContain('1. AI: "Where were you last night?"');
  });

  it('keeps the ScriptContext shape for other consumers', () => {
    const context = build(scene, 1);
    expect(context.scriptTitle).toBe('Late Night');
    expect(context.currentLine).toBe(1);
    expect(context.totalLines).toBe(scene.length);
    expect(context.sessionStartTime).toBe(1234);
    expect(context.currentCue?.text).toBe('I was working late at the office');
    expect(context.currentCue?.isUserLine).toBe(true);
    // Lookahead hints would go stale after the first exchange, so none are sent
    expect(context.nextCue).toBeUndefined();
    expect(context.upcomingCues).toEqual([]);
  });

  it('still builds a prompt for a scene with no lines', () => {
    const context = build([], 0);
    expect(context.totalLines).toBe(0);
    expect(context.currentCue).toBeUndefined();
    expect(context.customInstructions).toContain('THE SCENE');
  });
});
