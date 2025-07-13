import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Save, Play, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
}

interface RoleAssignmentDialogProps {
  characters: Character[];
  onRoleUpdate: (characters: Character[]) => void;
  content: string;
}

// Default fallback voices if API fails
const defaultVoices = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', category: 'Generated', gender: 'Female', accent: 'American' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', category: 'Generated', gender: 'Male', accent: 'American' },
  { id: 'asDeXBMC8hUkhqqL7agO', name: 'David', category: 'Generated', gender: 'Male', accent: 'American' },
];

export function RoleAssignmentDialog({ characters, onRoleUpdate, content }: RoleAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>(defaultVoices);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const { toast } = useToast();

  // Load voices from ElevenLabs on component mount
  useEffect(() => {
    loadVoices();
  }, []);

  // Auto-detect characters from script content
  useEffect(() => {
    const lines = content.split('\n');
    const detectedCharacters = new Set<string>();
    
    lines.forEach(line => {
      // Enhanced regex to handle various character name formats
      const match = line.match(/^([A-Z][a-zA-Z\s\-\'\.]*[A-Z]?):/);
      if (match) {
        detectedCharacters.add(match[1].trim());
      }
    });

    const newCharacters = Array.from(detectedCharacters).map(name => {
      const existing = characters.find(c => c.name === name);
      return existing || {
        name,
        voice: voices[Array.from(detectedCharacters).indexOf(name) % voices.length].id,
        isUserRole: false
      };
    });

    setLocalCharacters(newCharacters);
  }, [content, characters, voices]);

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-voices');
      
      if (error) {
        console.error('Error fetching voices:', error);
        toast({
          title: "Voice Loading Error",
          description: "Using default voices. Check your ElevenLabs API key.",
          variant: "destructive",
        });
        return;
      }

      if (data?.voices && data.voices.length > 0) {
        setVoices(data.voices);
        toast({
          title: "Voices Loaded",
          description: `Loaded ${data.voices.length} voices from ElevenLabs`,
        });
      }
    } catch (error) {
      console.error('Error loading voices:', error);
      toast({
        title: "Voice Loading Error",
        description: "Using default voices. Check your ElevenLabs API key.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingVoices(false);
    }
  };

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

      if (error) {
        console.error('TTS error:', error);
        throw new Error(error.message || 'Failed to generate speech');
      }

      if (!data?.audioContent) {
        throw new Error('No audio content received');
      }

      // Convert base64 audio to blob and play
      const audioBytes = Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      
    } catch (error) {
      console.error('Voice preview error:', error);
      toast({
        title: "Preview Error",
        description: error.message || "Could not generate voice preview. Check your ElevenLabs API key.",
        variant: "destructive",
      });
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const handleSave = () => {
    // Validate that all AI characters have voices assigned
    const unassignedAICharacters = localCharacters.filter(c => !c.isUserRole && !c.voice);
    
    if (unassignedAICharacters.length > 0) {
      toast({
        title: "Assignment Required",
        description: `Please assign voices to: ${unassignedAICharacters.map(c => c.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

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
          <DialogTitle className="flex items-center justify-between">
            Character Role Assignment
            <Button
              variant="ghost"
              size="sm"
              onClick={loadVoices}
              disabled={isLoadingVoices}
              className="ml-2"
            >
              {isLoadingVoices ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Voices
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Configure which characters you'll voice and which the AI should speak.
            </p>
            <p className="text-xs text-muted-foreground">
              Available voices: {voices.length} | ElevenLabs API: {isLoadingVoices ? 'Loading...' : 'Connected'}
            </p>
          </div>
          
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
                                {voice.name} ({voice.gender}, {voice.accent})
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