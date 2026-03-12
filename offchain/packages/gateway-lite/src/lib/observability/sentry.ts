// offchain/src/lib/observability/sentry.ts
// Sentry error tracking and performance monitoring for the Lucid L2 Express API.
//
// In Sentry SDK v9+, Express is auto-instrumented once Sentry.init() runs.
// The only middleware needed is setupExpressErrorHandler() placed after all routes.

import * as Sentry from '@sentry/node'
import type { Application } from 'express'
import { logger } from '../../../../engine/src/lib/logger';

/**
 * Initialize Sentry SDK.  Must be called as early as possible so that the
 * automatic Express / HTTP instrumentation hooks can register before
 * Express handles the first request.
 *
 * If SENTRY_DSN is not set the call is a no-op (safe in local dev).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.warn('[sentry] No SENTRY_DSN - disabled')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.LUCID_ENV || process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || 'dev',
    tracesSampleRate: process.env.LUCID_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip sensitive headers before they leave the process
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-key']
        delete event.request.headers['x-payment-proof']
      }
      return event
    },
  })

  logger.info('[sentry] Initialized for lucid-l2')
}

/**
 * Attach the Sentry Express error handler.
 * Must be called **after** all routes but **before** any custom error-handling
 * middleware so that Sentry sees unhandled errors first.
 */
export function setupSentryErrorHandler(app: Application): void {
  Sentry.setupExpressErrorHandler(app)
}

/**
 * Manually capture an error with optional structured context.
 */
export function captureError(
  error: Error | unknown,
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('custom', context)
    }
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
    )
  })
}

/**
 * Flush pending Sentry events (call during graceful shutdown).
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  await Sentry.flush(timeout)
}
