/**
 * Development utility for testing feature flags and engine switching
 * Phase 1 - Development Tools
 */

import { isFeatureEnabled, setFeatureFlags, getAllFeatureFlags, logFeatureFlags } from '@/lib/featureFlags';
import { logger } from '@/lib/logger';

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
    
    // Engine testing utilities
    testHealthRealtime: async () => {
      try {
        const response = await fetch(`https://uomdyqdvorusucuudwnz.supabase.co/functions/v1/health-realtime`);
        const data = await response.json();
        console.log('Health Realtime Check:', data);
        return data;
      } catch (error) {
        console.error('Health Realtime Error:', error);
        return { error: error.message };
      }
    }
  };
  
  console.log('🔧 Debug utilities available at window.__DEBUG_AUDIO__');
  console.log('📋 Try: __DEBUG_AUDIO__.logFeatureFlags()');
  console.log('🧪 Try: __DEBUG_AUDIO__.testHealthRealtime()');
}