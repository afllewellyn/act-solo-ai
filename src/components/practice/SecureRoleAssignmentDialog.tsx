
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Save, Play, RefreshCw, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { characterSchema, sanitizeInput, validateCharacterName } from '@/lib/validation';
import { useSecureRequest } from '@/hooks/useSecureRequest';

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

interface SecureRoleAssignmentDialogProps {
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
];

export function SecureRoleAssignmentDialog({ characters, onRoleUpdate, content }: SecureRoleAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<Character[]>(characters);
  const [voices, setVoices] = useState<Voice[]>(defaultVoices);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const { toast } = useToast();

  // Secure voice loading with rate limiting
  const { execute: secureLoadVoices, isLoading: isVoiceRequestLoading } = useSecureRequest(
    async () => {
      const { data, error } = await supabase.functions.invoke('get-voices');
      
      if (error) {
        throw new Error(error.message || 'Failed to load voices');
      }

      if (data?.voices && Array.isArray(data.voices) && data.voices.length > 0) {
        return data.voices;
      }
      
      throw new Error('No voices received from API');
    },
    {
      rateLimitKey: 'load-voices',
      windowMs: 10000, // 10 seconds
      maxRequests: 3,
    }
  );

  // Secure voice preview with rate limiting
  const { execute: securePreviewVoice } = useSecureRequest(
    async (voiceId: string, characterName: string) => {
      // Validate inputs
      if (!voiceId || !characterName) {
        throw new Error('Invalid voice or character data');
      }

      const sanitizedName = sanitizeInput(characterName);
      const previewText = `Hello, I am ${sanitizedName}. This is how I sound.`;

      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          text: previewText,
          voice_id: voiceId,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate preview');
      }

      if (!data?.audioContent) {
        throw new Error('No audio content received');
      }

      return data.audioContent;
    },
    {
      rateLimitKey: 'voice-preview',
      windowMs: 3000, // 3 seconds
      maxRequests: 1,
    }
  );

  // Auto-detect characters from script content with validation
  useEffect(() => {
    if (!content || typeof content !== 'string') return;

    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const detectedCharacters = new Set<string>();
    
    lines.forEach(line => {
      // Enhanced regex to handle various character name formats
      const match = line.match(/^([A-Z][a-zA-Z\s\-\'\.]*[A-Z]?):/);
      if (match) {
        const characterName = sanitizeInput(match[1].trim());
        // Validate character name format
        if (validateCharacterName(characterName) && characterName.length <= 50) {
          detectedCharacters.add(characterName);
        }
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
      const voicesData = await secureLoadVoices();
      if (voicesData) {
        setVoices(voicesData);
        toast({
          title: "Voices Loaded",
          description: `Loaded ${voicesData.length} voices successfully`,
        });
      }
    } catch (error) {
      // Error already handled by useSecureRequest
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const handleCharacterUpdate = (index: number, field: string, value: any) => {
    if (index < 0 || index >= localCharacters.length) return;

    const updated = [...localCharacters];
    const updatedCharacter = { ...updated[index] };

    // Validate the update based on field
    if (field === 'isUserRole' && typeof value === 'boolean') {
      updatedCharacter.isUserRole = value;
    } else if (field === 'voice' && typeof value === 'string') {
      // Validate voice ID format
      if (/^[A-Za-z0-9_-]+$/.test(value)) {
        updatedCharacter.voice = value;
      } else {
        toast({
          title: "Invalid Voice",
          description: "Please select a valid voice.",
          variant: "destructive",
        });
        return;
      }
    }

    updated[index] = updatedCharacter;
    setLocalCharacters(updated);
  };

  const handlePreviewVoice = async (voiceId: string, characterName: string) => {
    const audioContent = await securePreviewVoice(voiceId, characterName);
    if (audioContent) {
      try {
        // Convert base64 audio to blob and play
        const audioBytes = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        await audio.play();
        audio.onended = () => URL.revokeObjectURL(audioUrl);
      } catch (error) {
        toast({
          title: "Playback Error",
          description: "Could not play audio preview",
          variant: "destructive",
        });
      }
    }
  };

  const handleSave = () => {
    try {
      // Validate all characters
      const validatedCharacters = localCharacters.map(char => {
        const result = characterSchema.safeParse(char);
        if (!result.success) {
          throw new Error(`Invalid character data for ${char.name}: ${result.error.message}`);
        }
        return result.data;
      });

      // Ensure at least one user role is assigned
      const userRoles = validatedCharacters.filter(c => c.isUserRole);
      if (userRoles.length === 0) {
        toast({
          title: "Role Assignment Required",
          description: "At least one character must be assigned as a user role.",
          variant: "destructive",
        });
        return;
      }

      // Validate that all AI characters have voices assigned
      const unassignedAICharacters = validatedCharacters.filter(c => !c.isUserRole && !c.voice);
      
      if (unassignedAICharacters.length > 0) {
        toast({
          title: "Voice Assignment Required",
          description: `Please assign voices to: ${unassignedAICharacters.map(c => c.name).join(', ')}`,
          variant: "destructive",
        });
        return;
      }

      onRoleUpdate(validatedCharacters);
      setIsOpen(false);
      toast({
        title: "Roles Updated",
        description: "Character roles and voices have been configured securely.",
      });
    } catch (error) {
      toast({
        title: "Validation Error",
        description: error instanceof Error ? error.message : "Invalid character configuration",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          <Shield className="h-3 w-3" />
          Assign Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Secure Character Role Assignment
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadVoices}
              disabled={isLoadingVoices || isVoiceRequestLoading}
              className="ml-2"
            >
              {isLoadingVoices || isVoiceRequestLoading ? (
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
              Configure which characters you'll voice and which the AI should speak. All data is validated and sanitized for security.
            </p>
            <p className="text-xs text-muted-foreground">
              Available voices: {voices.length} | Security: Input validation enabled
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
                          disabled={!character.voice}
                        >
                          <Play className="h-4 w-4" />
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
