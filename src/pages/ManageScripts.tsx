import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import ScriptCreatorDrawer, { EditableScript } from '@/components/scripts/ScriptCreatorDrawer';
import { LogOut, MoreVertical, Pencil, Copy, Trash2, Play, Plus } from 'lucide-react';
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

const stripHtmlTags = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();

const getPreviewText = (content: string): string => {
  const plainText = stripHtmlTags(content);
  return plainText.length > 140 ? `${plainText.substring(0, 140)}…` : plainText;
};

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
      const { error } = await supabase.from('scripts').insert({
        user_id: user.id,
        title: `${script.title} (Copy)`,
        content: script.content,
        characters: script.characters,
      });
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto grid grid-cols-3 items-center py-4 px-4 sm:px-6">
          <div className="justify-self-start">
            <h1 className="text-xl sm:text-2xl font-semibold">ActSolo.AI</h1>
          </div>

          <span className="text-sm text-muted-foreground hidden sm:block text-center">
            Welcome, {user.email}
          </span>

          <div className="flex items-center gap-2 sm:gap-4 justify-self-end">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold">Studio Desk</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {scripts.length} script{scripts.length === 1 ? '' : 's'} in your library
            </p>
          </div>
          <Button onClick={handleNewScript} className="sm:w-auto w-full">
            <Plus className="h-4 w-4 mr-2" />
            New Script
          </Button>
        </div>

        {scriptsLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading scripts...</div>
        ) : scripts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">
                No scripts yet. Create your first script to start rehearsing.
              </p>
              <Button onClick={handleNewScript}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first script
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script) => (
              <Card
                key={script.id}
                className="flex flex-col border-t-4 border-t-primary/20 hover:border-t-primary/50 transition-colors"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">
                        {script.title}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {Array.isArray(script.characters) ? script.characters.length : 0}{' '}
                        character{Array.isArray(script.characters) && script.characters.length === 1 ? '' : 's'} •{' '}
                        {new Date(script.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          aria-label={`Actions for ${script.title}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleEdit(script)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(script)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletingScript(script)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-4 pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {getPreviewText(script.content)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/practice/${script.id}`)}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Practice
                  </Button>
                </CardContent>
              </Card>
            ))}
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
