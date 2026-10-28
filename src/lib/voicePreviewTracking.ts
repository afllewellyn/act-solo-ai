import posthog from 'posthog-js';

export interface PreviewVoice {
  id: string;
  name: string;
  voiceId: string;
}

export function trackVoicePreviewClick(voice: PreviewVoice, action: 'play' | 'pause') {
  const trackingWindow = window as Window & { dataLayer?: Record<string, unknown>[] };
  trackingWindow.dataLayer = trackingWindow.dataLayer || [];
  trackingWindow.dataLayer.push({
    event: 'voice_preview_click',
    voice_name: voice.name,
    voice_id: voice.voiceId,
    preview_action: action,
    button_id: `voice-preview-${voice.id}`,
  });
  // Replaces the GTM Custom HTML tag that forwarded this click to PostHog.
  posthog.capture('voice_preview_click', {
    voice_name: voice.name,
    voice_id: voice.voiceId,
    action,
  });
}
