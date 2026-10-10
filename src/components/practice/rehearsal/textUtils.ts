/**
 * Text processing utilities for rehearsal mode
 */

/**
 * Function to strip HTML tags and clean text for TTS
 */
export const stripHtmlTags = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  let cleanText = tempDiv.textContent || tempDiv.innerText || '';
  cleanText = cleanText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  return cleanText;
};

// Standardized character line helpers
export const CHARACTER_LINE_REGEX = /^([A-Za-z][A-Za-z\s\-'.]+):\s*(.+)$/i;
export function matchCharacterLine(text: string) {
  return text.match(CHARACTER_LINE_REGEX);
}
export function stripCharacterNamePrefix(text: string): string {
  const match = matchCharacterLine(text.trim());
  return match ? match[2].trim() : text.trim();
}

/** Remove a leading character label from HTML while preserving inline formatting. */
export function hideCharacterNamePrefixHtml(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  const text = container.textContent || '';
  const match = text.match(CHARACTER_LINE_REGEX);
  if (!match) return html;

  const prefixLength = match[0].length - match[2].length;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  let remaining = prefixLength;
  for (const node of textNodes) {
    if (remaining === 0) break;
    const removeLength = Math.min(remaining, node.data.length);
    node.data = node.data.slice(removeLength);
    remaining -= removeLength;
  }

  return container.innerHTML;
}

/**
 * Extract formatted text (bold or italic) and strip character names
 */
export const extractFormattedText = (content: string, format: 'bold' | 'italic'): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  
  const selector = format === 'bold' ? 'b, strong' : 'i, em';
  const elements = tempDiv.querySelectorAll(selector);
  
  if (elements.length === 0) {
    return '';
  }
  
  const texts = Array.from(elements)
    .map(element => {
      const text = element.textContent || '';
      return stripCharacterNamePrefix(text);
    })
    .filter(text => text.trim().length > 0);

  return texts.join(' ').trim();
};

export type LineRole = 'ai' | 'actor' | 'note';

/**
 * Role of one script paragraph by formatting:
 * italic = AI reads it, bold = the user reads it, unformatted = stage note.
 * Italic wins when a line is both.
 */
export const getLineRole = (lineHtml: string): LineRole => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = lineHtml;
  const hasText = (selector: string) =>
    Array.from(tempDiv.querySelectorAll(selector)).some(el => (el.textContent || '').trim().length > 0);
  if (hasText('i, em')) return 'ai';
  if (hasText('b, strong')) return 'actor';
  return 'note';
};

/**
 * Count script lines per role, one per non-empty paragraph.
 */
export const countLineRoles = (html: string): { actor: number; ai: number; note: number } => {
  const counts = { actor: 0, ai: 0, note: 0 };
  if (!html) return counts;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  tempDiv.querySelectorAll('p').forEach(p => {
    if ((p.textContent || '').trim().length === 0) return;
    counts[getLineRole(p.innerHTML)]++;
  });
  return counts;
};

/**
 * Unique character names from `NAME: dialogue` paragraphs (optional feature), one match per paragraph.
 */
export const detectCharacterNames = (html: string): string[] => {
  const names = new Set<string>();
  if (!html) return [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  tempDiv.querySelectorAll('p').forEach(p => {
    const m = matchCharacterLine((p.textContent || '').trim());
    if (m) names.add(m[1].trim());
  });
  return Array.from(names);
};
