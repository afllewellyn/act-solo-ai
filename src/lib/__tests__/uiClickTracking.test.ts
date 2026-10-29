import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import posthog from 'posthog-js';
import { initUiClickTracking, getButtonId } from '../uiClickTracking';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

type W = Window & { dataLayer?: Record<string, unknown>[] };
beforeAll(() => initUiClickTracking());
beforeEach(() => vi.mocked(posthog.capture).mockClear());

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
  it('captures ui_click to PostHog with the same id and label', () => {
    document.body.innerHTML = '<button data-track="practice_start_rehearsal">Start rehearsal</button>';
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(posthog.capture).toHaveBeenCalledWith('ui_click', {
      button_id: 'practice_start_rehearsal',
      button_label: 'Start rehearsal',
      page_path: window.location.pathname,
    });
  });
  it('uses data-track-label instead of an aria-label that embeds a script title', () => {
    document.body.innerHTML =
      '<button data-track="scripts_rehearse" data-track-label="Rehearse script" aria-label="Rehearse Hamlet audition">Rehearse</button>';
    (document.querySelector('button') as HTMLButtonElement).click();
    const payload = JSON.stringify([vi.mocked(posthog.capture).mock.calls, (window as W).dataLayer!.at(-1)]);
    expect(payload).toContain('Rehearse script');
    expect(payload).not.toContain('Hamlet');
  });
  it('does not capture to PostHog for voice previews', () => {
    document.body.innerHTML = '<button id="voice-preview-liam">Liam</button>';
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
