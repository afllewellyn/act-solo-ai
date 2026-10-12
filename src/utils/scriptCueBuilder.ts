/**
 * Script Cue Builder - Converts parsed script lines to Cue objects for ConversationEngine
 */

import type { Cue } from '@/services/conversation/domain';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

/**
 * Extract cue words from dialogue (last 2-3 significant words)
 */
export function extractCueWords(dialogue: string): string[] {
  const words = dialogue.trim().split(/\s+/).filter(w => w.length > 2);
  return words.slice(-3); // Last 3 words as cue
}

/**
 * Find the next AI line after a given index
 */
function getNextAiLineText(lines: ScriptLine[], afterIndex: number): string {
  for (let i = afterIndex + 1; i < lines.length; i++) {
    if (lines[i].type === 'ai') {
      return lines[i].dialogue;
    }
  }
  return '';
}

/**
 * Build all Cue objects from parsed script lines
 */
export function buildCuesFromLines(lines: ScriptLine[]): Cue[] {
  return lines.map((line, index) => ({
    text: line.dialogue,
    characterName: line.type === 'ai' ? 'AI Partner' : 'You',
    cueWords: line.type === 'actor' ? extractCueWords(line.dialogue) : [],
    nextLine: getNextAiLineText(lines, index),
    lineNumber: index,
    isUserLine: line.type === 'actor',
  }));
}

/**
 * Get current cue, next cue, and upcoming cues based on current line index
 */
export function getCueContext(
  cues: Cue[],
  currentLineIndex: number
): { currentCue?: Cue; nextCue?: Cue; upcomingCues: Cue[] } {
  const currentCue = cues[currentLineIndex];
  
  // Find next AI cue (what agent should say next)
  const nextCue = cues.find((c, i) => i > currentLineIndex && !c.isUserLine);
  
  // Get upcoming AI cues (next 3 AI lines for lookahead)
  const upcomingCues = cues
    .filter((c, i) => i > currentLineIndex && !c.isUserLine)
    .slice(0, 3);

  return { currentCue, nextCue, upcomingCues };
}

/**
 * Build the whole scene as one interleaved script, so the agent can follow it on its own.
 * Each of the user's lines carries its cue words (the last words the agent listens for).
 * Stage notes are not part of the scene.
 */
function formatScene(lines: ScriptLine[]): string {
  return lines
    .filter(l => l.type !== 'note')
    .map((line, i) => {
      if (line.type === 'ai') return `${i + 1}. AI: "${line.dialogue}"`;
      const cueWords = extractCueWords(line.dialogue);
      const cue = cueWords.length > 0 ? ` (cue words: "${cueWords.join(' ')}")` : '';
      return `${i + 1}. YOU: "${line.dialogue}"${cue}`;
    })
    .join('\n');
}

/**
 * Build the full script context for ConversationEngine
 *
 * The app does not track the rehearsal position any more: the agent keeps its own place by
 * listening for the user's cue words. So the prompt is position-independent, and the lookahead
 * hints (`nextCue`, `upcomingCues`) are left empty, because the engine forwards them to the agent
 * once and they would be stale after the first exchange.
 */
export function buildScriptContext(
  scriptTitle: string,
  lines: ScriptLine[],
  currentLineIndex: number,
  textFilter: string,
  sessionStartTime: number
): import('@/services/conversation/domain').ScriptContext {
  const cues = buildCuesFromLines(lines);
  const currentCue = cues[currentLineIndex];

  const customInstructions = `You are the AI scene partner in a script rehearsal. The user is an actor rehearsing out loud. You play every line marked AI. The user plays every line marked YOU.

THE SCENE, in order:
${formatScene(lines)}

HOW TO PLAY IT:
1. Say only the AI lines, exactly as written, in order. Never say a YOU line and never improvise or add anything.
2. Listen to the user. When you hear them finish a YOU line (its cue words are the last words they say), say your next AI line(s) immediately.
3. If several AI lines come back-to-back, with no YOU line between them, say them all in sequence without waiting for the user.
4. If the scene starts with an AI line, begin it as soon as the scene starts, without waiting for the user.
5. Never repeat a line you have already said.
6. If the user stumbles or skips a line, continue from the last AI line you said.
7. If you are given an updated script mid-scene, carry on from where you were. Do not start over.
8. After the last line of the scene, stop and stay quiet.`;

  return {
    scriptTitle,
    currentLine: currentLineIndex,
    totalLines: lines.length,
    currentCue,
    nextCue: undefined,
    upcomingCues: [],
    sessionStartTime,
    customInstructions,
  };
}
