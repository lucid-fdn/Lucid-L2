/**
 * Structured Logger
 *
 * Pino-based JSON logger. Replaces console.log/warn/error globally so
 * existing code gets structured output without per-file changes.
 *
 * In development (`NODE_ENV !== 'production'`), logs are piped through
 * pino-pretty for human-readable output.
 *
 * Usage (new code):
 *   import { logger } from '../lib/logger';
 *   logger.info({ run_id }, 'Receipt created');
 *
 * Existing console.log/warn/error calls are automatically redirected.
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});

/**
 * Redirect global console methods to pino so every existing
 * console.log/warn/error in the codebase emits structured JSON in production.
 */
export function hijackConsole(): void {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  console.log = (...args: unknown[]) => logger.info(formatArgs(args));
  console.info = (...args: unknown[]) => logger.info(formatArgs(args));
  console.warn = (...args: unknown[]) => logger.warn(formatArgs(args));
  console.error = (...args: unknown[]) => logger.error(formatArgs(args));

  // Expose originals for cases that explicitly need raw stdout (e.g. CLI)
  (console as any)._original = original;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
    // Strip emoji prefixes for cleaner log parsing
    .replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]+\s*/u, '');
}

export default logger;
