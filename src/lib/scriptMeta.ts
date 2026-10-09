import { matchCharacterLine } from '@/components/practice/rehearsal/textUtils';

export interface DetectedCharacter {
  name: string;
  role: 'you' | 'ai' | 'unset';
}

const paragraphs = (html: string): HTMLElement[] => {
  if (!html) return [];
  const div = document.createElement('div');
  div.innerHTML = html;
  const ps = Array.from(div.querySelectorAll('p')) as HTMLElement[];
  if (ps.length) return ps;
  // Plain text fallback: one line per newline
  return html.split(/\n/).map((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    return p;
  });
};

/** Detect characters and whether each is the user (bold) or AI (italic). */
export const detectCharacterRoles = (html: string): DetectedCharacter[] => {
  const map = new Map<string, DetectedCharacter>();
  for (const p of paragraphs(html)) {
    const text = (p.textContent || '').trim();
    const m = matchCharacterLine(text);
    if (!m) continue;
    const name = m[1].trim().toUpperCase();
    const isBold = !!p.querySelector('b, strong');
    const isItalic = !!p.querySelector('i, em');
    const role: DetectedCharacter['role'] = isBold ? 'you' : isItalic ? 'ai' : 'unset';
    const existing = map.get(name);
    if (!existing) map.set(name, { name, role });
    else if (existing.role === 'unset') existing.role = role;
  }
  return Array.from(map.values());
};

/** Plain-text preview that keeps line breaks between paragraphs. */
export const getPreviewLines = (html: string, maxLines = 2): string[] =>
  paragraphs(html)
    .map((p) => (p.textContent || '').trim())
    .filter(Boolean)
    .slice(0, maxLines);

/** Rough read time (~150 words/minute), minimum 1. */
export const estimateMinutes = (html: string): number => {
  const words = paragraphs(html)
    .map((p) => p.textContent || '')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 150));
};
