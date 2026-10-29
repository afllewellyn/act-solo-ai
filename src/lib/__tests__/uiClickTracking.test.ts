import { describe, it, expect, beforeAll } from 'vitest';
import { initUiClickTracking, getButtonId } from '../uiClickTracking';

type W = Window & { dataLayer?: Record<string, unknown>[] };
beforeAll(() => initUiClickTracking());

describe('ui click tracking', () => {
  it('uses data-track as the stable button id', () => {
    document.body.innerHTML = '<button data-track="practice_start_rehearsal">Start rehearsal</button>';
    (document.querySelector('button') as HTMLButtonElement).click();
    const last = (window as W).dataLayer!.at(-1)!;
    expect(last).toMatchObject({ event: 'ui_click', button_id: 'practice_start_rehearsal', button_label: 'Start rehearsal' });
    expect(last.voice_name).toBeUndefined();
  });
  it('falls back to a slug of the aria-label', () => {
    document.body.innerHTML = '<button aria-label="Book a Session">x</button>';
    expect(getButtonId(document.querySelector('button')!)).toBe('home_book_a_session');
  });
  it('does not emit ui_click for voice previews', () => {
    document.body.innerHTML = '<button id="voice-preview-liam">Liam</button>';
    const before = (window as W).dataLayer!.length;
    (document.querySelector('button') as HTMLButtonElement).click();
    expect((window as W).dataLayer!.length).toBe(before);
  });
});
