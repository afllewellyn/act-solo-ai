import { Character, TextFilter } from './ScriptRehearsalStateMachine';
import { getScriptLines, checkLineMatchesFilter } from '@/components/practice/rehearsal/scriptParser';
import { stripHtmlTags, extractFormattedText } from '@/components/practice/rehearsal/textUtils';

/**
 * Script Parser Service
 * 
 * Centralized service for all script parsing operations.
 * Handles text filtering, character analysis, and content extraction.
 */
export class ScriptParserService {
  /**
   * Parse script content into processable lines with filtering
   */
  static parseScriptLines(
    scriptContent: string,
    characters: Character[],
    textFilter: TextFilter
  ) {
    return getScriptLines(scriptContent, characters, textFilter);
  }

  /**
   * Extract text for TTS based on filter type with strict mode
   */
  static extractTextForTTS(
    scriptContent: string,
    characters: Character[],
    textFilter: TextFilter,
    strictMode: boolean = true
  ): { text: string; hasContent: boolean; fallbackApplied: boolean } {
    if (!scriptContent?.trim()) {
      return { text: '', hasContent: false, fallbackApplied: false };
    }

    let extractedText = '';
    let fallbackApplied = false;

    switch (textFilter) {
      case 'all':
        extractedText = stripHtmlTags(scriptContent);
        break;
        
      case 'bold':
        extractedText = extractFormattedText(scriptContent, 'bold');
        if (!extractedText.trim()) {
          if (strictMode) {
            console.log('🚫 No bold text found - strict mode, returning empty');
            return { text: '', hasContent: false, fallbackApplied: false };
          } else {
            console.warn('No bold text found, falling back to all text');
            extractedText = stripHtmlTags(scriptContent);
            fallbackApplied = true;
          }
        }
        break;
        
      case 'italic':
        extractedText = extractFormattedText(scriptContent, 'italic');
        if (!extractedText.trim()) {
          if (strictMode) {
            console.log('🚫 No italic text found - strict mode, returning empty');
            return { text: '', hasContent: false, fallbackApplied: false };
          } else {
            console.warn('No italic text found, falling back to all text');
            extractedText = stripHtmlTags(scriptContent);
            fallbackApplied = true;
          }
        }
        break;
        
      default:
        extractedText = stripHtmlTags(scriptContent);
    }

    return {
      text: extractedText.trim(),
      hasContent: extractedText.trim().length > 0,
      fallbackApplied
    };
  }

  /**
   * Extract only AI character dialogue for TTS
   */
  static extractAIDialogue(
    scriptContent: string,
    characters: Character[]
  ): string {
    const lines = scriptContent.split('\n');
    const dialogueLines: string[] = [];
    
    lines.forEach(line => {
      const cleanLine = stripHtmlTags(line);
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const dialogue = characterMatch[2].trim();
        
        // Check if character should be spoken by AI
        const character = characters.find(c => c.name === characterName);
        if (!character || !character.isUserRole) {
          dialogueLines.push(dialogue);
        }
      }
    });
    
    return dialogueLines.join(' ').trim();
  }

  /**
   * Analyze script for content availability
   */
  static analyzeScriptContent(
    scriptContent: string,
    characters: Character[]
  ) {
    const analysis = {
      totalLines: 0,
      actorLines: 0,
      aiLines: 0,
      hasFormattedText: {
        bold: false,
        italic: false
      },
      characterBreakdown: new Map<string, number>()
    };

    if (!scriptContent?.trim()) {
      return analysis;
    }

    const lines = scriptContent.split('\n').filter(line => 
      stripHtmlTags(line).trim().length > 0
    );

    analysis.totalLines = lines.length;

    // Check for formatted text
    analysis.hasFormattedText.bold = extractFormattedText(scriptContent, 'bold').length > 0;
    analysis.hasFormattedText.italic = extractFormattedText(scriptContent, 'italic').length > 0;

    // Analyze character lines
    lines.forEach(line => {
      const cleanLine = stripHtmlTags(line).trim();
      const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const character = characters.find(c => c.name === characterName);
        
        // Count lines by type
        if (character?.isUserRole) {
          analysis.actorLines++;
        } else {
          analysis.aiLines++;
        }

        // Track character breakdown
        const currentCount = analysis.characterBreakdown.get(characterName) || 0;
        analysis.characterBreakdown.set(characterName, currentCount + 1);
      }
    });

    return analysis;
  }

  /**
   * Validate text filter compatibility with script content
   */
  static validateTextFilter(
    scriptContent: string,
    textFilter: TextFilter,
    characters: Character[]
  ): { isValid: boolean; reason?: string; fallbackFilter?: TextFilter } {
    if (!scriptContent?.trim()) {
      return { isValid: false, reason: 'No script content' };
    }

    switch (textFilter) {
      case 'bold':
        if (extractFormattedText(scriptContent, 'bold').length === 0) {
          return { 
            isValid: false, 
            reason: 'No bold text found in script',
            fallbackFilter: 'all'
          };
        }
        break;
        
      case 'italic':
        if (extractFormattedText(scriptContent, 'italic').length === 0) {
          return { 
            isValid: false, 
            reason: 'No italic text found in script',
            fallbackFilter: 'all'
          };
        }
        break;
        
      case 'all':
      default:
        // 'all' filter is always valid if there's content
        break;
    }

    return { isValid: true };
  }

  /**
   * Extract dialogue text from a script line
   */
  static extractDialogueFromLine(line: string): string {
    // Remove character name prefix
    const withoutCharacter = line.replace(/^[A-Z][A-Z\s\-\'\.]+:\s*/, '');
    // Remove HTML tags
    const cleanText = stripHtmlTags(withoutCharacter);
    return cleanText.trim();
  }

  /**
   * Check if a line belongs to a user character
   */
  static isUserCharacterLine(line: string, characters: Character[]): boolean {
    const cleanLine = stripHtmlTags(line).trim();
    const characterMatch = cleanLine.match(/^([A-Z][A-Z\s\-\'\.]+):/);
    
    if (characterMatch) {
      const characterName = characterMatch[1].trim();
      const character = characters.find(c => c.name === characterName);
      return character?.isUserRole || false;
    }
    
    return false;
  }
}