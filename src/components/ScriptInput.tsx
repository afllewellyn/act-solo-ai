import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { RichTextEditor } from '@/components/RichTextEditor';
import { countLineRoles, detectCharacterNames } from '@/components/practice/rehearsal/textUtils';

interface Character {
  name: string;
  color: string;
}

interface ScriptInputProps {
  onScriptSaved: () => void;
}

const ScriptInput = ({ onScriptSaved }: ScriptInputProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const lineCounts = countLineRoles(content);
  const { toast } = useToast();
  const { user } = useAuth();

  // Character names are optional: only "NAME: line" paragraphs produce them
  const detectCharacters = (scriptContent: string): Character[] => {
    const colors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];
    return detectCharacterNames(scriptContent).map((name, index) => ({
      name,
      color: colors[index % colors.length]
    }));
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    const detectedCharacters = detectCharacters(value);
    setCharacters(detectedCharacters);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Error",
        description: "Please provide both a title and script content",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save scripts",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
        const { error } = await supabase
        .from('scripts')
        .insert({
          user_id: user.id,
          title: title.trim(),
          content: content.trim(),
          characters: characters as unknown as Json
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Script saved successfully!",
      });
      
      setTitle('');
      setContent('');
      setCharacters([]);
      onScriptSaved();
    } catch (error) {
      console.error('Error saving script:', error);
      toast({
        title: "Error",
        description: "Failed to save script. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create New Script</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Script Title</Label>
          <Input
            id="title"
            placeholder="Enter script title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="content">Script Content</Label>
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            placeholder="Paste your script here, then make your lines bold and the AI's lines italic."
          />
          <p className="text-xs text-muted-foreground">
            Make your lines <strong>bold</strong> and the AI's lines <em>italic</em>. Character names are optional.
          </p>
        </div>

        {lineCounts.actor + lineCounts.ai + lineCounts.note > 0 && (
          <div className="space-y-1">
            <Label>Lines detected</Label>
            <p className="text-sm">
              {lineCounts.actor} yours • {lineCounts.ai} AI
              {lineCounts.note > 0 && <span className="text-muted-foreground"> • {lineCounts.note} stage notes</span>}
            </p>
            {lineCounts.note > 0 && (
              <p className="text-xs text-muted-foreground">
                Tip: lines that are neither bold nor italic are treated as stage notes and skipped by the AI. Make every spoken line bold or italic.
              </p>
            )}
          </div>
        )}

        {characters.length > 0 && (
          <div className="space-y-2">
            <Label>Character names (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {characters.map((character, index) => (
                <div
                  key={index}
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{ 
                    backgroundColor: character.color + '20',
                    color: character.color,
                    border: `1px solid ${character.color}`
                  }}
                >
                  {character.name}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
          {loading ? 'Saving...' : 'Save Script'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ScriptInput;