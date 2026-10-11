import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationAudioPlayer } from '../AudioPlayer';

interface FakeSource {
  buffer: unknown;
  playbackRate: { value: number };
  onended: (() => void) | null;
  connect: () => void;
  start: () => void;
  stop: () => void;
}

let sources: FakeSource[] = [];

class FakeAudioContext {
  state = 'running';
  destination = {};
  async resume() {}
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return {}; }
  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      connect: () => {},
      start: () => {},
      stop: () => { /* the real node fires onended asynchronously */ setTimeout(() => source.onended?.(), 0); },
    };
    sources.push(source);
    return source;
  }
}

const chunk = () => new Uint8Array([1, 2, 3, 4]).buffer;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ConversationAudioPlayer', () => {
  beforeEach(() => {
    sources = [];
    (globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  });

  it('plays chunks at the configured speed, including one already playing', async () => {
    const player = new ConversationAudioPlayer();
    player.setPlaybackSpeed(0.8);
    await player.addChunk(chunk());
    expect(sources[0].playbackRate.value).toBe(0.8);

    player.setPlaybackSpeed(1.1); // live change while the first chunk is playing
    expect(sources[0].playbackRate.value).toBe(1.1);

    sources[0].onended?.();
    await flush();
    await player.addChunk(chunk());
    expect(sources[1].playbackRate.value).toBe(1.1);
  });

  it('clamps speed to a sane range and ignores junk values', () => {
    const player = new ConversationAudioPlayer();
    player.setPlaybackSpeed(10);
    player.setPlaybackSpeed(Number.NaN);
    return player.addChunk(chunk()).then(() => {
      expect(sources[0].playbackRate.value).toBe(2);
    });
  });

  it('reports drained only after the last queued chunk finished', async () => {
    const player = new ConversationAudioPlayer();
    const drained = vi.fn();
    player.onDrained = drained;

    await player.addChunk(chunk());
    await player.addChunk(chunk()); // queued behind the first
    expect(player.isBusy).toBe(true);

    sources[0].onended?.();
    await flush();
    expect(drained).not.toHaveBeenCalled(); // second chunk now playing
    expect(sources).toHaveLength(2);

    sources[1].onended?.();
    await flush();
    expect(drained).toHaveBeenCalledTimes(1);
    expect(player.isBusy).toBe(false);
  });

  it('does not report drained when stopped', async () => {
    const player = new ConversationAudioPlayer();
    const drained = vi.fn();
    player.onDrained = drained;
    await player.addChunk(chunk());
    player.stop();
    await flush();
    expect(drained).not.toHaveBeenCalled();
    expect(player.isBusy).toBe(false);
  });
});
