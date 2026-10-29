// Site-wide button/link click tracking. Pushes one `ui_click` dataLayer event per
// click with a stable id: the element's `data-track`, else a slug of its accessible name.
// Never sends script text: names come from labels/visible button text only.

const SKIP_INSIDE = '[data-tiptap-editor], [data-teleprompter-line]';

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

export function getButtonLabel(el: HTMLElement): string {
  return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
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
      if (el.closest('[data-voice-preview]')) return;
      const w = window as Window & { dataLayer?: Record<string, unknown>[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: 'ui_click',
        button_id: getButtonId(el),
        button_label: getButtonLabel(el),
        page_path: window.location.pathname,
        // Reset voice fields so GTM doesn't carry values from an earlier preview click.
        voice_name: undefined,
        voice_id: undefined,
        preview_action: undefined,
      });
    },
    { capture: true },
  );
}
