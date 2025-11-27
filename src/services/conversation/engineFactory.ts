/**
 * Conversation Engine Factory
 * Phase 1: Factory pattern for engine selection
 * 
 * Allows runtime engine selection via feature flags
 * without changing UI code.
 */

import { ConversationEngine } from './types';
import { ConversationEngineConfig } from './domain';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * Create conversation engine based on feature flags and config
 * 
 * @param config - Engine configuration
 * @returns ConversationEngine instance
 * 
 * @example
 * const engine = createConversationEngine({
 *   agentRole: 'scene-partner',
 *   agentId: 'abc123'
 * });
 */
export async function createConversationEngine(
  config: ConversationEngineConfig
): Promise<ConversationEngine> {
  // Phase 2: Check feature flag for ElevenLabs Conversational AI
  if (isFeatureEnabled('conversation_engine_eleven')) {
    // Dynamically import ElevenAgentsEngine to avoid loading unused code
    // TODO Phase 2: Uncomment when ElevenAgentsEngine is implemented
    // const { ElevenAgentsEngine } = await import('./ElevenAgentsEngine');
    // return new ElevenAgentsEngine(config);
    console.log('[ConversationEngine] ElevenAgentsEngine not yet implemented, using stub');
  }

  // Phase 3+: Additional engines can be added here
  // if (isFeatureEnabled('conversation_engine_openai_hybrid')) {
  //   const { HybridOpenAIEngine } = await import('./HybridOpenAIEngine');
  //   return new HybridOpenAIEngine(config);
  // }

  // Fallback: Return a stub/mock engine until real engine is enabled
  return createStubEngine(config);
}

/**
 * Stub engine for testing and gradual migration
 * Allows code to compile before real engines are implemented
 */
function createStubEngine(config: ConversationEngineConfig): ConversationEngine {
  console.warn('[ConversationEngine] Using stub engine - no real conversation will occur');
  
  const eventListeners: Array<(event: any) => void> = [];

  return {
    async start() {
      console.log('[StubEngine] start() called with config:', config);
      eventListeners.forEach(cb => cb({
        type: 'status_change',
        status: 'ready',
        timestamp: Date.now()
      }));
    },

    async stop() {
      console.log('[StubEngine] stop() called');
      eventListeners.forEach(cb => cb({
        type: 'status_change',
        status: 'idle',
        timestamp: Date.now()
      }));
    },

    async sendText(text: string) {
      console.log('[StubEngine] sendText() called:', text);
    },

    async updateContext(context: any) {
      console.log('[StubEngine] updateContext() called:', context);
    },

    async sendControl(command: any) {
      console.log('[StubEngine] sendControl() called:', command);
    },

    onEvent(callback: (event: any) => void) {
      eventListeners.push(callback);
      return () => {
        const index = eventListeners.indexOf(callback);
        if (index > -1) eventListeners.splice(index, 1);
      };
    },

    getStatus() {
      return 'idle';
    }
  };
}
