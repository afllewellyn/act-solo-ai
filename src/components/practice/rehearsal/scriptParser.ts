import { TextFilter, ScriptLine } from './types';
import { stripHtmlTags, extractFormattedText, matchCharacterLine } from './textUtils';

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
  
  paragraphs.forEach((p) => {
    const lineHtml = p.innerHTML; // Preserve HTML for italic/bold detection
    const cleanText = (p.textContent || '').trim();
    
    if (cleanText.length === 0) return; // Skip empty paragraphs
    
    // Check if THIS specific paragraph is an AI line (contains italic)
    const isAI = isAILine(lineHtml, textFilter);
    
    // Check for character format: "NAME: dialogue"
    const characterMatch = matchCharacterLine(cleanText);
    const dialogue = characterMatch ? characterMatch[2].trim() : cleanText;
    
    console.log(`📝 Line: "${cleanText.substring(0, 30)}..." → ${isAI ? 'AI' : 'ACTOR'}`);
    
    filteredLines.push({
      type: isAI ? 'ai' as const : 'actor' as const,
      content: lineHtml,
      dialogue,
    });
  });
  
  console.log(`📊 Total: ${filteredLines.length} lines | AI: ${filteredLines.filter(l => l.type === 'ai').length} | Actor: ${filteredLines.filter(l => l.type === 'actor').length}`);
  
  return filteredLines;
};