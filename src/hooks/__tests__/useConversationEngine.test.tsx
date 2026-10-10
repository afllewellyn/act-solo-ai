import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ConversationEvent } from '@/services/conversation/types';

let emit: (event: ConversationEvent) => void = () => {};

vi.mock('@/services/conversation/engineFactory', () => ({
  createConversationEngine: vi.fn(async () => ({
    onEvent: (handler: (event: ConversationEvent) => void) => {
      emit = handler;
      return () => {};
    },
    start: async () => {},
    stop: async () => {},
    sendText: async () => {},
    updateContext: async () => {},
    sendControl: async () => {},
  })),
}));

import { useConversationEngine } from '../useConversationEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useConversationEngine callbacks', () => {
  it('calls the latest callbacks even though the engine subscribed once at start', async () => {
    const seen: number[] = [];
    let api: ReturnType<typeof useConversationEngine> | null = null;

    const Harness = ({ line }: { line: number }) => {
      api = useConversationEngine({ onAgentResponseEnded: () => seen.push(line) });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Harness line={0} />));
    await act(async () => {
      await api!.start({ voiceId: 'v', language: 'en' } as never);
    });

    // Re-render with new state (e.g. the rehearsal moved to line 3) after the engine started
    await act(async () => root.render(<Harness line={3} />));

    emit({ type: 'agent_response', text: 'hello' } as ConversationEvent);
    expect(seen).toEqual([3]); // a stale closure would report 0

    await act(async () => root.unmount());
  });
});
