/**
 * Feature flags infrastructure for runtime configuration
 * Phase 0.5 - Access & Readiness
 */

export type FeatureFlag = 
  | 'realtime_api_enabled'
  | 'tts_streaming_enabled'
  | 'enhanced_speech_recognition'
  | 'structured_logging'
  | 'mobile_audio_optimization'
  | 'server_vad_enabled'
  | 'auto_fallback_enabled'
  | 'diagnostics_overlay';

interface FeatureFlags {
  [key: string]: boolean;
}

// Default feature flags - can be overridden by window.__FEATURES__
const DEFAULT_FLAGS: FeatureFlags = {
  realtime_api_enabled: false, // OpenAI Realtime API (Phase 4)
  tts_streaming_enabled: true, // Streaming ElevenLabs TTS (Phase 2) - ENABLED
  enhanced_speech_recognition: true, // Phase 1 enhancements
  structured_logging: true, // Phase 1 logging
  mobile_audio_optimization: true, // Phase 1 mobile improvements
  server_vad_enabled: false, // Server-side VAD (Phase 4)
  auto_fallback_enabled: true, // Engine auto-fallback (Phase 3)
  diagnostics_overlay: false, // UX diagnostics (Phase 5)
};

// Extend window interface for feature flags
declare global {
  interface Window {
    __FEATURES__?: Partial<FeatureFlags>;
  }
}

/**
 * Check if a feature flag is enabled
 * @param flag - The feature flag to check
 * @returns boolean indicating if the feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const runtimeFlags = typeof window !== 'undefined' ? window.__FEATURES__ : {};
  return runtimeFlags?.[flag] ?? DEFAULT_FLAGS[flag] ?? false;
}

/**
 * Get all current feature flags
 * @returns object containing all feature flags and their states
 */
export function getAllFeatureFlags(): FeatureFlags {
  const runtimeFlags = typeof window !== 'undefined' ? window.__FEATURES__ : {};
  return {
    ...DEFAULT_FLAGS,
    ...runtimeFlags,
  };
}

/**
 * Set feature flags at runtime (for testing/debugging)
 * @param flags - Partial feature flags to override
 */
export function setFeatureFlags(flags: Partial<FeatureFlags>): void {
  if (typeof window !== 'undefined') {
    window.__FEATURES__ = {
      ...(window.__FEATURES__ || {}),
      ...flags,
    };
  }
}

/**
 * Log current feature flag state for debugging
 */
export function logFeatureFlags(): void {
  if (isFeatureEnabled('structured_logging')) {
    console.log('[Feature Flags] Current state:', getAllFeatureFlags());
  }
}