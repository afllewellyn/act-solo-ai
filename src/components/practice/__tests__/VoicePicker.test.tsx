import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false }),
}));

import { VoicePicker } from '../VoicePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const voices = [
  { id: 'a', name: 'Roger', category: 'x', gender: 'Male', accent: 'American' },
  { id: 'b', name: 'Sarah', category: 'x', gender: 'Female', accent: 'American' },
];

describe('VoicePicker', () => {
  it('offers a single way to pick a voice, with the Test button beside it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<VoicePicker voices={voices} selectedVoice="b" onVoiceChange={() => {}} />));

    expect(container.textContent).not.toContain('Browse voices');
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);

    const row = container.querySelector('[role="combobox"]')!.parentElement!;
    const test = row.querySelector('button[aria-label="Preview Sarah"]');
    expect(test).not.toBeNull();
    expect(test!.textContent).toContain('Test');
    expect(test!.className).toContain('h-10'); // same height as the select trigger

    await act(async () => root.unmount());
    container.remove();
  });

  it('hides the Test label in compact mode', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<VoicePicker voices={voices} selectedVoice="a" compact />));
    expect(container.querySelector('button[aria-label="Preview Roger"]')!.textContent).toBe('');
    await act(async () => root.unmount());
  });
});
