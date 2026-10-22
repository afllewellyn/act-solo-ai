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

/** Catch-up limits: only nearby, confident, non-trivial matches may move the highlight. */
export const AI_MATCH_THRESHOLD = 0.75;
export const AI_MATCH_MAX_AHEAD = 2;
export const AI_MATCH_MIN_WORDS = 4;

/**
 * Index of the AI line at or after `fromIndex` that best matches `spoken`,
 * preferring the earliest line on ties. Looks at most `maxAhead` AI lines ahead,
 * ignores short lines, and never searches past an actor line the actor hasn't spoken
 * (leading actor lines at `fromIndex` are the turn just finished). Returns -1 when unsure.
 */
export function findSpokenAiLine(
  lines: ScriptLine[],
  fromIndex: number,
  spoken: string,
  threshold = AI_MATCH_THRESHOLD,
  maxAhead = AI_MATCH_MAX_AHEAD,
): number {
  let best = -1;
  let bestScore = 0;
  let i = Math.max(0, fromIndex);
  while (i < lines.length && lines[i].type === 'actor') i++; // the finished actor turn
  let seen = 0;
  for (; i < lines.length && seen < maxAhead; i++) {
    if (lines[i].type === 'actor') break;
    if (lines[i].type !== 'ai') continue;
    seen++;
    if (normalize(lines[i].dialogue).length < AI_MATCH_MIN_WORDS) continue;
    const score = wordOverlap(spoken, lines[i].dialogue);
    if (score > bestScore + 1e-9) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore >= threshold ? best : -1;
}

/** Last consecutive actor line covered by the transcript, starting at `fromIndex`. */
export function findSpokenActorTurnEnd(
  lines: ScriptLine[],
  fromIndex: number,
  spoken: string,
  threshold = 0.45
): number {
  if (lines[fromIndex]?.type !== 'actor') return -1;

  let last = fromIndex;
  for (let i = fromIndex + 1; i < lines.length && lines[i].type === 'actor'; i++) {
    const score = wordOverlap(spoken, lines[i].dialogue);
    if (score >= threshold) last = i;
  }
  return last;
}
