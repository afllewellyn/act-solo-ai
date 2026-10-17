import { beforeEach, describe, expect, it } from 'vitest';
import { trackVoicePreviewClick } from '@/lib/voicePreviewTracking';

const trackingWindow = window as Window & { dataLayer?: Record<string, unknown>[] };

describe('homepage voice click tracking', () => {
  beforeEach(() => { delete trackingWindow.dataLayer; });

  it('identifies each voice independently of its descriptive label', () => {
    for (const voice of [
      { id: 'matilda', name: 'Matilda', voiceId: 'XrExE9yKIg1WjnnlVkGX' },
      { id: 'liam', name: 'Liam', voiceId: 'TX3LPaxmHKxFdv7VOQHJ' },
      { id: 'jessica', name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
    ]) trackVoicePreviewClick(voice, 'play');
    expect(trackingWindow.dataLayer?.map(event => event.voice_name)).toEqual(['Matilda', 'Liam', 'Jessica']);
    expect(trackingWindow.dataLayer?.map(event => event.button_id)).toEqual(['voice-preview-matilda', 'voice-preview-liam', 'voice-preview-jessica']);
    expect(trackingWindow.dataLayer?.map(event => event.event)).toEqual(['voice_preview_click', 'voice_preview_click', 'voice_preview_click']);
  });

  it('preserves existing tracking events and distinguishes pause from play', () => {
    trackingWindow.dataLayer = [{ event: 'existing' }];
    trackVoicePreviewClick({ id: 'liam', name: 'Liam', voiceId: 'TX3LPaxmHKxFdv7VOQHJ' }, 'pause');
    expect(trackingWindow.dataLayer).toEqual([
      { event: 'existing' },
      { event: 'voice_preview_click', voice_name: 'Liam', voice_id: 'TX3LPaxmHKxFdv7VOQHJ', preview_action: 'pause', button_id: 'voice-preview-liam' },
    ]);
  });
});