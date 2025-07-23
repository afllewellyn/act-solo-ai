import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Extension } from '@tiptap/core';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, Undo, Redo, Type, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

interface InlineScriptEditorProps {
  scriptId: string;
  content: string;
  characters: Character[];
  fontSize: number;
  onContentChange: (content: string) => void;
  onAutoSave?: (success: boolean) => void;
  showToolbar?: boolean;
}

// Custom extension for character highlighting
const CharacterHighlight = Extension.create({
  name: 'characterHighlight',
  
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          characterName: {
            default: null,
            parseHTML: element => element.getAttribute('data-character'),
            renderHTML: attributes => {
              if (!attributes.characterName) {
                return {};
              }
              return {
                'data-character': attributes.characterName,
                class: 'character-highlight'
              };
            },
          },
        },
      },
    ];
  },
});

export function InlineScriptEditor({ 
  scriptId, 
  content, 
  characters, 
  fontSize, 
  onContentChange,
  onAutoSave,
  showToolbar = true
}: InlineScriptEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { toast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      CharacterHighlight,
    ],
    content,
    onUpdate: ({ editor }) => {
      const newContent = editor.getHTML();
      onContentChange(newContent);
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[400px] p-4 prose prose-lg max-w-none',
        style: `font-size: ${fontSize}px; line-height: 1.8;`,
        'data-tiptap-editor': 'true'
      },
      handleKeyDown: (view, event) => {
        // Don't prevent normal text editing shortcuts
        if (event.key === ' ' || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') {
          return false;
        }
        // Allow Ctrl/Cmd shortcuts for formatting
        if (event.ctrlKey || event.metaKey) {
          return false;
        }
        return false;
      }
    },
    immediatelyRender: false,
  });

  // Auto-save functionality with debouncing
  useEffect(() => {
    if (!editor) return;

    const saveTimeout = setTimeout(async () => {
      if (editor.getHTML() !== content) {
        await handleAutoSave();
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(saveTimeout);
  }, [editor?.getHTML()]);

  // Update editor content when prop changes (from external updates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Update font size
  useEffect(() => {
    if (editor) {
      const editorElement = editor.view.dom as HTMLElement;
      editorElement.style.fontSize = `${fontSize}px`;
    }
  }, [fontSize, editor]);

  // Apply character highlighting
  useEffect(() => {
    if (!editor) return;

    const applyCharacterHighlighting = () => {
      const content = editor.getHTML();
      let highlightedContent = content;

      characters.forEach((char, index) => {
        if (char.name) {
          const colors = [
            'rgb(59, 130, 246)',   // blue-500
            'rgb(34, 197, 94)',    // green-500
            'rgb(168, 85, 247)',   // purple-500
            'rgb(251, 146, 60)',   // orange-500
            'rgb(239, 68, 68)',    // red-500
            'rgb(99, 102, 241)',   // indigo-500
          ];
          const color = colors[index % colors.length];
          const roleIndicator = char.isUserRole ? ' (You)' : ' (AI)';
          
          const regex = new RegExp(`\\b${char.name}:`, 'gi');
          highlightedContent = highlightedContent.replace(
            regex,
            `<span style="color: ${color}; font-weight: 600;" data-character="${char.name}">${char.name}${roleIndicator}:</span>`
          );
        }
      });

      if (highlightedContent !== content) {
        editor.commands.setContent(highlightedContent, false);
      }
    };

    // Apply highlighting after a short delay to avoid conflicts with typing
    const highlightTimeout = setTimeout(applyCharacterHighlighting, 500);
    return () => clearTimeout(highlightTimeout);
  }, [characters, editor]);

  const handleAutoSave = useCallback(async () => {
    if (!editor || isSaving) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('scripts')
        .update({ content: editor.getHTML() })
        .eq('id', scriptId);

      if (error) throw error;

      setLastSaved(new Date());
      onAutoSave?.(true);
    } catch (error) {
      console.error('Auto-save error:', error);
      onAutoSave?.(false);
    } finally {
      setIsSaving(false);
    }
  }, [editor, scriptId, isSaving, onAutoSave]);

  const handleManualSave = async () => {
    await handleAutoSave();
    toast({
      title: "Script Saved",
      description: "Your changes have been saved successfully.",
    });
  };

  const setFontFamily = (fontFamily: string) => {
    if (!editor) return;
    if (fontFamily === 'default') {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(fontFamily).run();
    }
  };

  if (!editor) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <p className="text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Floating Toolbar */}
      {showToolbar && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b mb-4 p-2">
          <div className="flex flex-wrap items-center gap-2 justify-center">
            {/* Text formatting */}
            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleBold().run()}
                data-active={editor.isActive('bold')}
                className="data-[active=true]:bg-accent"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleItalic().run()}
                data-active={editor.isActive('italic')}
                className="data-[active=true]:bg-accent"
              >
                <Italic className="h-4 w-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-8" />


            {/* Font family */}
            <Select onValueChange={setFontFamily}>
              <SelectTrigger className="w-[120px] h-8">
                <Type className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="monospace">Monospace</SelectItem>
                <SelectItem value="cursive">Cursive</SelectItem>
                <SelectItem value="fantasy">Fantasy</SelectItem>
              </SelectContent>
            </Select>

            <Separator orientation="vertical" className="h-8" />

            {/* Undo/Redo */}
            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-8" />

            {/* Save button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualSave}
              disabled={isSaving}
              className="gap-1"
            >
              <Save className="h-3 w-3" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>

            {/* Auto-save indicator */}
            {lastSaved && (
              <span className="text-xs text-muted-foreground">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="relative">
        <EditorContent 
          editor={editor} 
          className="prose prose-lg max-w-none focus-within:outline-none"
          style={{ fontSize: `${fontSize}px` }}
        />
      </div>
    </div>
  );
}