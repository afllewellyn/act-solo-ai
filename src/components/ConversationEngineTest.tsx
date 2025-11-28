import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createConversationEngine } from '@/services/conversation/engineFactory';
import type { ConversationEngine, ConversationEvent, ConversationControlCommand } from '@/services/conversation/types';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * Test component for ElevenAgentsEngine
 * Temporary component for Phase 2 validation
 */
export function ConversationEngineTest() {
  const [engine, setEngine] = useState<ConversationEngine | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [events, setEvents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [forceEnabled, setForceEnabled] = useState(false);

  useEffect(() => {
    setIsEnabled(isFeatureEnabled('conversation_engine_eleven'));
  }, []);

  const addEvent = (event: string) => {
    setEvents(prev => [...prev.slice(-20), `${new Date().toISOString().split('T')[1].slice(0, 8)} - ${event}`]);
  };

  const handleStart = async () => {
    try {
      addEvent('Creating engine...');
      const newEngine = await createConversationEngine({
        agentId: 'default', // Will use ELEVENLABS_AGENT_ID from edge function
        voiceId: 'IKne3meq5aSn9XLyUdCD', // Charlie voice
        enableTranscription: true,
      });

      newEngine.onEvent((event: ConversationEvent) => {
        console.log('[ConversationEvent]', event);
        addEvent(`${event.type}: ${JSON.stringify(event).slice(0, 100)}`);
      });

      setEngine(newEngine);
      addEvent('Starting conversation...');
      await newEngine.start();
      setStatus(newEngine.getStatus());
      addEvent(`Started! Status: ${newEngine.getStatus()}`);
    } catch (error) {
      console.error('[Test] Error:', error);
      addEvent(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStop = async () => {
    if (!engine) return;
    try {
      addEvent('Stopping conversation...');
      await engine.stop();
      setStatus('disconnected');
      addEvent('Stopped');
      setEngine(null);
    } catch (error) {
      console.error('[Test] Stop error:', error);
      addEvent(`STOP ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSendText = () => {
    if (!engine) return;
    const text = prompt('Enter text to send:');
    if (text) {
      engine.sendText(text);
      addEvent(`Sent text: ${text}`);
    }
  };

  const handleInterrupt = () => {
    if (!engine) return;
    engine.sendControl({ type: 'interrupt' });
    addEvent('Sent interrupt command');
  };

  const handleEnableFeature = () => {
    window.__FEATURES__ = { conversation_engine_eleven: true };
    setForceEnabled(true);
    addEvent('Feature flag enabled - ready to test!');
  };

  if (!isEnabled && !forceEnabled) {
    return (
      <Card className="p-6 m-4">
        <h2 className="text-xl font-bold mb-4">ConversationEngine Test</h2>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            The <code className="bg-muted px-2 py-1 rounded">conversation_engine_eleven</code> feature is currently disabled.
          </p>
          <Button onClick={handleEnableFeature} size="lg">
            Enable & Start Testing
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 m-4">
      <h2 className="text-xl font-bold mb-4">ConversationEngine Test (ElevenLabs)</h2>
      
      <div className="flex gap-2 mb-4">
        <Button onClick={handleStart} disabled={!!engine}>
          Start Conversation
        </Button>
        <Button onClick={handleStop} disabled={!engine} variant="destructive">
          Stop
        </Button>
        <Button onClick={handleSendText} disabled={!engine} variant="secondary">
          Send Text
        </Button>
        <Button onClick={handleInterrupt} disabled={!engine} variant="outline">
          Interrupt
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm">
          <strong>Status:</strong> <span className="font-mono">{status}</span>
        </p>
        <p className="text-sm">
          <strong>Flag:</strong> <span className="font-mono">{isEnabled ? '✅ Enabled' : '❌ Disabled'}</span>
        </p>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold mb-2">Events (last 20):</h3>
        <div className="bg-muted p-3 rounded h-64 overflow-y-auto font-mono text-xs">
          {events.length === 0 ? (
            <p className="text-muted-foreground">No events yet. Click "Start Conversation" to begin.</p>
          ) : (
            events.map((event, i) => (
              <div key={i} className="mb-1">{event}</div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
