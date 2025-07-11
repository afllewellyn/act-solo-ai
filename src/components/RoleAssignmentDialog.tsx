import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Save, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

interface RoleAssignmentDialogProps {
  characters: Character[];
  onRoleUpdate: (characters: Character[]) => void;
  content: string;
}

const voices = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (Female)' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Male)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (Female)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Male)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Male)' },
];

export function RoleAssignmentDialog({ characters, onRoleUpdate, content }: RoleAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const { toast } = useToast();

  // Auto-detect characters from script content
  useEffect(() => {
    const lines = content.split('\n');
    const detectedCharacters = new Set<string>();
    
    lines.forEach(line => {
      // Improved regex to handle mixed case names like "Jon B:", "JON B:", "BARTENDER:", etc.
      const match = line.match(/^([A-Z][a-zA-Z\s\-\'\.]*[A-Z]?):/);
      if (match) {
        detectedCharacters.add(match[1].trim());
      }
    });

    const newCharacters = Array.from(detectedCharacters).map(name => {
      const existing = characters.find(c => c.name === name);
      return existing || {
        name,
        voice: voices[detectedCharacters.size % voices.length].id,
        isUserRole: false
      };
    });

    setLocalCharacters(newCharacters);
  }, [content, characters]);

  const handleCharacterUpdate = (index: number, field: string, value: any) => {
    const updated = [...localCharacters];
    updated[index] = { ...updated[index], [field]: value };
    setLocalCharacters(updated);
  };

  const handlePreviewVoice = async (voiceId: string, characterName: string) => {
    setIsPreviewLoading(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          text: `Hello, I am ${characterName}. This is how I sound.`,
          voice_id: voiceId,
        },
      });

      if (error) throw error;

      // Convert base64 audio to blob and play
      const audioBytes = Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.play().catch(err => {
        console.error('Error playing audio:', err);
        toast({
          title: "Preview Error",
          description: "Could not play voice preview",
          variant: "destructive",
        });
      });

      audio.onended = () => URL.revokeObjectURL(audioUrl);
    } catch (error) {
      console.error('Voice preview error:', error);
      toast({
        title: "Preview Error",
        description: "Could not generate voice preview",
        variant: "destructive",
      });
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const handleSave = () => {
    onRoleUpdate(localCharacters);
    setIsOpen(false);
    toast({
      title: "Roles Updated",
      description: "Character roles and voices have been configured.",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-1" />
          Assign Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Character Role Assignment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Configure which characters you'll voice and which the AI should speak.
          </p>
          
          {localCharacters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No characters detected in script. Characters should be formatted as "CHARACTER NAME:" at the start of lines.
            </p>
          ) : (
            <div className="space-y-4">
              {localCharacters.map((character, index) => (
                <div key={character.name} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{character.name}</h4>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`user-role-${index}`}
                        checked={character.isUserRole}
                        onCheckedChange={(checked) => 
                          handleCharacterUpdate(index, 'isUserRole', checked)
                        }
                      />
                      <Label htmlFor={`user-role-${index}`} className="text-sm">
                        I voice this character
                      </Label>
                    </div>
                  </div>
                  
                  {!character.isUserRole && (
                    <div className="space-y-2">
                      <Label htmlFor={`voice-${index}`}>AI Voice</Label>
                      <div className="flex space-x-2">
                        <Select
                          value={character.voice}
                          onValueChange={(value) => 
                            handleCharacterUpdate(index, 'voice', value)
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {voices.map(voice => (
                              <SelectItem key={voice.id} value={voice.id}>
                                {voice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreviewVoice(character.voice, character.name)}
                          disabled={isPreviewLoading === character.voice}
                        >
                          {isPreviewLoading === character.voice ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />
              Save Roles
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}