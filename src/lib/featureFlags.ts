/**
 * Feature flags infrastructure for runtime configuration
 * Production-hardened version - legacy flags removed
 */

export type FeatureFlag = 
  | 'enhanced_speech_recognition'
  | 'structured_logging'
  | 'mobile_audio_optimization'
  | 'auto_fallback_enabled'
  | 'diagnostics_overlay'
  | 'conversation_engine_eleven'; // ElevenLabs Conversational AI

interface FeatureFlags {
  [key: string]: boolean;
}

// Default feature flags - can be overridden by window.__FEATURES__
const DEFAULT_FLAGS: FeatureFlags = {
  enhanced_speech_recognition: true, // Enhanced speech recognition
  structured_logging: true, // Structured logging
  mobile_audio_optimization: true, // Mobile audio improvements
  auto_fallback_enabled: true, // Engine auto-fallback
  diagnostics_overlay: false, // UX diagnostics
  conversation_engine_eleven: true, // ElevenLabs Conversational AI - PRODUCTION ENGINE
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
