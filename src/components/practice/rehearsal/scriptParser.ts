import { TextFilter, ScriptLine } from './types';
import { stripHtmlTags, extractFormattedText } from './textUtils';

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
    const characterMatch = cleanLine.match(/^([A-Za-z][A-Za-z\s\-\'\.]+):\s*(.+)$/i);
    
    if (characterMatch) {
      const dialogue = characterMatch[2].trim();
      
      // Check if line should be included based on text filter
      const shouldInclude = checkLineMatchesFilter(line, textFilter);
      return shouldInclude ? { type: 'ai' as const, content: line, dialogue } : null;
    } else {
      // Non-character line (stage direction, etc.)
      const shouldInclude = checkLineMatchesFilter(line, textFilter);
      return shouldInclude ? { type: 'ai' as const, content: line, dialogue: cleanLine } : null;
    }
  }).filter(Boolean) as ScriptLine[];
  
  // Check if bold/italic filter returned no content
  if ((textFilter === 'bold' || textFilter === 'italic') && filteredLines.length === 0) {
    console.warn(`No ${textFilter} text found in script. Falling back to all text.`);
    return getScriptLines(scriptContent, 'all');
  }
  
  return filteredLines;
};