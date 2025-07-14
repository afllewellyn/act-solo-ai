import { Character, TextFilter, ScriptLine } from './types';
import { stripHtmlTags, extractFormattedText } from './textUtils';

/**
 * Helper function to check if a line matches the current text filter
 */
export const checkLineMatchesFilter = (line: string, textFilter: TextFilter, characters: Character[]): boolean => {
  switch (textFilter) {
    case 'bold':
      return extractFormattedText(line, 'bold').length > 0;
    case 'italic':
      return extractFormattedText(line, 'italic').length > 0;
    case 'characters':
      // For characters filter, only include AI character lines
      const cleanLine = stripHtmlTags(line).trim();
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const character = characters.find(c => c.name === characterName);
        return !character || !character.isUserRole; // Only AI characters
      }
      return false;
    case 'all':
    default:
      return true; // Include all lines
  }
};

/**
 * Parse script lines for rehearsal mode with text filtering
 */
export const getScriptLines = (
  scriptContent: string,
  characters: Character[],
  textFilter: TextFilter
): ScriptLine[] => {
  if (!scriptContent) return [];
  
  const allLines = scriptContent.split('\n').filter(line => {
    const cleanLine = stripHtmlTags(line).trim();
    return cleanLine.length > 0;
  });
  
  // For rehearsal mode, we need to preserve ALL actor lines for proper listening sequence
  // Only filter AI lines based on text filter
  return allLines.map(line => {
    const cleanLine = stripHtmlTags(line).trim();
    
    // Check if this is a character line
    const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
    
    if (characterMatch) {
      const characterName = characterMatch[1].trim();
      const character = characters.find(c => c.name === characterName);
      
      if (character && character.isUserRole) {
        // This is an actor line - ALWAYS include it for proper listening sequence
        return { type: 'actor' as const, content: line, dialogue: characterMatch[2].trim() };
      } else {
        // This is an AI line - check if it should be included based on filter
        const shouldInclude = checkLineMatchesFilter(line, textFilter, characters);
        return shouldInclude ? { type: 'ai' as const, content: line, dialogue: characterMatch[2].trim() } : null;
      }
    } else {
      // Non-character line (stage direction, etc.) - check if it should be included
      const shouldInclude = checkLineMatchesFilter(line, textFilter, characters);
      return shouldInclude ? { type: 'ai' as const, content: line, dialogue: cleanLine } : null;
    }
  }).filter(Boolean) as ScriptLine[]; // Remove null entries
};