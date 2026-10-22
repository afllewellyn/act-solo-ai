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
 *  - speech heard while the agent is talking (its own voice picked up by the mic) is ignored;
 *  - inside a split actor speech the highlight walks the bold paragraphs at a calm reading pace
 *    from the moment the actor starts talking (transcripts only arrive after they stop), never
 *    leaving the actor's block until the transcript confirms the last paragraph was spoken.
 */
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { findSpokenActorTurnEnd, findSpokenAiLine } from '@/utils/lineMatching';

/** Response text ended but no audio ever started: don't wait for audio forever. */
export const NO_AUDIO_FALLBACK_MS = 1500;
/** Pause between finishing one AI line and cueing the next AI line. */
export const AI_TO_AI_CUE_MS = 500;
/** How long the agent gets to answer the user on its own before we cue it. */
export const USER_TURN_CUE_MS = 4000;
/** Calm reading pace for walking a split actor speech (slower than speech so it trails, never leads). */
export const ACTOR_PACE_WORDS_PER_SEC = 1.8;
export const ACTOR_PACE_MIN_MS = 1600;

export const actorPaceMs = (line: ScriptLine | undefined, speed = 1): number => {
  const words = (line?.dialogue ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(ACTOR_PACE_MIN_MS, (words / (ACTOR_PACE_WORDS_PER_SEC * Math.max(0.5, speed))) * 1000);
};

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
  /** Diagnostics: the highlight walked to `index` by reading pace. */
  onPaced?(index: number): void;
  /** Diagnostics: why the highlight moved (indices only). */
  onMove?(reason: 'ai_start' | 'sequential' | 'catch_up', from: number, to: number): void;
}

export interface AgentTurnFlow {
  /** Returns false when the reply came too early (mid split actor speech) and is being discarded. */
  onResponseStarted(): boolean;
  onAudioStarted(): void;
  onResponseEnded(spokenText: string): void;
  onAudioEnded(): void;
  /** A fresh actor utterance cancels the silence fallback; pauses are not cues. */
  onUserSpeechStarted(): void;
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
  let discarding = false; // an early reply mid actor turn: ignore all its events
  // Last actor line confirmed by a transcript, tagged with its turn so a new turn starts fresh
  let heard: { turnId: number; index: number } | null = null;

  const heardInCurrentTurn = (): number => {
    const l = deps.getLines()[deps.getCurrentIndex()];
    return heard && l && heard.turnId === l.turnId ? heard.index : -1;
  };
  /** The actor is mid-speech: more bold paragraphs remain, or the transcript shows they stopped early. */
  const inUnfinishedActorTurn = () => {
    const current = deps.getCurrentIndex();
    const l = deps.getLines()[current];
    if (l?.type !== 'actor') return false;
    if (l.isTurnEnd === false) return true;
    const h = heardInCurrentTurn();
    return h !== -1 && h < current;
  };
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  let cueTimer: ReturnType<typeof setTimeout> | null = null;
  let paceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPaceTimer = () => {
    if (paceTimer) clearTimeout(paceTimer);
    paceTimer = null;
  };
  /** Walk to the next bold paragraph after a reading-time beat; stops on the actor's last paragraph. */
  const schedulePace = () => {
    clearPaceTimer();
    const index = deps.getCurrentIndex();
    const line = deps.getLines()[index];
    if (!deps.isActive() || line?.type !== 'actor' || line.isTurnEnd !== false) return;
    paceTimer = setTimeout(() => {
      paceTimer = null;
      if (!deps.isActive() || deps.getCurrentIndex() !== index) return;
      deps.advanceFrom(index);
      deps.onPaced?.(deps.getCurrentIndex());
      schedulePace();
    }, actorPaceMs(line, deps.getSpeed?.() ?? 1));
  };

  const clearResponseTimer = () => {
    if (responseTimer) clearTimeout(responseTimer);
    responseTimer = null;
  };
  let cueAction: (() => void) | null = null;
  const clearCueTimer = () => {
    if (cueTimer) clearTimeout(cueTimer);
    cueTimer = null;
    cueAction = null;
  };
  /** Run `action` after `ms` of quiet; fresh actor speech restarts the wait instead of dropping it. */
  const armCue = (action: () => void, ms = USER_TURN_CUE_MS) => {
    clearCueTimer();
    cueAction = action;
    cueTimer = setTimeout(() => {
      cueTimer = null;
      cueAction = null;
      action();
    }, ms);
  };

  const cueIfIdle = (index: number) => {
    if (!deps.isActive() || busy || deps.getCurrentIndex() !== index) return;
    if (deps.getLines()[index]?.type !== 'ai' || lastCued === index) return;
    lastCued = index;
    deps.cueAgent(index);
  };

  const recoverAfterDiscard = () => {
    if (!deps.isActive() || busy) return;
    const lines = deps.getLines();
    const index = deps.getCurrentIndex();
    const line = lines[index];
    if (line?.type !== 'actor') return;
    if (line.isTurnEnd === false) { armCue(recoverAfterDiscard); return; } // pace is still walking the block
    heard = { turnId: line.turnId ?? -1, index };
    clearPaceTimer();
    deps.advanceFrom(index);
    const landed = deps.getCurrentIndex();
    if (landed !== index) cueIfIdle(landed);
  };

