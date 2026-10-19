import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeleprompterDisplay, tallLineScrollTarget } from '../TeleprompterDisplay';
import type { ScriptLine } from '@/components/practice/rehearsal/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORT = 800;
const GAP = 200;
const FIRST_TOP = 300; // padding above the first line inside the scroll content
let lineHeights: number[] = [];
const scrollTo = vi.fn();

const originalRect = HTMLElement.prototype.getBoundingClientRect;
const originalScrollTo = HTMLElement.prototype.scrollTo;

const lines: ScriptLine[] = ['ai', 'actor', 'ai', 'actor'].map((type, i) => ({
  type: type as ScriptLine['type'],
  dialogue: `line ${i}`,
  content: `<p>line ${i}</p>`,
  paragraphIndex: i,
}));

describe('TeleprompterDisplay scrolling', () => {
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    scrollTo.mockClear();
    lineHeights = [150, 150, 150, 150];
    // jsdom has no layout: place lines in a column inside a fixed-height scroll container
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('overflow-y-auto')) return { top: 0, height: VIEWPORT } as DOMRect;
      const index = this.parentElement && this.classList.contains('my-3')
        ? Array.from(this.parentElement.children).indexOf(this)
        : -1;
      if (index >= 0) return { top: FIRST_TOP + index * GAP, height: lineHeights[index] } as DOMRect;
      return { top: 0, height: 0 } as DOMRect;
    };
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        const index = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
        return lineHeights[index] ?? 0;
      },
    });
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  });

  const render = (activeIndex: number, status: 'idle' | 'listening' | 'ai' = 'ai') =>
    act(async () =>
      root.render(
        <TeleprompterDisplay lines={lines} activeIndex={activeIndex} fontSize={24} status={status} onSelectLine={() => {}} />,
      ),
    );

  it('scrolls to every line as the active line advances, smoothly, with no manual input', async () => {
    await render(0);
    await render(1);
    await render(2);
    await render(3);

    const tops = scrollTo.mock.calls.map(([arg]) => (arg as ScrollToOptions).top);
    // each line sits on the eye-line: lineTop - (28% of viewport - 24)
    const eyeOffset = VIEWPORT * 0.28 - 24;
    expect(tops.slice(-4)).toEqual([0, 1, 2, 3].map((i) => Math.max(0, FIRST_TOP + i * GAP - eyeOffset)));
    expect(scrollTo.mock.calls.every(([arg]) => (arg as ScrollToOptions).behavior === 'smooth')).toBe(true);
    expect(container.querySelector('.scroll-smooth')).toBeNull(); // JS owns the animation, no double smoothing
  });

  it('lifts a tall active line so all of it stays in frame', async () => {
    lineHeights = [150, 600, 150, 150];
    await render(1);
    const eyeOffset = VIEWPORT * 0.28 - 24; // 200
    const lineTop = FIRST_TOP + GAP;
    const top = (scrollTo.mock.calls.at(-1)![0] as ScrollToOptions).top!;
    const lineBottomOnScreen = lineTop - top + 600;
    expect(lineBottomOnScreen).toBeLessThanOrEqual(VIEWPORT - 100); // clear of the bottom fade
    expect(lineTop - top).toBeGreaterThanOrEqual(VIEWPORT * 0.08); // top still on screen
    expect(lineTop - top).toBeLessThan(eyeOffset); // moved up from the eye-line
  });

  it('leaves a line that already fits on the eye-line', async () => {
    await render(2);
    const top = (scrollTo.mock.calls.at(-1)![0] as ScrollToOptions).top!;
    expect(FIRST_TOP + 2 * GAP - top).toBeCloseTo(VIEWPORT * 0.28 - 24, 5);
  });

  it('keeps the highlight on the engine index no matter where the view is scrolled', async () => {
    await render(2);
    const scroller = container.querySelector('.overflow-y-auto') as HTMLElement;
    // Simulate the user flinging the view so a different line sits on the eye-line
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));

    const highlighted = container.querySelectorAll('.bg-studio-cue');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain('line 2');
  });

  it('crawls a too-tall cue gently after a beat and stops at its bottom edge', async () => {
    vi.useFakeTimers();
    try {
      lineHeights = [150, 1200, 150, 150]; // taller than the viewport even when lifted
      await render(1, 'listening');
      const scroller = container.querySelector('.overflow-y-auto') as HTMLElement;
      const target = tallLineScrollTarget(FIRST_TOP + GAP, 1200, VIEWPORT);
      expect(target).toBeGreaterThan(0);

      // Nothing moves during the hold beat
      await act(async () => { vi.advanceTimersByTime(1400); });
      expect(scroller.scrollTop).toBe(0);

      // After the hold, the crawl moves the view but never past the cue's bottom edge
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(scroller.scrollTop).toBeGreaterThan(0);
      expect(scroller.scrollTop).toBeLessThanOrEqual(target);

      await act(async () => { vi.advanceTimersByTime(120000); });
      expect(scroller.scrollTop).toBeLessThanOrEqual(target + 0.5);
      expect(scroller.scrollTop).toBeGreaterThan(target - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not crawl a tall cue while paused or idle', async () => {
    vi.useFakeTimers();
    try {
      lineHeights = [150, 1200, 150, 150];
      await render(1, 'idle');
      const scroller = container.querySelector('.overflow-y-auto') as HTMLElement;
      await act(async () => { vi.advanceTimersByTime(10000); });
      expect(scroller.scrollTop).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('tallLineScrollTarget', () => {
  it('stops with the cue bottom just above the bottom fade mask', () => {
    expect(tallLineScrollTarget(500, 1200, 800)).toBe(500 + 1200 - (800 - 112));
  });

  it('never scrolls backwards past the top', () => {
    expect(tallLineScrollTarget(100, 50, 800)).toBe(0);
  });
});
