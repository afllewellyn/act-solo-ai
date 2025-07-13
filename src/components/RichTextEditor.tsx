import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, List, ListOrdered, Quote, Undo, Redo, Type } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}
export function RichTextEditor({
  content,
  onChange,
  placeholder
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, FontFamily],
    content,
    onUpdate: ({
      editor
    }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4'
      }
    }
  });
  if (!editor) {
    return null;
  }
  const setFontFamily = (fontFamily: string) => {
    if (fontFamily === 'default') {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(fontFamily).run();
    }
  };
  return <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Text formatting */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive('bold')} className="data-[active=true]:bg-accent">
              <Bold className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} data-active={editor.isActive('italic')} className="data-[active=true]:bg-accent">
              <Italic className="h-4 w-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-8" />

          {/* Font family */}
          <Select onValueChange={setFontFamily}>
            <SelectTrigger className="w-[140px]">
              <Type className="h-4 w-4 mr-2" />
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

          {/* Lists */}
          <div className="flex items-center gap-1">
            
            
          </div>

          

          {/* Block formatting */}
          

          <Separator orientation="vertical" className="h-8" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
              <Undo className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md min-h-[300px]">
          <EditorContent editor={editor} placeholder={placeholder} className="min-h-[300px]" />
        </div>
      </CardContent>
    </Card>;
}