import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeleprompterDisplay } from '../TeleprompterDisplay';
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

  const render = (activeIndex: number) =>
    act(async () =>
      root.render(
        <TeleprompterDisplay lines={lines} activeIndex={activeIndex} fontSize={24} status="ai" onSelectLine={() => {}} />,
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
});
