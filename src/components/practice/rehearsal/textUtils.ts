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
  
  return Array.from(elements)
    .map(element => {
      let text = element.textContent || '';
      // Strip character names (e.g., "Anna: Hello" -> "Hello")
      const characterMatch = text.match(/^([A-Za-z][A-Za-z\s\-\'\.]+):\s*(.+)$/);
      return characterMatch ? characterMatch[2] : text;
    })
    .filter(text => text.trim().length > 0)
    .join(' ')
    .trim();
};