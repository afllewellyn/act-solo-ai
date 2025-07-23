import { TextFilter } from './ScriptRehearsalStateMachine';
import { stripHtmlTags, extractFormattedText } from '@/components/practice/rehearsal/textUtils';

/**
 * Script Parser Service - Text-Based Filtering Only
 * 
 * Simplified service that works purely on text formatting without character role assignments.
 * - Bold text = AI should read
 * - Italic text = AI should read  
 * - All text = AI reads everything
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
        
      case 'bold':
        extractedText = extractFormattedText(scriptContent, 'bold');
        if (!extractedText.trim() && !strictMode) {
          console.warn('🔄 No bold text found, falling back to all text');
          extractedText = this.extractAllTextWithoutNames(scriptContent);
          fallbackApplied = true;
        }
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
      
      // Check if line has character name format: "NAME: dialogue"
      const characterMatch = cleanLine.match(/^([A-Za-z][A-Za-z\s\-\'\.]+):\s*(.+)$/);
      
      if (characterMatch) {
        // Extract just the dialogue part, not the character name
        const dialogue = characterMatch[2].trim();
        if (dialogue) {
          dialogueLines.push(dialogue);
        }
      } else {
        // Non-character line (stage directions, etc.)
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
        bold: false,
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
    analysis.hasFormattedText.bold = extractFormattedText(scriptContent, 'bold').length > 0;
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
   * Extract dialogue text from a script line, removing character names
   */
  static extractDialogueFromLine(line: string): string {
    // Remove character name prefix
    const withoutCharacter = line.replace(/^([A-Za-z][A-Za-z\s\-\'\.]+):\s*/i, '');
    // Remove HTML tags
    const cleanText = stripHtmlTags(withoutCharacter);
    return cleanText.trim();
  }
}