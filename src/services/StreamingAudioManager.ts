/**
 * Streaming Audio Manager - Phase 2
 * Handles streaming audio playback with chunk buffering and queue management
 */

import { isFeatureEnabled } from '@/lib/featureFlags';
import { supabase } from '@/integrations/supabase/client';
import { logClientTiming, generateRequestId } from '@/lib/logger';

interface AudioChunk {
  id: number;
  data: Uint8Array;
  isPlaying: boolean;
}

interface StreamingOptions {
  voiceId?: string;
  model?: string;
  onChunkReceived?: (chunkSize: number) => void;
  onStreamComplete?: () => void;
  onError?: (error: Error) => void;
}

export class StreamingAudioManager {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioChunk[] = [];
  private currentlyPlaying: HTMLAudioElement | null = null;
  private isPlaying = false;
  private chunkCounter = 0;
  private abortController: AbortController | null = null;
  private requestId: string | null = null;
  private requestStart: number | null = null;

  constructor() {
    this.initializeAudioContext();
  }

  private async initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Handle autoplay policy
      if (this.audioContext.state === 'suspended') {
        console.log('[StreamingAudio] AudioContext suspended, waiting for user interaction');
      }
    } catch (error) {
      console.error('[StreamingAudio] Failed to initialize AudioContext:', error);
    }
  }

  private async unlockAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[StreamingAudio] AudioContext resumed');
    }
  }

  /**
   * Start streaming TTS for the given text
   */
  async startStreaming(text: string, options: StreamingOptions = {}): Promise<void> {
    if (!isFeatureEnabled('tts_streaming_enabled')) {
      throw new Error('Streaming TTS is not enabled');
    }

    console.log('[StreamingAudio] Starting streaming TTS:', text.substring(0, 50) + '...');

    // Stop any current playback
    this.stop();

    // Reset state
    this.audioQueue = [];
    this.chunkCounter = 0;
    this.abortController = new AbortController();
    this.requestId = generateRequestId();
    this.requestStart = performance.now();

    try {
      await this.unlockAudioContext();

      // Start streaming from Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('text-to-speech-stream', {
        body: {
          text,
          voiceId: options.voiceId,
          model: options.model
        }
      });

      if (error) {
        throw new Error(`Streaming TTS error: ${error.message}`);
      }

      // Handle the streaming response
      await this.handleStreamingResponse(data, options);

    } catch (error) {
      console.error('[StreamingAudio] Streaming error:', error);
      options.onError?.(error as Error);
      throw error;
    }
  }

  private async handleStreamingResponse(response: Response, options: StreamingOptions) {
    if (!response.body) {
      throw new Error('No response body received');
    }

    const reader = response.body.getReader();
    let isFirstChunk = true;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[StreamingAudio] Stream complete');
          options.onStreamComplete?.();
          break;
        }

        // Process audio chunk
        const chunk: AudioChunk = {
          id: ++this.chunkCounter,
          data: value,
          isPlaying: false
        };

        this.audioQueue.push(chunk);
        options.onChunkReceived?.(value.length);

        console.log(`[StreamingAudio] Received chunk ${chunk.id}, size: ${value.length} bytes`);

        // Start playback on first chunk
        if (isFirstChunk) {
          isFirstChunk = false;
          // Emit end-to-first-byte latency for streaming
          if (this.requestStart) {
            logClientTiming('latency_ms_endToFirstByte', {
              requestId: this.requestId || undefined,
              latency_ms_endToFirstByte: Math.round(performance.now() - this.requestStart),
            });
          }
          this.startPlayback();
        }
      }
    } catch (error) {
      console.error('[StreamingAudio] Stream reading error:', error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  private async startPlayback() {
    if (this.isPlaying || this.audioQueue.length === 0) {
      return;
    }

    this.isPlaying = true;
    console.log('[StreamingAudio] Starting playback queue');

    // Process queue
    while (this.audioQueue.length > 0 && this.isPlaying) {
      const chunk = this.audioQueue.shift();
      if (chunk) {
        await this.playChunk(chunk);
      }
    }

    this.isPlaying = false;
    console.log('[StreamingAudio] Playback queue complete');
  }

  private async playChunk(chunk: AudioChunk): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert Uint8Array to Blob and create object URL
        const blob = new Blob([new Uint8Array(chunk.data)], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);

        // Create audio element
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';

        // Set up event listeners
        audio.onloadeddata = () => {
          console.log(`[StreamingAudio] Chunk ${chunk.id} loaded, duration: ${audio.duration}s`);
        };

        audio.onended = () => {
          console.log(`[StreamingAudio] Chunk ${chunk.id} playback complete`);
          URL.revokeObjectURL(audioUrl);
          this.currentlyPlaying = null;
          resolve();
        };

        audio.onerror = (error) => {
          console.error(`[StreamingAudio] Chunk ${chunk.id} playback error:`, error);
          URL.revokeObjectURL(audioUrl);
          this.currentlyPlaying = null;
          reject(new Error(`Audio playback failed for chunk ${chunk.id}`));
        };

        // Start playback
        this.currentlyPlaying = audio;
        chunk.isPlaying = true;
        
        audio.play().catch(error => {
          console.error(`[StreamingAudio] Failed to play chunk ${chunk.id}:`, error);
          reject(error);
        });

      } catch (error) {
        console.error(`[StreamingAudio] Error processing chunk ${chunk.id}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Pause current playback
   */
  pause() {
    if (this.currentlyPlaying) {
      this.currentlyPlaying.pause();
      console.log('[StreamingAudio] Playback paused');
    }
  }

  /**
   * Resume paused playback
   */
  resume() {
    if (this.currentlyPlaying && this.currentlyPlaying.paused) {
      this.currentlyPlaying.play();
      console.log('[StreamingAudio] Playback resumed');
    }
  }

  /**
   * Stop all playback and clear queue
   */
  stop() {
    console.log('[StreamingAudio] Stopping playback');

    // Abort any ongoing stream
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop current audio
    if (this.currentlyPlaying) {
      this.currentlyPlaying.pause();
      this.currentlyPlaying.currentTime = 0;
      this.currentlyPlaying = null;
    }

    // Clear queue
    this.audioQueue = [];
    this.isPlaying = false;
    this.chunkCounter = 0;
  }

  /**
   * Get current playback status
   */
  getStatus() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.audioQueue.length,
      currentChunk: this.currentlyPlaying ? this.chunkCounter - this.audioQueue.length : null,
      isStreamingEnabled: isFeatureEnabled('tts_streaming_enabled')
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Singleton instance for global use
let streamingAudioManager: StreamingAudioManager | null = null;

export function getStreamingAudioManager(): StreamingAudioManager {
  if (!streamingAudioManager) {
    streamingAudioManager = new StreamingAudioManager();
  }
  return streamingAudioManager;
}