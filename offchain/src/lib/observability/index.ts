// offchain/src/lib/observability/index.ts
// Barrel re-exports for the observability subsystem.

export {
  initSentry,
  setupSentryErrorHandler,
  captureError,
  flushSentry,
} from './sentry'

export {
  initTracing,
  getTracer,
  withSpan,
  shutdownTracing,
} from './tracing'
