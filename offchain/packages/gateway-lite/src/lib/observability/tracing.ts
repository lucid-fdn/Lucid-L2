// offchain/src/lib/observability/tracing.ts
// OpenTelemetry distributed tracing for the Lucid L2 Express API.
//
// Tracing is opt-in: set OTEL_ENABLED=true to activate.
// All heavy OTel imports are dynamic so the production bundle is not bloated
// when tracing is disabled.

import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import type { Tracer, Span } from '@opentelemetry/api'
import { logger } from '../../../../engine/src/shared/lib/logger';

/** Handle to the running SDK so we can shut it down cleanly. */
let _sdk: { shutdown: () => Promise<void> } | null = null

/**
 * Initialise the OpenTelemetry Node SDK with HTTP, Express, and Postgres
 * auto-instrumentation.  This **must** be called before Express (or pg) is
 * imported so that the instrumentation hooks can monkey-patch correctly.
 *
 * When OTEL_ENABLED !== 'true' the function is a no-op.
 */
export async function initTracing(): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') return

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    { BatchSpanProcessor },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { PgInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/sdk-trace-base'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-express'),
    import('@opentelemetry/instrumentation-pg'),
  ])

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  })

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'lucid-l2',
      [ATTR_SERVICE_VERSION]:
        process.env.npm_package_version || '1.0.0',
      'deployment.environment.name':
        process.env.LUCID_ENV || 'development',
      'service.namespace': 'lucid',
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation(),
    ],
  })

  sdk.start()
  _sdk = sdk

  process.on('SIGTERM', () => _sdk?.shutdown().catch(() => undefined))

  logger.info(
    `[otel] Tracing initialized for lucid-l2 (endpoint=${endpoint})`,
  )
}

/** Return a tracer scoped to the lucid-l2 service. */
export function getTracer(): Tracer {
  return trace.getTracer('lucid-l2')
}

/**
 * Execute an async function inside a new span.
 *
 * The span is automatically ended and its status set on success or failure.
 *
 * @example
 * ```ts
 * const result = await withSpan('db.query', { table: 'users' }, async (span) => {
 *   return db.query('SELECT ...')
 * })
 * ```
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = getTracer().startSpan(name, { attributes: attrs })
  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      () => fn(span),
    )
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : 'unknown',
    })
    span.recordException(
      err instanceof Error ? err : new Error(String(err)),
    )
    throw err
  } finally {
    span.end()
  }
}

/** Gracefully shut down the OTel SDK (flushes pending spans). */
export async function shutdownTracing(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown()
    _sdk = null
  }
}
