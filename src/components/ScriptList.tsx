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

const ScriptList = ({ refresh, onSelectScript }: ScriptListProps) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchScripts = async () => {
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
        title: "Error",
        description: "Failed to load scripts",
        variant: "destructive",
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
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', scriptId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Script deleted successfully",
      });
      fetchScripts();
    } catch (error) {
      console.error('Error deleting script:', error);
      toast({
        title: "Error",
        description: "Failed to delete script",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading scripts...</div>;
  }

  if (scripts.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground">No scripts yet. Create your first script above!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {scripts.map((script) => (
        <Card key={script.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{script.title}</CardTitle>
                <CardDescription>
                  {Array.isArray(script.characters) ? script.characters.length : 0} character(s) • Created {new Date(script.created_at).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/practice/${script.id}`)}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Practice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(script.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {script.content.substring(0, 150)}...
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ScriptList;