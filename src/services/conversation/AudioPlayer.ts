/**
 * Audio Player for ElevenLabs Conversational AI
 * Handles PCM-to-WAV conversion and sequential playback of agent audio chunks
 */

export class ConversationAudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor() {
    console.log('[ConversationAudioPlayer] Created');
  }

  /**
   * Add an audio chunk to the queue and start playback if not already playing
   * @param pcmData - Raw PCM16 audio data (24kHz, 16-bit, mono)
   */
  async addChunk(pcmData: ArrayBuffer): Promise<void> {
    this.audioQueue.push(pcmData);
    
    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  /**
   * Stop current playback and clear the queue
   */
  stop(): void {
    console.log('[ConversationAudioPlayer] Stopping playback');
    
    // Stop current playing source
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }
    
    // Clear the queue
    this.audioQueue = [];
    this.isPlaying = false;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    console.log('[ConversationAudioPlayer] Destroying');
    this.stop();
    
    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close();
    }
    this.audioContext = null;
  }

  /**
   * Play the next audio chunk in the queue
   */
  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const pcmData = this.audioQueue.shift()!;

    try {
      // Ensure audio context exists
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext({ sampleRate: 24000 });
      }
      
      // Resume if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Convert PCM to WAV
      const wavData = this.createWavFromPCM(pcmData);
      
      // Decode and play
      const audioBuffer = await this.audioContext.decodeAudioData(wavData);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      this.currentSource = source;
      
      // Play next chunk when this one ends
      source.onended = () => {
        this.currentSource = null;
        this.playNext();
      };
      
      source.start(0);
    } catch (error) {
      console.error('[ConversationAudioPlayer] Error playing audio:', error);
      // Continue with next chunk even if current fails
      this.currentSource = null;
      this.playNext();
    }
  }

  /**
   * Convert raw PCM16 data to WAV format with proper headers
   * ElevenLabs outputs: 24kHz, 16-bit, mono
   */
  private createWavFromPCM(pcmData: ArrayBuffer): ArrayBuffer {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    
    const dataSize = pcmData.byteLength;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // Write WAV header
    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true); // File size - 8
    this.writeString(view, 8, 'WAVE');
    
    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Copy PCM data
    const pcmView = new Uint8Array(pcmData);
    const wavView = new Uint8Array(buffer);
    wavView.set(pcmView, headerSize);
    
    return buffer;
  }

  /**
   * Helper to write string to DataView
   */
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
