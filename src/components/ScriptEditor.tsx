import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Edit, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ScriptEditorProps {
  script: {
    id: string;
    title: string;
    content: string;
    characters: unknown;
  };
  onScriptUpdate: (updatedContent: string) => void;
}

export function ScriptEditor({ script, onScriptUpdate }: ScriptEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(script.content);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('scripts')
        .update({ content: editedContent })
        .eq('id', script.id);

      if (error) throw error;

      onScriptUpdate(editedContent);
      setIsOpen(false);
      
      toast({
        title: "Script Updated",
        description: "Your changes have been saved successfully.",
      });
    } catch (error) {
      console.error('Error saving script:', error);
      toast({
        title: "Save Error",
        description: "Failed to save script changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedContent(script.content);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-1" />
          Edit Script
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Script: {script.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <RichTextEditor
            content={editedContent}
            onChange={setEditedContent}
            placeholder="Enter your script content..."
          />
          
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}