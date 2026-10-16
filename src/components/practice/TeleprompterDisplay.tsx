import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { hideCharacterNamePrefixHtml } from '@/components/practice/rehearsal/textUtils';
import { cn } from '@/lib/utils';

interface TeleprompterDisplayProps {
  lines: ScriptLine[];
  activeIndex: number;
  fontSize: number;
  status: 'idle' | 'connecting' | 'listening' | 'ai' | 'paused' | 'complete';
  onSelectLine: (index: number) => void;
  hideNames?: boolean;
  /** Continuous teleprompter mode: the script scrolls on its own; the line on the eye-line is highlighted. */
  continuous?: boolean;
  /** Whether the continuous scroll is moving (false = paused). */
  playing?: boolean;
  /** Continuous scroll speed in pixels per second. */
  speed?: number;
}

const EYELINE = 0.28;
/** Space kept clear at the bottom (the fade mask) when fitting a tall line on screen. */
const BOTTOM_MARGIN_PX = 112;
/** A tall line is never pushed higher than this fraction of the viewport. */
const MIN_TOP_FRACTION = 0.1;
/** After a manual scroll, leave the view alone this long before re-centring. */
const MANUAL_SCROLL_GRACE_MS = 1500;

/** Dark studio teleprompter: active cue pinned to the eye-line at ~28% height. */
export const TeleprompterDisplay = ({ lines, activeIndex, fontSize, status, onSelectLine, hideNames = false, continuous = false, playing = false, speed = 40 }: TeleprompterDisplayProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const displayLines = useMemo(
    () => hideNames ? lines.map((line) => ({ ...line, content: hideCharacterNamePrefixHtml(line.content) })) : lines,
    [hideNames, lines],
  );

  const manualUntilRef = useRef(0);
  const [eyeIndex, setEyeIndex] = useState(activeIndex);
  const shownIndex = continuous ? eyeIndex : activeIndex;
  const activeIndexRef = useRef(shownIndex);
  activeIndexRef.current = shownIndex;

  const centreLine = useCallback((index: number, force = false) => {
    const container = scrollRef.current;
    const el = lineRefs.current[index];
    if (!container || !el) return;
    if (!force && Date.now() < manualUntilRef.current) return;
    const rect = el.getBoundingClientRect();
    const lineTop = rect.top - container.getBoundingClientRect().top + container.scrollTop;
    const viewport = container.clientHeight;
    const eyeOffset = viewport * EYELINE - 24;
    let top = lineTop - eyeOffset;
    const overflow = eyeOffset + rect.height - (viewport - BOTTOM_MARGIN_PX);
    if (overflow > 0) top += Math.min(overflow, Math.max(0, eyeOffset - viewport * MIN_TOP_FRACTION));
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);
  const centreActive = useCallback((force = false) => centreLine(activeIndexRef.current, force), [centreLine]);

  // Cue mode: follow the engine's line. Continuous mode: only catch up if the engine is ahead.
  const eyeIndexRef = useRef(eyeIndex);
  eyeIndexRef.current = eyeIndex;

  // Cue mode follows the engine. Continuous mode keeps the scroll moving; routine cue updates should
  // not snap the script ahead and visually skip lines.
  useLayoutEffect(() => {
    manualUntilRef.current = 0;
    if (!continuous) centreLine(activeIndex, true);
    else if (activeIndex > eyeIndexRef.current) setEyeIndex(activeIndex);
  }, [activeIndex, continuous, centreLine]);

  // Continuous scroll loop (fractional accumulator so slow speeds still move)
  useEffect(() => {
    if (!continuous || !playing) return;
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (Date.now() >= manualUntilRef.current) {
        carry += speed * dt;
        const step = Math.floor(carry);
        if (step > 0) { container.scrollTop += step; carry -= step; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [continuous, playing, speed]);

  // Continuous mode: highlight whichever line sits on the eye-line
  useEffect(() => {
    if (!continuous) return;
    const container = scrollRef.current;
    if (!container) return;
    const update = () => {
      const box = container.getBoundingClientRect();
      const eye = box.top + container.clientHeight * EYELINE;
      let best = 0;
      lineRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= eye + 8) best = i;
      });
      setEyeIndex(best);
    };
    update();
    container.addEventListener('scroll', update, { passive: true });
    return () => container.removeEventListener('scroll', update);
  }, [continuous, displayLines]);

  // Text size / content changes re-centre unless the user is scrolling by hand
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  useLayoutEffect(() => {
    if (!continuousRef.current) centreActive();
  }, [centreActive, fontSize, lines.length, hideNames]);

  // Re-centre on resize / rotation, and pause auto-scroll briefly after manual scrolling
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const pause = () => { manualUntilRef.current = Date.now() + MANUAL_SCROLL_GRACE_MS; };
    container.addEventListener('wheel', pause, { passive: true });
    container.addEventListener('touchmove', pause, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!continuousRef.current) centreActive(); }) : null;
    observer?.observe(container);
    return () => {
      container.removeEventListener('wheel', pause);
      container.removeEventListener('touchmove', pause);
      observer?.disconnect();
    };
  }, [centreActive]);

  const statusLabel = {
    idle: 'Ready',
    connecting: 'Connecting…',
    listening: 'Listening…',
    ai: 'AI speaking',
    paused: 'Paused',
    complete: 'Scene complete',
  }[status];

  return (
    <div className="relative flex-1 min-h-0 bg-studio text-studio-fg overflow-hidden">
      {/* Camera marker */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-studio-muted">
        <span className="h-2.5 w-2.5 rounded-full bg-studio-fg/80 ring-4 ring-studio-fg/10" /> Camera
      </div>

      {/* Eye-line guide + status */}
      <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${EYELINE * 100}%` }}>
        <div className="border-t border-dashed border-eyeline/70" />
        <div className="absolute right-4 -top-3.5 flex items-center gap-2 rounded-full bg-studio px-3 py-1 text-xs font-medium" aria-live="polite">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              (status === 'listening' || status === 'connecting') && 'bg-eyeline animate-pulse',
              status === 'ai' && 'bg-studio-fg animate-pulse',
              (status === 'idle' || status === 'paused' || status === 'complete') && 'bg-studio-muted',
            )}
          />
          <span className={status === 'listening' ? 'text-eyeline' : 'text-studio-fg'}>{statusLabel}</span>
        </div>
      </div>

      {/* Fade masks */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-studio to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-studio to-transparent z-10" />

      <div ref={scrollRef} className="relative h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-5 sm:px-10" style={{ paddingTop: `${EYELINE * 100}vh`, paddingBottom: '70vh' }}>
          {lines.length === 0 && (
            <p className="text-studio-muted text-center text-lg">This script has no lines yet. Tap Edit script to add some.</p>
          )}
          {displayLines.map((line, i) => {
            const active = i === shownIndex;
            const past = i < shownIndex;
            const isYou = line.type === 'actor';
            return (
              <div
                key={i}
                ref={(el) => (lineRefs.current[i] = el)}
                onClick={() => {
                  if (continuous) { setEyeIndex(i); centreLine(i, true); manualUntilRef.current = Date.now() + 700; }
                  onSelectLine(i);
                }}
                className={cn(
                  'relative my-3 rounded-2xl px-5 py-4 cursor-pointer transition-[background-color,opacity] duration-300',
                  active ? 'bg-studio-cue' : 'hover:bg-studio-surface/50',
                  past && 'opacity-30',
                  !active && !past && 'opacity-60',
                )}
              >
                {active && (
                  <span
                    className={cn(
                      'absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.15em] uppercase',
                      isYou ? 'bg-eyeline text-studio' : 'bg-studio-fg text-studio',
                    )}
                  >
                    {isYou ? 'You' : 'AI'}
                  </span>
                )}
                <div
                  className={cn('leading-snug [&_strong]:font-bold [&_em]:italic', isYou ? 'font-semibold' : 'italic')}
                  style={{ fontSize: active ? fontSize * 1.35 : fontSize }}
                  dangerouslySetInnerHTML={{ __html: line.content }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