  /** The agent started answering a finished actor turn: highlight its line now, not after transcripts. */
  const showAiLineNow = () => {
    if (!deps.isActive()) return;
    const lines = deps.getLines();
    const index = deps.getCurrentIndex();
    if (lines[index]?.type !== 'actor' || inUnfinishedActorTurn()) return;
    let next = index + 1;
    while (next < lines.length && lines[next].type === 'actor') next++;
    if (lines[next]?.type !== 'ai') return;
    clearPaceTimer();
    deps.onMove?.('ai_start', index, next);
    deps.advanceFrom(next - 1);
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
    // Never let the agent's reply skip actor paragraphs that haven't been spoken yet
    if (inUnfinishedActorTurn()) {
      deps.setListening();
      return;
    }
    // Catch up only on a confident nearby match; otherwise step forward in order
    const spokenIndex = findSpokenAiLine(lines, before, text);
    if (spokenIndex !== -1 && spokenIndex > before) {
      deps.onMove?.('catch_up', before, spokenIndex + 1);
      deps.advanceFrom(spokenIndex);
    } else if (lines[before]?.type === 'ai') {
      deps.onMove?.('sequential', before, before + 1);
      deps.advanceFrom(before);
    } else {
      // Sequential fallback: the agent spoke the next AI line, even if it improvised the words.
      // This also steps past a user line whose transcript was missed, so the prompter never freezes.
      let next = -1;
      for (let i = Math.max(0, before); i < lines.length; i++) {
        if (lines[i].type === 'ai') { next = i; break; }
      }
      if (next !== -1) deps.advanceFrom(next);
    }
    deps.setListening();

    const landed = deps.getCurrentIndex();
    if (landed !== before && lines[landed]?.type === 'ai') {
      // AI -> AI: nobody else is going to speak this line
      armCue(() => cueIfIdle(landed), AI_TO_AI_CUE_MS);
    }
  };

  return {
    onResponseStarted() {
      if (deps.isActive() && inUnfinishedActorTurn()) {
        discarding = true;
        clearResponseTimer();
        pendingText = null;
        audio = 'none';
        busy = false;
        deps.setListening();
        // The agent thinks the actor is done. If they then stay quiet on their last paragraph,
        // treat the speech as finished (a missed transcript must not freeze the scene).
        armCue(recoverAfterDiscard);
        return false;
      }
      discarding = false;
      busy = true;
      responseSeen = true;
      clearCueTimer();
      showAiLineNow();
      deps.setSpeaking();
      return true;
    },

    onAudioStarted() {
      if (discarding) return;
      busy = true;
      audio = 'playing';
      clearCueTimer();
      showAiLineNow();
    },

    onResponseEnded(spokenText) {
      if (discarding) return;
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
      if (discarding) return;
      if (pendingText !== null) complete();
      else audio = 'done';
    },

    onUserSpeechStarted() {
      // Fresh speech postpones the silence fallback (restarted from now, so stray noise can't stall it)
      if (cueAction) armCue(cueAction);
      // Start walking a split speech the moment the actor starts reading it
      if (!paceTimer) schedulePace();
    },

    onUserSpeechEnded(transcript) {
      if (!deps.isActive()) return;
      if (!transcript?.trim()) return;

      const lines = deps.getLines();
      const before = deps.getCurrentIndex();
      // While the agent's line is playing the highlight sits on an AI line, so echo is ignored here.
      // If the agent already started answering (race with the end-of-speech event), still advance.
      if (lines[before]?.type !== 'actor') return;

      const agentAlreadyAnswering = busy || pendingText !== null;
      if (!agentAlreadyAnswering) responseSeen = false;
      // Match from the first unconfirmed paragraph: the pace may already have walked ahead of it
      const turnId = lines[before].turnId ?? -1;
      let from = before;
      while (from > 0 && lines[from - 1].type === 'actor' && lines[from - 1].turnId === turnId) from--;
      const h = heardInCurrentTurn();
      if (h !== -1) from = Math.min(h + 1, before);
      const spokenThrough = findSpokenActorTurnEnd(lines, from, transcript);
      const through = spokenThrough === -1 ? from : spokenThrough;
      heard = { turnId, index: through };

      if (lines[through]?.isTurnEnd === false) {
        // Still mid-speech: catch the highlight up (never backwards) and keep pacing from there
        if (through + 1 > before) deps.advanceFrom(through);
        schedulePace();
        return;
      }
      clearPaceTimer();
      deps.advanceFrom(through);

      const landed = deps.getCurrentIndex();
      if (!agentAlreadyAnswering && landed !== before && lines[landed]?.type === 'ai') {
        // The agent answers the user on its own; step in only if it stays quiet
        armCue(() => {
          if (!responseSeen) cueIfIdle(landed);
        });
      }
    },

    markCued(index) {
      lastCued = index;
      clearCueTimer();
    },

    reset() {
      clearResponseTimer();
      clearCueTimer();
      clearPaceTimer();
      heard = null;
      pendingText = null;
      audio = 'none';
      busy = false;
      responseSeen = false;
      lastCued = -1;
      discarding = false;
    },
  };
}
