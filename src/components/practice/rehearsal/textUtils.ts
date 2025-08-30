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