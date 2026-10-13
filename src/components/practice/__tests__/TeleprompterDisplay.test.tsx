import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeleprompterDisplay, type TeleprompterHandle } from '../TeleprompterDisplay';
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
      if (index >= 0) {
        const scrolled = this.closest('.overflow-y-auto')?.scrollTop ?? 0; // like real layout, lines move up as the view scrolls down
        return { top: FIRST_TOP + index * GAP - scrolled, height: lineHeights[index] } as DOMRect;
      }
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

  const handle = createRef<TeleprompterHandle>();

  const render = (activeIndex: number, followClock?: boolean) =>
    act(async () =>
      root.render(
        <TeleprompterDisplay
          ref={handle}
          lines={lines}
          activeIndex={activeIndex}
          fontSize={24}
          status="ai"
          followClock={followClock}
          onSelectLine={() => {}}
        />,
      ),
    );

  const scroller = () => container.querySelector('.overflow-y-auto') as HTMLElement;
  const setPosition = (index: number, fraction: number) => {
    act(() => handle.current!.setPosition({ index, fraction }));
    return scroller().scrollTop;
  };
  const EYE_OFFSET = VIEWPORT * 0.28 - 24; // 200
  const lineTop = (i: number) => FIRST_TOP + i * GAP;

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

  describe('setPosition (rehearsal clock)', () => {
    it('interpolates scrollTop between this line top and the next, minus the eye-line offset', async () => {
      await render(0);
      expect(setPosition(1, 0)).toBeCloseTo(lineTop(1) - EYE_OFFSET, 5);
      expect(setPosition(1, 0.5)).toBeCloseTo((lineTop(1) + lineTop(2)) / 2 - EYE_OFFSET, 5);
      expect(setPosition(1, 1)).toBeCloseTo(lineTop(2) - EYE_OFFSET, 5);
      // the end of one line is the start of the next: no jump at the hand-over
      expect(setPosition(2, 0)).toBeCloseTo(lineTop(2) - EYE_OFFSET, 5);
    });

    it('rises steadily through the lines and never moves backwards', async () => {
      await render(0);
      const tops: number[] = [];
      for (let i = 0; i < 3; i++) {
        for (let f = 0; f < 10; f++) tops.push(setPosition(i, f / 10));
      }
      for (let k = 1; k < tops.length; k++) {
        expect(tops[k] - tops[k - 1]).toBeCloseTo(GAP / 10, 5); // equal-height lines: a constant rate
      }
    });

    it('sets scrollTop directly, with no smooth scrollTo animation fighting it', async () => {
      await render(0);
      scrollTo.mockClear();
      setPosition(1, 0.3);
      setPosition(1, 0.6);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('carries on to the bottom of the last line, which has no next line to interpolate towards', async () => {
      await render(3);
      expect(setPosition(3, 0)).toBeCloseTo(lineTop(3) - EYE_OFFSET, 5);
      expect(setPosition(3, 0.5)).toBeCloseTo(lineTop(3) + 75 - EYE_OFFSET, 5);
      expect(setPosition(3, 1)).toBeCloseTo(lineTop(3) + 150 - EYE_OFFSET, 5);
    });

    it('clamps an out-of-range index and fraction instead of throwing', async () => {
      await render(0);
      expect(setPosition(-2, -1)).toBeCloseTo(lineTop(0) - EYE_OFFSET, 5);
      expect(setPosition(99, 5)).toBeCloseTo(lineTop(3) + 150 - EYE_OFFSET, 5);
    });

    it('while the clock owns the scroll, a new active line keeps the clock position instead of smooth-scrolling', async () => {
      await render(0, true);
      setPosition(0, 0.5);
      const held = scroller().scrollTop;
      expect(held).toBeCloseTo((lineTop(0) + lineTop(1)) / 2 - EYE_OFFSET, 5);

      scrollTo.mockClear();
      await render(1, true); // the clock moved the highlight on
      expect(scrollTo).not.toHaveBeenCalled();
      expect(scroller().scrollTop).toBeCloseTo(held, 5);

      // clock released (stopped or paused with a manual pick): idle smooth centring is back
      await render(2, false);
      const top = (scrollTo.mock.calls.at(-1)![0] as ScrollToOptions).top!;
      expect(lineTop(2) - top).toBeCloseTo(EYE_OFFSET, 5);
    });
  });
});
