// Site-wide button/link click tracking. Sends one `ui_click` per click to PostHog and the
// dataLayer, with a stable id: the element's `data-track`, else a slug of its accessible name.
// Never sends script text: names come from labels/visible button text only. A button whose
// accessible name embeds user content (e.g. a script title) sets a static `data-track-label`.

import posthog from 'posthog-js';

const SKIP_INSIDE = '[data-tiptap-editor]';

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

export function getButtonLabel(el: HTMLElement): string {
  return (el.getAttribute('data-track-label') || el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function getButtonId(el: HTMLElement): string {
  const explicit = el.getAttribute('data-track');
  if (explicit) return explicit;
  const page = slugify(window.location.pathname.split('/')[1] || 'home');
  return `${page}_${slugify(getButtonLabel(el)) || 'unlabeled'}`;
}

export function initUiClickTracking() {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>('button, a, [role="button"], [role="menuitem"], [data-track]');
      if (!el || el.closest(SKIP_INSIDE)) return;
      // Voice previews already emit their own dedicated event.
      if (el.closest('[id^="voice-preview-"]')) return;
      const button_id = getButtonId(el);
      const button_label = getButtonLabel(el);
      const page_path = window.location.pathname;
      posthog.capture('ui_click', { button_id, button_label, page_path });
      const w = window as Window & { dataLayer?: Record<string, unknown>[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: 'ui_click',
        button_id,
        button_label,
        page_path,
        // Reset voice fields so GTM doesn't carry values from an earlier preview click.
        voice_name: undefined,
        voice_id: undefined,
        preview_action: undefined,
      });
    },
    { capture: true },
  );
}
