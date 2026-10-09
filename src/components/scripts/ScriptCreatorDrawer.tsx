import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { RichTextEditor } from '@/components/RichTextEditor';
import { stripHtmlTags, CHARACTER_LINE_REGEX } from '@/components/practice/rehearsal/textUtils';
import { Bold, Italic, Play, Save } from 'lucide-react';

export interface EditableScript {
  id: string;
  title: string;
  content: string;
  characters: unknown;
}

interface ScriptCreatorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the drawer edits this script instead of creating a new one */
  script?: EditableScript | null;
  onSaved: () => void;
}

const detectCharacters = (scriptContent: string): string[] => {
  const plainText = stripHtmlTags(scriptContent);
  const regex = new RegExp(CHARACTER_LINE_REGEX.source, 'gmi');
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(plainText)) !== null) {
    names.add(m[1].trim());
  }
  return Array.from(names);
};

const ScriptCreatorDrawer = ({ open, onOpenChange, script, onSaved }: ScriptCreatorDrawerProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [characters, setCharacters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isEditing = Boolean(script);

  // Load script into the drawer when editing; reset when creating
  useEffect(() => {
    if (open) {
      setTitle(script?.title ?? '');
      setContent(script?.content ?? '');
      setCharacters(script ? detectCharacters(script.content) : []);
    }
  }, [open, script]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setCharacters(detectCharacters(value));
  };

  const validate = (): boolean => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: 'Missing details',
        description: 'Please provide both a title and script content',
        variant: 'destructive',
      });
      return false;
    }
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to save scripts',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const saveScript = async (): Promise<string | null> => {
    if (!validate() || !user) return null;
    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        characters: characters.map((name) => ({
          name,
          voice: '9BWtsMINqrJLrRacOk9x',
          isUserRole: false,
        })) as unknown as Json,
      };

      if (isEditing && script) {
        const { error } = await supabase
          .from('scripts')
          .update(payload)
          .eq('id', script.id);
        if (error) throw error;
        return script.id;
      }

      const { data, error } = await supabase
        .from('scripts')
        .insert({ user_id: user.id, ...payload })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (error) {
      console.error('Error saving script:', error);
      toast({
        title: 'Error',
        description: 'Failed to save script. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const id = await saveScript();
    if (!id) return;
    toast({
      title: 'Success',
      description: isEditing ? 'Script updated!' : 'Script saved successfully!',
    });
    onOpenChange(false);
    onSaved();
  };

  const handleSaveAndRehearse = async () => {
    const id = await saveScript();
    if (!id) return;
    onOpenChange(false);
    onSaved();
    navigate(`/practice/${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Script' : 'New Script'}</SheetTitle>
          <SheetDescription>
            Paste your scene below. Format each line as{' '}
            <span className="font-mono text-xs">NAME: dialogue</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 py-6">
          <div className="space-y-2">
            <Label htmlFor="drawer-title">Script title</Label>
            <Input
              id="drawer-title"
              placeholder="e.g. Pilot — Scene 4"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="drawer-content">Script</Label>
            <RichTextEditor
              content={content}
              onChange={handleContentChange}
              placeholder="Paste your script here...

CHARACTER NAME: Dialogue goes here
ANOTHER CHARACTER: More dialogue..."
            />
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Bold className="h-3 w-3" /> Bold = your lines
              </span>
              <span className="inline-flex items-center gap-1">
                <Italic className="h-3 w-3" /> Italic = AI scene partner
              </span>
            </p>
          </div>

          {characters.length > 0 && (
            <div className="space-y-2">
              <Label>Detected characters</Label>
              <div className="flex flex-wrap gap-2">
                {characters.map((name) => (
                  <span
                    key={name}
                    className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/30"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={loading}
            variant="outline"
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving…' : 'Save'}
          </Button>
          <Button
            onClick={handleSaveAndRehearse}
            disabled={loading}
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            Save &amp; Rehearse
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ScriptCreatorDrawer;
