import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudioScriptEditorProps {
  content: string;
  onChange: (html: string) => void;
  tone?: 'desk' | 'studio';
  className?: string;
}

/** Clean, borderless script editor with a slim B / I toolbar. */
export const StudioScriptEditor = ({ content, onChange, tone = 'desk', className }: StudioScriptEditorProps) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        'data-tiptap-editor': 'true',
        class: cn(
          'focus:outline-none min-h-[320px] text-lg leading-relaxed [&_p]:my-1.5',
          tone === 'studio' ? 'text-studio-fg' : 'text-foreground',
        ),
      },
    },
  });

  // Keep editor in sync when content is replaced from outside (e.g. "Paste sample scene")
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      'h-9 w-9 inline-flex items-center justify-center rounded-full transition-colors',
      tone === 'studio'
        ? active ? 'bg-studio-fg text-studio' : 'text-studio-fg hover:bg-studio-border'
        : active ? 'bg-foreground text-background' : 'text-foreground hover:bg-desk-chip',
    );

  return (
    <div
      className={cn(
        'rounded-2xl p-5 relative',
        tone === 'studio' ? 'bg-studio-surface' : 'bg-desk-surface shadow-sm',
        className,
      )}
    >
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-1 mb-3 border',
          tone === 'studio' ? 'border-studio-border' : 'border-border bg-background',
        )}
      >
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold (your line)">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic (AI line)">
          <Italic className="h-4 w-4" />
        </button>
        <span className={cn('mx-1 h-5 w-px', tone === 'studio' ? 'bg-studio-border' : 'bg-border')} />
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()} aria-label="Undo">
          <Undo className="h-4 w-4" />
        </button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()} aria-label="Redo">
          <Redo className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};
