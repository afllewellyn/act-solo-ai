import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import ScriptCreatorDrawer, { EditableScript } from '@/components/scripts/ScriptCreatorDrawer';
import { detectCharacterRoles, getPreviewLines, estimateMinutes } from '@/lib/scriptMeta';
import { LogOut, MoreHorizontal, Pencil, Copy, Trash2, Play, Plus } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Script {
  id: string;
  title: string;
  content: string;
  characters: unknown;
  created_at: string;
  updated_at: string;
  user_id: string;
}

const ManageScripts = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<EditableScript | null>(null);
  const [deletingScript, setDeletingScript] = useState<Script | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  const fetchScripts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setScripts(data || []);
    } catch (error) {
      console.error('Error fetching scripts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scripts',
        variant: 'destructive',
      });
    } finally {
      setScriptsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const handleNewScript = () => {
    setEditingScript(null);
    setDrawerOpen(true);
  };

  const handleEdit = (script: Script) => {
    setEditingScript(script);
    setDrawerOpen(true);
  };

  const handleDuplicate = async (script: Script) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('scripts').insert([{
        user_id: user.id,
        title: `${script.title} (Copy)`,
        content: script.content,
        characters: script.characters as Json,
      }]);
      if (error) throw error;
      toast({ title: 'Duplicated', description: `"${script.title}" was copied.` });
      fetchScripts();
    } catch (error) {
      console.error('Error duplicating script:', error);
      toast({
        title: 'Error',
        description: 'Failed to duplicate script',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingScript) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', deletingScript.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: `"${deletingScript.title}" was deleted.` });
      setDeletingScript(null);
      fetchScripts();
    } catch (error) {
      console.error('Error deleting script:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete script',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-desk">
      <header className="border-b bg-desk/90 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">ActSolo.AI</span>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">{user.email}</span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut} className="rounded-full">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">Your studio desk</p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mt-1">
              My Scripts <span className="text-muted-foreground font-semibold">({scripts.length})</span>
            </h1>
          </div>
          <button
            onClick={handleNewScript}
            className="h-12 rounded-full bg-foreground px-6 font-semibold text-background inline-flex items-center justify-center gap-2 hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Script
          </button>
        </div>

        {scriptsLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading scripts...</div>
        ) : scripts.length === 0 ? (
          <div className="rounded-3xl bg-desk-surface shadow-sm text-center py-16 px-6 space-y-4">
            <p className="text-lg text-foreground font-semibold">Your desk is empty</p>
            <p className="text-muted-foreground">Paste your first scene to start rehearsing.</p>
            <button onClick={handleNewScript} className="h-11 rounded-full bg-foreground px-6 font-semibold text-background inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create your first script
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {scripts.map((script) => {
              const saved = Array.isArray(script.characters)
                ? (script.characters as Array<{ name?: string }>).map((c) => (c?.name || '').toUpperCase()).filter(Boolean)
                : [];
              const names = saved.length ? saved : detectCharacterRoles(script.content).map((c) => c.name);
              const preview = getPreviewLines(script.content, 2);
              return (
                <article key={script.id} className="flex flex-col rounded-3xl bg-desk-surface p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold text-foreground leading-snug line-clamp-2">{script.title}</h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 -mr-2 -mt-1 shrink-0 rounded-full" aria-label={`Actions for ${script.title}`}>
                          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="py-2.5" onClick={() => handleEdit(script)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="py-2.5" onClick={() => handleDuplicate(script)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeletingScript(script)} className="py-2.5 text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {names.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {names.slice(0, 4).map((n) => (
                        <span key={n} className="rounded-full bg-desk-chip px-3 py-1 text-xs font-semibold tracking-wide text-foreground/80">{n}</span>
                      ))}
                      {names.length > 4 && <span className="text-xs text-muted-foreground self-center">+{names.length - 4}</span>}
                    </div>
                  )}

                  <div className="mt-4 flex-1 text-sm text-muted-foreground space-y-0.5">
                    {preview.map((line, i) => (
                      <p key={i} className="line-clamp-1">{line}{i === preview.length - 1 ? '…' : ''}</p>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      ~{estimateMinutes(script.content)} min · {new Date(script.updated_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => navigate(`/practice/${script.id}`)}
                      className="h-11 rounded-full bg-foreground px-5 font-semibold text-background inline-flex items-center gap-1.5 hover:opacity-90"
                    >
                      Rehearse <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <ScriptCreatorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        script={editingScript}
        onSaved={fetchScripts}
      />

      <AlertDialog
        open={Boolean(deletingScript)}
        onOpenChange={(open) => !open && setDeletingScript(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this script?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingScript?.title}" will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageScripts;
