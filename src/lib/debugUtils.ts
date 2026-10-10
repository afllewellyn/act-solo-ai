/**
 * Development utility for testing feature flags and engine switching
 * Phase 1 - Development Tools
 * Phase 3.5 - ConversationEngine diagnostics
 */

import { isFeatureEnabled, setFeatureFlags, getAllFeatureFlags, logFeatureFlags } from '@/lib/featureFlags';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

// Add to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as Record<string, unknown>).__DEBUG_AUDIO__ = {
    // Feature flag utilities
    isFeatureEnabled,
    setFeatureFlags,
    getAllFeatureFlags,
    logFeatureFlags,
    
    // Logger utilities
    getSessionId: () => logger.getSessionId(),
    setLogContext: (context: Record<string, unknown>) => logger.setDefaultContext(context),
    
    // Quick feature flag presets for testing
    enableAllFeatures: () => setFeatureFlags({
      realtime_api_enabled: true,
      tts_streaming_enabled: true,
      enhanced_speech_recognition: true,
      structured_logging: true,
      mobile_audio_optimization: true,
      server_vad_enabled: true,
      auto_fallback_enabled: true,
      diagnostics_overlay: true,
    }),
    
    enablePhase1Only: () => setFeatureFlags({
      realtime_api_enabled: false,
      tts_streaming_enabled: false,
      enhanced_speech_recognition: true,
      structured_logging: true,
      mobile_audio_optimization: true,
      server_vad_enabled: false,
      auto_fallback_enabled: true,
      diagnostics_overlay: false,
    }),
    
    enablePhase2: () => setFeatureFlags({
      realtime_api_enabled: false,
      tts_streaming_enabled: true,
      enhanced_speech_recognition: true,
      structured_logging: true,
      mobile_audio_optimization: true,
      server_vad_enabled: false,
      auto_fallback_enabled: true,
      diagnostics_overlay: false,
    }),
    
    // Enable ElevenLabs ConversationEngine
    enableElevenAgents: () => setFeatureFlags({ conversation_engine_eleven: true }),
    
    // Disable ElevenLabs ConversationEngine (fall back to legacy)
    disableElevenAgents: () => setFeatureFlags({ conversation_engine_eleven: false }),
    
    // Engine testing utilities
    // Test ElevenAgents token endpoint (requires being signed in)
    testElevenAgentsToken: async () => {
      try {
        console.log('🔑 Testing ElevenAgents token endpoint...');
        const { data, error } = await supabase.functions.invoke('eleven-agent-token');
        
        const result = {
          status: error ? 'error' : 'success',
          hasSignedUrl: !!data?.signed_url,
          expiresAt: data?.expires_at,
          agentId: data?.agent_id,
          error: error?.message,
        };
        
        console.log('ElevenAgents Token Result:', result);
        return result;
      } catch (error) {
        console.error('❌ ElevenAgents Token Error:', error);
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    },
    
    // Browser compatibility check for ConversationEngine
    checkBrowserCompatibility: () => {
      const results = {
        audioWorklet: 'AudioWorklet' in window,
        mediaDevices: 'mediaDevices' in navigator,
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        webSocket: 'WebSocket' in window,
        audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
        browser: navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') 
          ? 'Safari' 
          : navigator.userAgent.includes('Chrome') 
            ? 'Chrome' 
            : navigator.userAgent.includes('Firefox')
              ? 'Firefox'
              : 'Other',
        isMobile: /iPhone|iPad|Android/i.test(navigator.userAgent),
        isSecureContext: window.isSecureContext,
      };
      
      console.log('🔍 Browser Compatibility Check:');
      console.table(results);
      
      // Warnings
      if (!results.isSecureContext) {
        console.warn('⚠️ Not in secure context (HTTPS required for microphone access)');
      }
      if (!results.audioWorklet) {
        console.warn('⚠️ AudioWorklet not supported, will use ScriptProcessorNode fallback');
      }
      if (!results.getUserMedia) {
        console.warn('❌ getUserMedia not available - microphone access will fail');
      }
      
      return results;
    }
  };
  const debugWindow = window as unknown as Record<string, unknown>;
  debugWindow.DEBUG_AUDIO = debugWindow.__DEBUG_AUDIO__;
  console.log('🔧 Debug utilities available at window.__DEBUG_AUDIO__ and window.DEBUG_AUDIO');
  console.log('📋 Try: __DEBUG_AUDIO__.logFeatureFlags()');
  console.log('🔑 Try: __DEBUG_AUDIO__.testElevenAgentsToken()');
  console.log('🔍 Try: __DEBUG_AUDIO__.checkBrowserCompatibility()');
  console.log('⚡ Try: __DEBUG_AUDIO__.enableElevenAgents()');
}
