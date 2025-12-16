/**
 * AudioWorklet Processor for PCM16 audio capture with resampling
 * Supports Firefox by resampling from native sample rate to 16kHz
 * Replaces deprecated ScriptProcessorNode for microphone streaming
 */
class PCM16AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Sample rate configuration (set via port message)
    this.sourceSampleRate = 16000; // Default, will be overwritten
    this.targetSampleRate = 16000;
    this.resampleRatio = 1;
    
    // Listen for initialization message with sample rates
    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.sourceSampleRate = event.data.sourceSampleRate || 16000;
        this.targetSampleRate = event.data.targetSampleRate || 16000;
        this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];
    
    // Accumulate samples into buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      // When buffer is full, resample and convert to PCM16
      if (this.bufferIndex >= this.bufferSize) {
        let outputData;
        
        if (this.resampleRatio === 1) {
          // No resampling needed - direct conversion
          outputData = this.convertToPCM16(this.buffer);
        } else {
          // Resample from native rate to 16kHz using linear interpolation
          const resampledBuffer = this.resample(this.buffer);
          outputData = this.convertToPCM16(resampledBuffer);
        }
        
        // Send PCM16 data to main thread
        this.port.postMessage({
          type: 'audio',
          buffer: outputData.buffer
        }, [outputData.buffer]);
        
        // Reset buffer
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
  
  /**
   * Resample audio from source rate to target rate using linear interpolation
   */
  resample(inputBuffer) {
    const outputLength = Math.floor(inputBuffer.length / this.resampleRatio);
    const outputBuffer = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.resampleRatio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      // Linear interpolation between samples
      outputBuffer[i] = inputBuffer[srcIndexFloor] * (1 - fraction) + inputBuffer[srcIndexCeil] * fraction;
    }
    
    return outputBuffer;
  }
  
  /**
   * Convert Float32Array (-1.0 to 1.0) to Int16Array (PCM16 format)
   */
  convertToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }
}

registerProcessor('pcm16-audio-processor', PCM16AudioProcessor);
