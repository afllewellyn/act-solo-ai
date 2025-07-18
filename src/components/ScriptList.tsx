import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Play, Trash2 } from 'lucide-react';
interface Script {
  id: string;
  title: string;
  content: string;
  characters: any;
  created_at: string;
  updated_at: string;
  user_id: string;
}
interface ScriptListProps {
  refresh: number;
  onSelectScript: (script: Script) => void;
}
const ScriptList = ({
  refresh,
  onSelectScript
}: ScriptListProps) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const navigate = useNavigate();

  // Utility function to strip HTML tags and convert to plain text
  const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  };

  // Function to get preview text with truncation
  const getPreviewText = (content: string): string => {
    const plainText = stripHtmlTags(content);
    return plainText.length > 100 ? `${plainText.substring(0, 100)}…` : plainText;
  };
  const fetchScripts = async () => {
    if (!user) return;
    try {
      const {
        data,
        error
      } = await supabase.from('scripts').select('*').eq('user_id', user.id).order('updated_at', {
        ascending: false
      });
      if (error) throw error;
      setScripts(data || []);
    } catch (error) {
      console.error('Error fetching scripts:', error);
      toast({
        title: "Error",
        description: "Failed to load scripts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchScripts();
  }, [user, refresh]);
  const handleDelete = async (scriptId: string) => {
    try {
      const {
        error
      } = await supabase.from('scripts').delete().eq('id', scriptId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Script deleted successfully"
      });
      fetchScripts();
    } catch (error) {
      console.error('Error deleting script:', error);
      toast({
        title: "Error",
        description: "Failed to delete script",
        variant: "destructive"
      });
    }
  };
  if (loading) {
    return <div className="text-center text-muted-foreground">Loading scripts...</div>;
  }
  if (scripts.length === 0) {
    return <Card>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground">No scripts yet. Create your first script above!</p>
        </CardContent>
      </Card>;
  }
  return <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-lg sm:text-xl">My Scripts</CardTitle>
          {scripts.length > 0 && <p className="text-sm text-muted-foreground">
              {scripts.length} script{scripts.length === 1 ? '' : 's'}
            </p>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {scripts.map(script => <Card key={script.id} className="border-l-4 border-l-primary/20 hover:border-l-primary/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base sm:text-lg truncate">{script.title}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {Array.isArray(script.characters) ? script.characters.length : 0} character(s) • Created {new Date(script.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/practice/${script.id}`)} className="flex-1 sm:flex-none">
                    <Play className="h-4 w-4 mr-1" />
                    <span className="hidden xs:inline">Practice</span>
                    <span className="xs:hidden">Play</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(script.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete script</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {getPreviewText(script.content)}
              </p>
            </CardContent>
          </Card>)}
      </CardContent>
    </Card>;
};
export default ScriptList;