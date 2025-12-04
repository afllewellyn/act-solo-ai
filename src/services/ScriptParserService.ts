import { TextFilter } from './ScriptRehearsalStateMachine';
import { stripHtmlTags, extractFormattedText, matchCharacterLine, stripCharacterNamePrefix } from '@/components/practice/rehearsal/textUtils';

/**
 * Script Parser Service - Text-Based Filtering
 * 
 * Simplified service that works on text formatting:
 * - Italic text = AI reads (scene partner lines)
 * - Bold text = User reads (their lines to practice)
 * - All text = AI reads everything (listen mode)
 * - Character names are automatically stripped from TTS output
 */
export class ScriptParserService {
  /**
   * Extract text for TTS based on text formatting only
   * No character role dependencies - purely text-based filtering
   */
  static extractTextForTTS(
    scriptContent: string,
    textFilter: TextFilter,
    strictMode: boolean = true
  ): { text: string; hasContent: boolean; fallbackApplied: boolean } {
    if (!scriptContent?.trim()) {
      return { text: '', hasContent: false, fallbackApplied: false };
    }

    console.log(`📝 Extracting TTS text with filter: ${textFilter}`);
    let extractedText = '';
    let fallbackApplied = false;

    switch (textFilter) {
      case 'all':
        // Extract all text, remove character names
        extractedText = this.extractAllTextWithoutNames(scriptContent);
        break;
        
      case 'italic':
        extractedText = extractFormattedText(scriptContent, 'italic');
        if (!extractedText.trim() && !strictMode) {
          console.warn('🔄 No italic text found, falling back to all text');
          extractedText = this.extractAllTextWithoutNames(scriptContent);
          fallbackApplied = true;
        }
        break;
        
      default:
        extractedText = this.extractAllTextWithoutNames(scriptContent);
    }

    const hasContent = extractedText.trim().length > 0;
    console.log(`📝 TTS: Extracted ${extractedText.length} characters ${fallbackApplied ? '(with fallback)' : ''}`);

    return {
      text: extractedText.trim(),
      hasContent,
      fallbackApplied
    };
  }

  /**
   * Extract all text from script, removing character names
   * Converts "Anna: Hello there" to "Hello there"
   */
  private static extractAllTextWithoutNames(scriptContent: string): string {
    const lines = scriptContent.split('\n');
    const dialogueLines: string[] = [];
    
    lines.forEach(line => {
      const cleanLine = stripHtmlTags(line).trim();
      if (!cleanLine) return;
      
      // Check if line has character name format: "Name: dialogue" (mixed-case supported)
      const characterMatch = matchCharacterLine(cleanLine);
      
      if (characterMatch) {
        const dialogue = characterMatch[2].trim();
        if (dialogue) {
          dialogueLines.push(dialogue);
        }
      } else {
        dialogueLines.push(cleanLine);
      }
    });
    
    return dialogueLines.join(' ').trim();
  }

  /**
   * Analyze script for content availability - simplified version
   */
  static analyzeScriptContent(scriptContent: string) {
    const analysis = {
      totalLines: 0,
      hasFormattedText: {
        italic: false
      }
    };

    if (!scriptContent?.trim()) {
      return analysis;
    }

    const lines = scriptContent.split('\n').filter(line => 
      stripHtmlTags(line).trim().length > 0
    );

    analysis.totalLines = lines.length;
    analysis.hasFormattedText.italic = extractFormattedText(scriptContent, 'italic').length > 0;

    return analysis;
  }

  /**
   * Validate text filter compatibility with script content
   */
  static validateTextFilter(
    scriptContent: string,
    textFilter: TextFilter
  ): { isValid: boolean; reason?: string; fallbackFilter?: TextFilter } {
    if (!scriptContent?.trim()) {
      return { isValid: false, reason: 'No script content' };
    }

    switch (textFilter) {
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
   * Extract dialogue text from a script line, removing character names
   */
  static extractDialogueFromLine(line: string): string {
    // Remove HTML tags and then character name prefix (mixed-case)
    const withoutHtml = stripHtmlTags(line);
    const dialogue = stripCharacterNamePrefix(withoutHtml);
    return dialogue;
  }
}