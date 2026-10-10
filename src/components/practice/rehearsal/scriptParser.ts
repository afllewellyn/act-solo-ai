import { TextFilter, ScriptLine } from './types';
import { extractFormattedText, getLineRole, matchCharacterLine } from './textUtils';

/**
 * Helper function to check if a line is an AI line based on text filter
 * - 'italic' filter: italic lines are AI lines
 * - 'all' filter: all lines are AI lines
 */
export const isAILine = (line: string, textFilter: TextFilter): boolean => {
  switch (textFilter) {
    case 'italic':
      // In italic mode, only italic lines are AI lines
      return extractFormattedText(line, 'italic').length > 0;
    case 'all':
    default:
      return true; // All lines are AI lines in full script mode
  }
};

/**
 * Parse script lines with text filtering
 * 
 * Convention:
 * - Italic text = AI reads these lines (scene partner)
 * - Bold text = User/Actor reads these (their lines to practice)
 * - Unformatted text = stage note (shown, skipped by the AI)
 * - 'all' filter = AI reads everything (listen mode)
 * - Character names are automatically stripped from dialogue
 */
export const getScriptLines = (
  scriptContent: string,
  textFilter: TextFilter
): ScriptLine[] => {
  if (!scriptContent) return [];
  
  // Parse HTML properly - TipTap uses <p> tags, not newlines
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = scriptContent;
  
  // Get all paragraph elements
  const paragraphs = tempDiv.querySelectorAll('p');
  
  const filteredLines: ScriptLine[] = [];
  let paragraphIndex = -1;

  paragraphs.forEach((p) => {
    const lineHtml = p.innerHTML; // Preserve HTML for italic/bold detection
    const cleanText = (p.textContent || '').trim();

    if (cleanText.length === 0) return; // Skip empty paragraphs
    paragraphIndex++;

    // Names are optional: strip a leading "NAME:" only when present
    const characterMatch = matchCharacterLine(cleanText);
    const dialogue = characterMatch ? characterMatch[2].trim() : cleanText;

    // 'all' (listen mode): AI reads everything. 'italic': italic = AI, bold = you, plain = stage note.
    const type: ScriptLine['type'] = textFilter === 'all' ? 'ai' : getLineRole(lineHtml);

    filteredLines.push({ type, content: lineHtml, dialogue, paragraphIndex });
  });

  return filteredLines;
};