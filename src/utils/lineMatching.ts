/**
 * Match what the AI partner actually said against the script's AI lines so the
 * screen can catch up if a turn event was missed.
 */
import type { ScriptLine } from '@/components/practice/rehearsal/types';

const normalize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Share of the script line's words that appear in the spoken text (0..1). */
export function wordOverlap(spoken: string, scriptLine: string): number {
  const lineWords = normalize(scriptLine);
  if (lineWords.length === 0) return 0;
  const spokenWords = new Set(normalize(spoken));
  const hits = lineWords.filter(w => spokenWords.has(w)).length;
  return hits / lineWords.length;
}

/**
 * Index of the AI line at or after `fromIndex` that best matches `spoken`,
 * preferring the earliest line on ties. Returns -1 when nothing matches well enough.
 */
export function findSpokenAiLine(
  lines: ScriptLine[],
  fromIndex: number,
  spoken: string,
  threshold = 0.6
): number {
  let best = -1;
  let bestScore = 0;
  for (let i = Math.max(0, fromIndex); i < lines.length; i++) {
    if (lines[i].type !== 'ai') continue;
    const score = wordOverlap(spoken, lines[i].dialogue);
    if (score > bestScore + 1e-9) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore >= threshold ? best : -1;
}
