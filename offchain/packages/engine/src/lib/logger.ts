/**
 * Structured Logger
 *
 * Pino-based JSON logger. Provides both a raw pino instance (`pinoLogger`)
 * and a console-compatible wrapper (`logger`) that accepts variadic args.
 *
 * In development (`NODE_ENV !== 'production'`), logs are piped through
 * pino-pretty for human-readable output.
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   logger.info('Receipt created');
 *   logger.error('Failed to process:', error);
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const pinoLogger = pino({
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

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
    // Strip emoji prefixes for cleaner log parsing
    .replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]+\s*/u, '');
}

/**
 * Console-compatible structured logger.
 * Accepts variadic args like console.log/warn/error but emits structured JSON in production.
 */
export const logger = {
  info: (...args: unknown[]) => pinoLogger.info(formatArgs(args)),
  warn: (...args: unknown[]) => pinoLogger.warn(formatArgs(args)),
  error: (...args: unknown[]) => pinoLogger.error(formatArgs(args)),
  debug: (...args: unknown[]) => pinoLogger.debug(formatArgs(args)),
};

/**
 * Redirect global console methods to pino so any remaining
 * console.log/warn/error calls emit structured JSON in production.
 */
export function hijackConsole(): void {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  console.log = (...args: unknown[]) => pinoLogger.info(formatArgs(args));
  console.info = (...args: unknown[]) => pinoLogger.info(formatArgs(args));
  console.warn = (...args: unknown[]) => pinoLogger.warn(formatArgs(args));
  console.error = (...args: unknown[]) => pinoLogger.error(formatArgs(args));

  // Expose originals for cases that explicitly need raw stdout (e.g. CLI)
  (console as any)._original = original;
}

export default logger;
