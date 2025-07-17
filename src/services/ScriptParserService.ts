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
   * Parse script content for rehearsal mode - ALWAYS uses complete script (no filtering)
   * This ensures reliable turn-taking between actor and AI lines
   */
  static parseScriptLinesForRehearsal(
    scriptContent: string,
    characters: Character[]
  ) {
    return getScriptLines(scriptContent, characters, 'all');
  }

  /**
   * Parse script content into processable lines with filtering
   * Used for manual TTS and UI display only
   */
  static parseScriptLines(
    scriptContent: string,
    characters: Character[],
    textFilter: TextFilter
  ) {
    return getScriptLines(scriptContent, characters, textFilter);
  }

  /**
   * Extract text for TTS based on filter type - expects CHARACTER_NAME: dialogue format
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

    const lines = scriptContent.split('\n');
    const aiLines: string[] = [];
    let fallbackApplied = false;

    // Extract AI character lines using character name matching
    for (const line of lines) {
      const cleanLine = stripHtmlTags(line).trim();
      if (!cleanLine) continue;
      
      // Match character name format: CHARACTER_NAME: dialogue
      const characterMatch = cleanLine.match(/^([A-Za-z][A-Za-z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        const characterName = characterMatch[1].trim();
        const dialogue = characterMatch[2].trim();
        
        // Check if this character is an AI character (not user role)
        const character = characters.find(c => 
          c.name.toLowerCase() === characterName.toLowerCase()
        );
        
        if (character && !character.isUserRole) {
          aiLines.push(line);
        }
      }
    }

    console.log(`🎭 TTS: Found ${aiLines.length} AI character lines for filter: ${textFilter}`);

    let extractedText = '';

    // Apply text filter to AI lines only
    switch (textFilter) {
      case 'all':
        extractedText = aiLines.map(line => {
          const cleanLine = stripHtmlTags(line).trim();
          const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
          return match ? match[1] : cleanLine;
        }).join(' ');
        break;
        
      case 'bold':
        const boldLines = aiLines.filter(line => /<strong>.*<\/strong>/.test(line));
        extractedText = boldLines.map(line => {
          const cleanLine = stripHtmlTags(line).trim();
          const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
          return match ? match[1] : cleanLine;
        }).join(' ');
        
        if (!extractedText.trim() && !strictMode) {
          console.warn('🔄 No bold text in AI lines, falling back to all AI dialogue');
          extractedText = aiLines.map(line => {
            const cleanLine = stripHtmlTags(line).trim();
            const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
            return match ? match[1] : cleanLine;
          }).join(' ');
          fallbackApplied = true;
        }
        break;
        
      case 'italic':
        const italicLines = aiLines.filter(line => /<em>.*<\/em>/.test(line));
        extractedText = italicLines.map(line => {
          const cleanLine = stripHtmlTags(line).trim();
          const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
          return match ? match[1] : cleanLine;
        }).join(' ');
        
        if (!extractedText.trim() && !strictMode) {
          console.warn('🔄 No italic text in AI lines, falling back to all AI dialogue');
          extractedText = aiLines.map(line => {
            const cleanLine = stripHtmlTags(line).trim();
            const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
            return match ? match[1] : cleanLine;
          }).join(' ');
          fallbackApplied = true;
        }
        break;
        
      default:
        extractedText = aiLines.map(line => {
          const cleanLine = stripHtmlTags(line).trim();
          const match = cleanLine.match(/^[A-Za-z][A-Za-z\s\-\'\.]+:\s*(.+)$/);
          return match ? match[1] : cleanLine;
        }).join(' ');
    }

    const hasContent = extractedText.trim().length > 0;
    console.log(`📝 TTS: Extracted ${extractedText.length} characters from dialogue ${fallbackApplied ? '(with fallback)' : ''}`);

    return {
      text: extractedText.trim(),
      hasContent,
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