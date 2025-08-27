/**
 * Structured logging utility
 * Phase 1 - Stabilize Web Speech Engine
 */

import { isFeatureEnabled } from './featureFlags';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  sessionId?: string;
  component?: string;
  browser?: string;
  isMobile?: boolean;
  userId?: string;
  [key: string]: any;
}

export interface StreamingTTSLogContext extends LogContext {
  lineIdx?: number;
  engine?: 'webspeech' | 's2s';
  requestId?: string;
  // Timing markers (server-side - ISO timestamps)
  t_turn_end_detected?: string;
  t_tts_request_start?: string;
  t_tts_first_byte?: string;
  t_tts_stream_end?: string;
  // Timing markers (client-side - performance.now())
  t_cut_event?: number;
  t_play_start?: number;
  t_silence_complete?: number;
  // Metrics and parameters
  vad_params?: {
    aggressiveness?: number;
    frame_ms?: number;
    silence_ms?: number;
  };
  bytes_streamed?: number;
  ws_reconnects?: number;
  jitter_buffer_ms?: number;
  latency_ms_endToFirstByte?: number;
  cut_to_silence_ms?: number;
}

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private sessionId: string;
  private defaultContext: LogContext = {};

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEvent {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        sessionId: this.sessionId,
        ...this.defaultContext,
        ...context,
      },
      error,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!isFeatureEnabled('structured_logging')) {
      return level === 'error'; // Always log errors
    }
    return true;
  }

  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      const logEvent = this.formatLog('debug', message, context);
      console.debug(`🔍 [${logEvent.context?.component || 'Unknown'}]`, message, logEvent.context);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      const logEvent = this.formatLog('info', message, context);
      console.log(`ℹ️ [${logEvent.context?.component || 'Unknown'}]`, message, logEvent.context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      const logEvent = this.formatLog('warn', message, context);
      console.warn(`⚠️ [${logEvent.context?.component || 'Unknown'}]`, message, logEvent.context);
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      const logEvent = this.formatLog('error', message, context, error);
      console.error(`❌ [${logEvent.context?.component || 'Unknown'}]`, message, logEvent.context, error);
    }
  }

  // Specific logging methods for audio components
  speechRecognition(event: string, data: any): void {
    this.info(`Speech Recognition: ${event}`, { component: 'SpeechRecognition', ...data });
  }

  tts(event: string, data: any): void {
    this.info(`TTS: ${event}`, { component: 'TTS', ...data });
  }

  audioManager(event: string, data: any): void {
    this.info(`Audio Manager: ${event}`, { component: 'AudioManager', ...data });
  }

  // Streaming TTS specific logging methods
  streamingTTS(event: string, context: StreamingTTSLogContext): void {
    this.info(`Streaming TTS: ${event}`, { component: 'StreamingTTS', ...context });
  }

  // Server-side timing markers (use ISO timestamps)
  logServerTiming(event: string, context: StreamingTTSLogContext): void {
    const serverContext = {
      ...context,
      ts: new Date().toISOString(), // Server clock
    };
    this.info(`Server Timing: ${event}`, { component: 'TTSServer', ...serverContext });
  }

  // Client-side timing markers (use performance.now())
  logClientTiming(event: string, context: StreamingTTSLogContext): void {
    const clientContext = {
      ...context,
      ts: performance.now(), // Client performance timer
    };
    this.info(`Client Timing: ${event}`, { component: 'TTSClient', ...clientContext });
  }

  // VAD events
  logVAD(event: string, context: StreamingTTSLogContext): void {
    this.info(`VAD: ${event}`, { component: 'VAD', ...context });
  }

  // Latency calculation helpers
  calculateLatency(startTime: number | string, endTime: number | string): number {
    if (typeof startTime === 'string' && typeof endTime === 'string') {
      // ISO timestamps - server side
      return new Date(endTime).getTime() - new Date(startTime).getTime();
    } else if (typeof startTime === 'number' && typeof endTime === 'number') {
      // Performance.now() - client side
      return endTime - startTime;
    }
    return 0;
  }

  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience exports
export const logSpeechRecognition = (event: string, data: any) => logger.speechRecognition(event, data);
export const logTTS = (event: string, data: any) => logger.tts(event, data);
export const logAudioManager = (event: string, data: any) => logger.audioManager(event, data);

// Streaming TTS convenience exports
export const logStreamingTTS = (event: string, context: StreamingTTSLogContext) => logger.streamingTTS(event, context);
export const logServerTiming = (event: string, context: StreamingTTSLogContext) => logger.logServerTiming(event, context);
export const logClientTiming = (event: string, context: StreamingTTSLogContext) => logger.logClientTiming(event, context);
export const logVAD = (event: string, context: StreamingTTSLogContext) => logger.logVAD(event, context);
export const generateRequestId = () => logger.generateRequestId();
export const calculateLatency = (startTime: number | string, endTime: number | string) => logger.calculateLatency(startTime, endTime);