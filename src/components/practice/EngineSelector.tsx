import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AudioEngine } from '@/services/EnhancedAudioManager';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface EngineSelectorProps {
  currentEngine: AudioEngine;
  onEngineChange: (engine: AudioEngine) => void;
}

export const EngineSelector: React.FC<EngineSelectorProps> = ({
  currentEngine,
  onEngineChange,
}) => {
  const isRealtimeEnabled = isFeatureEnabled('realtime_api_enabled');
  
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Audio Engine</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Select
          value={currentEngine}
          onValueChange={(value: AudioEngine) => onEngineChange(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select audio engine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webspeech">
              <div className="flex items-center gap-2">
                <span>Web Speech</span>
                <Badge variant="secondary">Stable</Badge>
              </div>
            </SelectItem>
            <SelectItem 
              value="s2s" 
              disabled={!isRealtimeEnabled}
            >
              <div className="flex items-center gap-2">
                <span>Speech-to-Speech</span>
                {isRealtimeEnabled ? (
                  <Badge variant="outline">Beta</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        
        <div className="mt-2 text-xs text-muted-foreground">
          {currentEngine === 'webspeech' && (
            "Using browser Web Speech API with ElevenLabs TTS"
          )}
          {currentEngine === 's2s' && (
            "Using OpenAI Realtime API for speech-to-speech"
          )}
        </div>
      </CardContent>
    </Card>
  );
};