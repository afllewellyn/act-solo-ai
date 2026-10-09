import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { StudioScriptEditor } from '@/components/scripts/StudioScriptEditor';
import { detectCharacterRoles } from '@/lib/scriptMeta';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

export interface EditableScript {
  id: string;
  title: string;
  content: string;
  characters: unknown;
}

interface ScriptCreatorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script?: EditableScript | null;
  onSaved: () => void;
}

const SAMPLE_SCENE = [
  "<p><strong>MAYA: You said you'd be home by eight.</strong></p>",
  '<p><em>DANIEL: I know what I said.</em></p>',
  '<p><strong>MAYA: Then where were you?</strong></p>',
  '<p><em>DANIEL: Driving. Just… driving.</em></p>',
  '<p><strong>MAYA: For three hours?</strong></p>',
  '<p><em>DANIEL: I needed to think, Maya.</em></p>',
].join('');

const DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x';

const ScriptCreatorDrawer = ({ open, onOpenChange, script, onSaved }: ScriptCreatorDrawerProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEditing = Boolean(script);

  useEffect(() => {
    if (open) {
      setTitle(script?.title ?? '');
      setContent(script?.content ?? '');
    }
  }, [open, script]);

  const detected = useMemo(() => detectCharacterRoles(content), [content]);

  const saveScript = async (): Promise<string | null> => {
    if (!title.trim() || !content.trim()) {
      toast({ title: 'Missing details', description: 'Add a title and your scene first.', variant: 'destructive' });
      return null;
    }
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to save scripts', variant: 'destructive' });
      return null;
    }
    setLoading(true);
    try {
      // Keep any voices already chosen for existing characters
      const previous: Array<{ name?: string; voice?: string }> = Array.isArray(script?.characters)
        ? (script?.characters as Array<{ name?: string; voice?: string }>)
        : [];
      const payload = {
        title: title.trim(),
        content: content.trim(),
        characters: detected.map((c) => ({
          name: c.name,
          voice: previous.find((p) => p.name?.toUpperCase() === c.name)?.voice || DEFAULT_VOICE,
          isUserRole: c.role === 'you',
        })) as unknown as Json,
      };
      if (isEditing && script) {
        const { error } = await supabase.from('scripts').update(payload).eq('id', script.id);
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
      toast({ title: 'Error', description: 'Failed to save script. Please try again.', variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const id = await saveScript();
    if (!id) return;
    toast({ title: 'Saved', description: isEditing ? 'Script updated.' : 'Script added to your desk.' });
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
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-desk gap-0">
        <div className="px-6 py-4 border-b">
          <SheetTitle className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            {isEditing ? 'Edit script' : 'New script'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Write or paste your scene. Bold lines are yours, italic lines are read by the AI.
          </SheetDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <input
            aria-label="Script title"
            placeholder="Untitled scene"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-3xl sm:text-4xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border px-3 py-1 bg-background"><strong>Bold</strong> = You</span>
            <span className="rounded-full border px-3 py-1 bg-background"><em>Italic</em> = AI scene partner</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">Characters detected</p>
            {detected.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Start lines with <span className="font-mono text-xs">NAME:</span> and they'll appear here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detected.map((c) => (
                  <span
                    key={c.name}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-semibold border',
                      c.role === 'you'
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-foreground',
                    )}
                  >
                    {c.name}
                    {c.role !== 'unset' && <span className="font-normal"> · {c.role === 'you' ? 'You' : 'AI'}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          <StudioScriptEditor content={content} onChange={setContent} />

          {!content.trim() && (
            <button
              type="button"
              onClick={() => setContent(SAMPLE_SCENE)}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Paste sample scene
            </button>
          )}
        </div>

        <div className="sticky bottom-0 border-t bg-desk px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="h-12 rounded-full border border-foreground/20 bg-background px-7 font-semibold text-foreground hover:bg-desk-chip disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleSaveAndRehearse}
            disabled={loading}
            className="h-12 rounded-full bg-foreground px-7 font-semibold text-background inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            Save &amp; Start Rehearsal <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ScriptCreatorDrawer;
