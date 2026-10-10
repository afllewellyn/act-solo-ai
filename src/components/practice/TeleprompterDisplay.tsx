import { useEffect, useMemo, useRef } from 'react';
import type { ScriptLine } from '@/components/practice/rehearsal/types';
import { hideCharacterNamePrefixHtml } from '@/components/practice/rehearsal/textUtils';
import { cn } from '@/lib/utils';

interface TeleprompterDisplayProps {
  lines: ScriptLine[];
  activeIndex: number;
  fontSize: number;
  status: 'idle' | 'listening' | 'ai' | 'paused' | 'complete';
  onSelectLine: (index: number) => void;
  hideNames?: boolean;
}

const EYELINE = 0.28;

/** Dark studio teleprompter: active cue pinned to the eye-line at ~28% height. */
export const TeleprompterDisplay = ({ lines, activeIndex, fontSize, status, onSelectLine, hideNames = false }: TeleprompterDisplayProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const displayLines = useMemo(
    () => hideNames ? lines.map((line) => ({ ...line, content: hideCharacterNamePrefixHtml(line.content) })) : lines,
    [hideNames, lines],
  );

  useEffect(() => {
    const container = scrollRef.current;
    const el = lineRefs.current[activeIndex];
    if (!container || !el) return;
    const top = el.offsetTop - container.clientHeight * EYELINE + 24;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex, fontSize, lines.length]);

  const statusLabel = {
    idle: 'Ready',
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
              status === 'listening' && 'bg-eyeline animate-pulse',
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

      <div ref={scrollRef} className="h-full overflow-y-auto scroll-smooth">
        <div className="max-w-4xl mx-auto px-5 sm:px-10" style={{ paddingTop: `${EYELINE * 100}vh`, paddingBottom: '70vh' }}>
          {lines.length === 0 && (
            <p className="text-studio-muted text-center text-lg">This script has no lines yet. Tap Edit script to add some.</p>
          )}
          {displayLines.map((line, i) => {
            const active = i === activeIndex;
            const past = i < activeIndex;
            const isYou = line.type === 'actor';
            return (
              <div
                key={i}
                ref={(el) => (lineRefs.current[i] = el)}
                onClick={() => onSelectLine(i)}
                className={cn(
                  'relative my-3 rounded-2xl px-5 py-4 cursor-pointer transition-all duration-300',
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
                  className={cn('leading-snug transition-all [&_strong]:font-bold [&_em]:italic', isYou ? 'font-semibold' : 'italic')}
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
