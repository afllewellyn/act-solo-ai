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