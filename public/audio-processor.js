/**
 * AudioWorklet Processor for PCM16 audio capture
 * Replaces deprecated ScriptProcessorNode for microphone streaming
 */
class PCM16AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];
    
    // Accumulate samples into buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      // When buffer is full, convert to PCM16 and send
      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32Array (-1.0 to 1.0) to Int16Array (PCM16 format)
        const int16Array = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          int16Array[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send PCM16 data to main thread
        this.port.postMessage({
          type: 'audio',
          buffer: int16Array.buffer
        }, [int16Array.buffer]);
        
        // Reset buffer
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm16-audio-processor', PCM16AudioProcessor);
