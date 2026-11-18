import { Writable } from 'node:stream';
import { createLogger, type Logger } from '../infra/logger.js';

/** A logger that captures JSON lines in memory for assertions. */
export function captureLogger(level: 'info' | 'debug' = 'debug'): {
  logger: Logger;
  lines: () => Record<string, unknown>[];
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  const logger = createLogger({ level, nodeEnv: 'test' }, stream);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
