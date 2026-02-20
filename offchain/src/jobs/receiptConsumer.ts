/**
 * Receipt Consumer — polls the shared `receipt_events` Postgres table
 * written by TrustGate and creates on-chain Lucid-L2 receipts.
 *
 * Flow:
 *   TrustGate (v1.ts) ──write──► receipt_events table
 *   receiptConsumer   ──poll───► receipt_events WHERE processed = false
 *                     ──call───► createReceipt()
 *                     ──mark───► processed = true
 *
 * This keeps TrustGate completely blockchain-free. All Solana anchoring
 * stays in Lucid-L2.
 */

import { createReceipt } from '../services/receiptService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptEventRow {
  id: string
  model_passport_id: string
  compute_passport_id: string | null
  policy_hash: string
  tokens_in: number | null
  tokens_out: number | null
  tenant_id: string
  model: string | null
  endpoint: string | null
  created_at: string
}

export interface ReceiptConsumerConfig {
  /** Poll interval in ms (default: 5000) */
  interval_ms: number
  /** Max rows per poll batch (default: 50) */
  batch_size: number
  /** Whether the consumer is enabled (default: true) */
  enabled: boolean
  /** Log level */
  log_level: 'debug' | 'info' | 'warn' | 'error'
}

export interface ReceiptConsumerStats {
  processed_total: number
  failed_total: number
  last_poll_at: number | null
  last_processed_count: number
  running: boolean
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ReceiptConsumerConfig = {
  interval_ms: 5_000,
  batch_size: 50,
  enabled: true,
  log_level: 'info',
}

let config: ReceiptConsumerConfig = { ...DEFAULT_CONFIG }
let pollInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false
let queryFn: ((sql: string, params?: any[]) => Promise<{ rows: any[] }>) | null = null

const stats: ReceiptConsumerStats = {
  processed_total: 0,
  failed_total: 0,
  last_poll_at: null,
  last_processed_count: 0,
  running: false,
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: unknown): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  if (levels[level] < levels[config.log_level]) return
  const ts = new Date().toISOString()
  const line = `[${ts}] [ReceiptConsumer] [${level.toUpperCase()}] ${msg}`
  if (data) console[level](line, data)
  else console[level](line)
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Provide a DB query function — must be called before startReceiptConsumer().
 * Typically the same pg Pool query used by the rest of the offchain app.
 */
export function initReceiptConsumer(
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  overrides?: Partial<ReceiptConsumerConfig>
): void {
  queryFn = query
  if (overrides) config = { ...config, ...overrides }
}

// ---------------------------------------------------------------------------
// Core poll logic
// ---------------------------------------------------------------------------

async function pollOnce(): Promise<number> {
  if (!queryFn) {
    log('warn', 'queryFn not set — skipping poll. Call initReceiptConsumer() first.')
    return 0
  }

  if (isPolling) {
    log('debug', 'Already polling — skipping concurrent run')
    return 0
  }

  isPolling = true
  stats.last_poll_at = Date.now()
  let processed = 0

  try {
    // Fetch unprocessed events — use FOR UPDATE SKIP LOCKED for safe concurrency
    const result = await queryFn(
      `SELECT id, model_passport_id, compute_passport_id, policy_hash,
              tokens_in, tokens_out, tenant_id, model, endpoint, created_at
       FROM receipt_events
       WHERE processed = false
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [config.batch_size]
    )

    const rows: ReceiptEventRow[] = result.rows

    if (rows.length === 0) {
      log('debug', 'No unprocessed receipt events')
      return 0
    }

    log('info', `Processing ${rows.length} receipt events`)

    for (const row of rows) {
      try {
        // createReceipt() is the existing Lucid-L2 service — same as the /v1/receipts endpoint
        const receipt = createReceipt({
          model_passport_id: row.model_passport_id,
          compute_passport_id: row.compute_passport_id ?? 'unknown',
          policy_hash: row.policy_hash,
          runtime: row.model ?? 'unknown',
          tokens_in: row.tokens_in ?? 0,
          tokens_out: row.tokens_out ?? 0,
          ttft_ms: 0, // Not tracked via TrustGate side-channel
        })

        // Mark as processed
        await queryFn!(
          `UPDATE receipt_events SET processed = true WHERE id = $1`,
          [row.id]
        )

        processed++
        stats.processed_total++

        log('debug', `Processed receipt event ${row.id} → receipt ${receipt.run_id}`)
      } catch (err) {
        stats.failed_total++
        log('error', `Failed to process receipt event ${row.id}`, err)
        // Don't mark processed — it will be retried next poll
      }
    }

    log('info', `Processed ${processed}/${rows.length} receipt events`)
    return processed
  } catch (err) {
    log('error', 'Poll failed', err)
    return 0
  } finally {
    stats.last_processed_count = processed
    isPolling = false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the background receipt consumer.
 */
export function startReceiptConsumer(): void {
  if (!config.enabled) {
    log('info', 'Receipt consumer is disabled')
    return
  }

  if (pollInterval) {
    log('warn', 'Receipt consumer already running')
    return
  }

  log('info', `Starting receipt consumer (interval: ${config.interval_ms}ms, batch: ${config.batch_size})`)
  stats.running = true

  // Run immediately then on interval
  pollOnce().catch(err => log('error', 'Initial poll failed', err))

  pollInterval = setInterval(() => {
    pollOnce().catch(err => log('error', 'Poll failed', err))
  }, config.interval_ms)
}

/**
 * Stop the background receipt consumer.
 */
export function stopReceiptConsumer(): void {
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
  stats.running = false
  log('info', 'Receipt consumer stopped')
}

/**
 * Get current consumer statistics.
 */
export function getReceiptConsumerStats(): ReceiptConsumerStats {
  return { ...stats }
}

/**
 * Manually trigger one poll cycle (for testing / admin use).
 */
export async function triggerReceiptConsumerPoll(): Promise<number> {
  return pollOnce()
}

/**
 * Reset state (testing only).
 */
export function resetReceiptConsumer(): void {
  stopReceiptConsumer()
  config = { ...DEFAULT_CONFIG }
  queryFn = null
  isPolling = false
  stats.processed_total = 0
  stats.failed_total = 0
  stats.last_poll_at = null
  stats.last_processed_count = 0
  stats.running = false
}
