import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  // Auto-detect characters from script content
  useEffect(() => {
    const lines = content.split('\n');
    const detectedCharacters = new Set<string>();
    
    lines.forEach(line => {
      const match = line.match(/^([A-Z][A-Z\s\-\'\.]+):/);
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
                      <Select
                        value={character.voice}
                        onValueChange={(value) => 
                          handleCharacterUpdate(index, 'voice', value)
                        }
                      >
                        <SelectTrigger>
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