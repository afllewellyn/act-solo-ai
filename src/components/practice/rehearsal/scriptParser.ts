import { TextFilter, ScriptLine } from './types';
import { stripHtmlTags, extractFormattedText, matchCharacterLine } from './textUtils';

/**
 * Helper function to check if a line matches the current text filter
 * Simplified for text-based filtering only
 */
export const checkLineMatchesFilter = (line: string, textFilter: TextFilter): boolean => {
  switch (textFilter) {
    case 'bold':
      return extractFormattedText(line, 'bold').length > 0;
    case 'italic':
      return extractFormattedText(line, 'italic').length > 0;
    case 'all':
    default:
      return true; // Include all lines
  }
};

/**
 * Parse script lines with text filtering - Simplified for text-based filtering
 * 
 * In this simplified version:
 * - Bold/Italic text = AI should read
 * - All other text = Available for reading
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
    
    if (characterMatch) {
      const dialogue = characterMatch[2].trim();
      
      // Check if line matches the text filter (bold/italic)
      const matchesFilter = checkLineMatchesFilter(line, textFilter);
      
      // Lines matching filter = AI reads them
      // Lines NOT matching filter = Actor reads them (we wait for cue)
      return { 
        type: matchesFilter ? 'ai' as const : 'actor' as const, 
        content: line, 
        dialogue 
      };
    } else {
      // Non-character line (stage direction, etc.)
      const matchesFilter = checkLineMatchesFilter(line, textFilter);
      
      return { 
        type: matchesFilter ? 'ai' as const : 'actor' as const, 
        content: line, 
        dialogue: cleanLine 
      };
    }
  }) as ScriptLine[];
  
  return filteredLines;
};