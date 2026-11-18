import { pino, type Logger, type LoggerOptions } from 'pino';
import type { LogLevel, NodeEnv } from '../config/env.js';

export type { Logger } from 'pino';

/**
 * Paths that must never reach the log (security.md#logging-hygiene). A unit test asserts each one.
 * Request and response bodies are never logged in the first place.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-csrf-token"]',
  'headers["set-cookie"]',
  'password',
  'token',
  'secret',
  'databaseUrl',
  'encryptionKey',
  '*.password',
  '*.token',
  '*.secret',
  '*.databaseUrl',
  '*.encryptionKey',
] as const;

export interface LoggerConfig {
  readonly level: LogLevel;
  readonly nodeEnv: NodeEnv;
}

export function loggerOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.level,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
    formatters: { level: (label) => ({ level: label }) },
  };
}

export function createLogger(config: LoggerConfig, destination?: pino.DestinationStream): Logger {
  const options = loggerOptions(config);
  if (destination) return pino(options, destination);
  if (config.nodeEnv === 'development') {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { singleLine: true } } });
  }
  return pino(options);
}
