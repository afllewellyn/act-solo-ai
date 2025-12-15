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
  (window as any).__DEBUG_AUDIO__ = {
    // Feature flag utilities
    isFeatureEnabled,
    setFeatureFlags,
    getAllFeatureFlags,
    logFeatureFlags,
    
    // Logger utilities
    getSessionId: () => logger.getSessionId(),
    setLogContext: (context: any) => logger.setDefaultContext(context),
    
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
    testHealthRealtime: async () => {
      try {
        const response = await fetch(`https://uomdyqdvorusucuudwnz.supabase.co/functions/v1/health-realtime`);
        const data = await response.json();
        console.log('Health Realtime Check:', data);
        return data;
      } catch (error: any) {
        console.error('Health Realtime Error:', error);
        return { error: error.message };
      }
    },
    
    // Test ElevenAgents token endpoint
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
      } catch (error: any) {
        console.error('❌ ElevenAgents Token Error:', error);
        return { status: 'error', error: error.message };
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
    },
    
    // S2S testing utilities
    testS2SConnection: async () => {
      try {
        console.log('🔊 Testing S2S WebSocket connection...');
        const ws = new WebSocket('wss://uomdyqdvorusucuudwnz.functions.supabase.co/functions/v1/realtime-s2s');
        
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            ws.close();
            resolve({ status: 'timeout', message: 'Connection timeout after 5s' });
          }, 5000);
          
          ws.onopen = () => {
            clearTimeout(timeout);
            console.log('✅ S2S WebSocket connected successfully');
            ws.close();
            resolve({ status: 'success', message: 'S2S WebSocket connection successful' });
          };
          
          ws.onerror = (error) => {
            clearTimeout(timeout);
            console.error('❌ S2S WebSocket connection failed:', error);
            resolve({ status: 'error', message: 'S2S WebSocket connection failed' });
          };
        });
      } catch (error: any) {
        console.error('❌ S2S Connection Test Error:', error);
        return { status: 'error', message: error.message };
      }
    },
    
    // Test S2S with actual text
    testS2SSpeech: async (text = 'Hello, this is a test of the S2S speech system.') => {
      try {
        console.log('🎤 Testing S2S speech with text:', text);
        
        // This would require access to the audio manager context
        console.log('💡 To test S2S speech, use the VoiceControls in the app with S2S enabled');
        return { 
          status: 'info', 
          message: 'Use VoiceControls component to test S2S speech functionality',
          instructions: 'Go to /practice page and try the "Read Script" button'
        };
      } catch (error: any) {
        return { status: 'error', message: error.message };
      }
    }
  };
  (window as any).DEBUG_AUDIO = (window as any).__DEBUG_AUDIO__;
  console.log('🔧 Debug utilities available at window.__DEBUG_AUDIO__ and window.DEBUG_AUDIO');
  console.log('📋 Try: __DEBUG_AUDIO__.logFeatureFlags()');
  console.log('🧪 Try: __DEBUG_AUDIO__.testHealthRealtime()');
  console.log('🔑 Try: __DEBUG_AUDIO__.testElevenAgentsToken()');
  console.log('🔍 Try: __DEBUG_AUDIO__.checkBrowserCompatibility()');
  console.log('⚡ Try: __DEBUG_AUDIO__.enableElevenAgents()');
}
