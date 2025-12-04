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
  
  const allLines = scriptContent.split('\n').filter(line => {
    const cleanLine = stripHtmlTags(line).trim();
    return cleanLine.length > 0;
  });
  
  const filteredLines = allLines.map(line => {
    const cleanLine = stripHtmlTags(line).trim();
    
    // Check if this is a character line format: "NAME: dialogue"
    const characterMatch = matchCharacterLine(cleanLine);
    const dialogue = characterMatch ? characterMatch[2].trim() : cleanLine;
    
    // Determine if this is an AI line based on filter
    const isAI = isAILine(line, textFilter);
    
    return { 
      type: isAI ? 'ai' as const : 'actor' as const, 
      content: line, 
      dialogue 
    };
  }) as ScriptLine[];
  
  return filteredLines;
};