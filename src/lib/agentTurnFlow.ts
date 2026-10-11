/**
 * Turn-taking for the live scene partner.
 *
 * Keeps the teleprompter highlight in step with what has actually been heard, and makes sure
 * the scene never stalls on an AI line nobody is reading:
 *  - the highlight moves on only after the agent's audio has finished playing (not when its text
 *    arrives, which is much earlier);
 *  - when the highlight lands on an AI line without the user speaking (AI -> AI), the agent is cued;
 *  - when it lands on an AI line after the user's turn, the agent normally answers on its own, and is
 *    only cued if it stays silent for a moment;
 *  - speech heard while the agent is talking (its own voice picked up by the mic) is ignored.
 */
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { findSpokenAiLine } from '@/utils/lineMatching';

/** Response text ended but no audio ever started: don't wait for audio forever. */
export const NO_AUDIO_FALLBACK_MS = 1500;
/** Pause between finishing one AI line and cueing the next AI line. */
export const AI_TO_AI_CUE_MS = 500;
/** How long the agent gets to answer the user on its own before we cue it. */
export const USER_TURN_CUE_MS = 2500;

export interface AgentTurnFlowDeps {
  getLines(): ScriptLine[];
  getCurrentIndex(): number;
  /** Move the highlight to the line after `index` (ends the scene after the last line). */
  advanceFrom(index: number): void;
  /** Ask the agent to speak the line at `index` now. */
  cueAgent(index: number): void;
  /** Rehearsal is running and not paused. */
  isActive(): boolean;
  setSpeaking(): void;
  setListening(): void;
  /** Playback speed multiplier, used to size the "audio never ended" safety net. */
  getSpeed?(): number;
}

export interface AgentTurnFlow {
  onResponseStarted(): void;
  onAudioStarted(): void;
  onResponseEnded(spokenText: string): void;
  onAudioEnded(): void;
  onUserSpeechEnded(transcript?: string): void;
  /** Record that the agent was cued for `index` by someone else (opening line, Next cue). */
  markCued(index: number): void;
  /** Drop any pending timers and per-turn state (pause, stop, restart). */
  reset(): void;
}

type AudioState = 'none' | 'playing' | 'done';

export function createAgentTurnFlow(deps: AgentTurnFlowDeps): AgentTurnFlow {
  let pendingText: string | null = null;
  let audio: AudioState = 'none';
  let busy = false; // the agent is mid-response (text or audio in flight)
  let responseSeen = false;
  let lastCued = -1;
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  let cueTimer: ReturnType<typeof setTimeout> | null = null;

  const clearResponseTimer = () => {
    if (responseTimer) clearTimeout(responseTimer);
    responseTimer = null;
  };
  const clearCueTimer = () => {
    if (cueTimer) clearTimeout(cueTimer);
    cueTimer = null;
  };

  const cueIfIdle = (index: number) => {
    if (!deps.isActive() || busy || deps.getCurrentIndex() !== index) return;
    if (deps.getLines()[index]?.type !== 'ai' || lastCued === index) return;
    lastCued = index;
    deps.cueAgent(index);
  };

  const complete = () => {
    clearResponseTimer();
    const text = pendingText ?? '';
    pendingText = null;
    audio = 'none';
    busy = false;
    if (!deps.isActive()) return;

    const lines = deps.getLines();
    const before = deps.getCurrentIndex();
    // Match what was actually said so we catch up if a turn was missed
    const spokenIndex = findSpokenAiLine(lines, before, text);
    if (spokenIndex !== -1) deps.advanceFrom(spokenIndex);
    else if (lines[before]?.type === 'ai') deps.advanceFrom(before);
    deps.setListening();

    const landed = deps.getCurrentIndex();
    if (landed !== before && lines[landed]?.type === 'ai') {
      // AI -> AI: nobody else is going to speak this line
      clearCueTimer();
      cueTimer = setTimeout(() => cueIfIdle(landed), AI_TO_AI_CUE_MS);
    }
  };

  return {
    onResponseStarted() {
      busy = true;
      responseSeen = true;
      clearCueTimer();
      deps.setSpeaking();
    },

    onAudioStarted() {
      busy = true;
      audio = 'playing';
      clearCueTimer();
    },

    onResponseEnded(spokenText) {
      pendingText = spokenText;
      clearResponseTimer();
      if (audio === 'done') {
        complete();
      } else if (audio === 'none') {
        responseTimer = setTimeout(complete, NO_AUDIO_FALLBACK_MS);
      } else {
        // Audio is still playing; it normally ends the turn. Safety net in case it never reports back.
        const words = spokenText.split(/\s+/).filter(Boolean).length;
        const speed = Math.max(0.5, deps.getSpeed?.() ?? 1);
        responseTimer = setTimeout(complete, 3000 + (words / (1.8 * speed)) * 1000);
      }
    },

    onAudioEnded() {
      if (pendingText !== null) complete();
      else audio = 'done';
    },

    onUserSpeechEnded(transcript) {
      if (!deps.isActive()) return;
      // The agent is talking (or its voice leaked into the mic): that is not the user's line
      if (busy || pendingText !== null) return;
      if (!transcript?.trim()) return;

      const lines = deps.getLines();
      const before = deps.getCurrentIndex();
      if (lines[before]?.type !== 'actor') return;

      responseSeen = false;
      deps.advanceFrom(before);

      const landed = deps.getCurrentIndex();
      if (landed !== before && lines[landed]?.type === 'ai') {
        // The agent answers the user on its own; step in only if it stays quiet
        clearCueTimer();
        cueTimer = setTimeout(() => {
          if (!responseSeen) cueIfIdle(landed);
        }, USER_TURN_CUE_MS);
      }
    },

    markCued(index) {
      lastCued = index;
      clearCueTimer();
    },

    reset() {
      clearResponseTimer();
      clearCueTimer();
      pendingText = null;
      audio = 'none';
      busy = false;
      responseSeen = false;
      lastCued = -1;
    },
  };
}
