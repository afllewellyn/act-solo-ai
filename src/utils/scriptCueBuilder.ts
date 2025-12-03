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
 * Build the full script context for ConversationEngine
 */
export function buildScriptContext(
  scriptTitle: string,
  lines: ScriptLine[],
  currentLineIndex: number,
  textFilter: string,
  sessionStartTime: number
): import('@/services/conversation/domain').ScriptContext {
  const cues = buildCuesFromLines(lines);
  const { currentCue, nextCue, upcomingCues } = getCueContext(cues, currentLineIndex);
  
  // Build custom instructions with the actual lines
  const aiLines = lines.filter(l => l.type === 'ai').map(l => l.dialogue);
  const actorLines = lines.filter(l => l.type === 'actor').map(l => l.dialogue);
  
  const customInstructions = `You are a scene partner for script rehearsal.

YOUR LINES TO READ (in order):
${aiLines.map((line, i) => `${i + 1}. "${line}"`).join('\n')}

USER'S LINES (they will say these):
${actorLines.map((line, i) => `${i + 1}. "${line}"`).join('\n')}

RULES:
1. Read ONLY your lines from the list above, in order
2. After the user says their line, read your next line
3. Do NOT improvise or add extra dialogue
4. Do NOT repeat lines you've already said
5. Current text filter: ${textFilter}
${nextCue ? `\nYOUR NEXT LINE: "${nextCue.text}"` : ''}`;

  return {
    scriptTitle,
    currentLine: currentLineIndex,
    totalLines: lines.length,
    currentCue,
    nextCue,
    upcomingCues,
    sessionStartTime,
    customInstructions,
  };
}
