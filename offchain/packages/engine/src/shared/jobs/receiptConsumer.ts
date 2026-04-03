/**
 * Receipt Consumer — polls the shared `receipt_events` Postgres table
 * written by TrustGate and creates on-chain Lucid-L2 receipts.
 *
 * Flow:
 *   TrustGate (v1.ts) ──write──► receipt_events table
 *   receiptConsumer   ──poll───► receipt_events WHERE processed = false
 *                     ──call───► createInferenceReceipt()
 *                     ──mark───► processed = true
 *
 * This keeps TrustGate completely blockchain-free. All Solana anchoring
 * stays in Lucid-L2.
 */

import { Pool } from 'pg'
import { createInferenceReceipt } from '../../receipt/receiptService'
import { addReceiptToEpoch } from '../../anchoring/epoch/services/epochService'

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
  // Agent system fields (added in 020_agent_system migration)
  agent_passport_id: string | null
  run_id: string | null
  call_type: 'llm' | 'tool' | 'oracle' | null
  tool_name: string | null
  mcp_server_id: string | null
  latency_ms: number | null
  status: 'success' | 'error' | 'timeout' | null
  provider: string | null
  pricing_version: string | null
  cost_usd: number | null
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
  /** Consecutive poll failures (resets on success) */
  consecutive_failures: number
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

/** Dedicated pool for the gateway DB where receipt_events lives */
let gatewayPool: Pool | null = null

/** Max backoff interval when persistent errors occur (5 minutes) */
const MAX_BACKOFF_MS = 5 * 60 * 1000
/** Current backoff interval (resets on successful poll) */
let currentBackoffMs = 0
/** Timestamp when the next poll is allowed after backoff */
let backoffUntil = 0

const stats: ReceiptConsumerStats = {
  processed_total: 0,
  failed_total: 0,
  last_poll_at: null,
  last_processed_count: 0,
  running: false,
  consecutive_failures: 0,
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
 * Initialize the receipt consumer with a connection to the gateway DB.
 * `receipt_events` lives in the gateway (platform-core) database,
 * not the L2 database, so we need a dedicated pool.
 *
 * @param gatewayDbUrl — Postgres connection string for the gateway DB
 */
export function initReceiptConsumer(
  gatewayDbUrl: string,
  overrides?: Partial<ReceiptConsumerConfig>
): void {
  gatewayPool = new Pool({
    connectionString: gatewayDbUrl,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  if (overrides) config = { ...config, ...overrides }
}

// ---------------------------------------------------------------------------
// Core poll logic
// ---------------------------------------------------------------------------

async function pollOnce(): Promise<number> {
  if (!gatewayPool) {
    log('warn', 'Gateway pool not set — skipping poll. Call initReceiptConsumer() first.')
    return 0
  }

  if (isPolling) {
    log('debug', 'Already polling — skipping concurrent run')
    return 0
  }

  // Respect backoff on persistent errors
  if (backoffUntil > Date.now()) {
    log('debug', `Backing off until ${new Date(backoffUntil).toISOString()}`)
    return 0
  }

  isPolling = true
  stats.last_poll_at = Date.now()
  let processed = 0

  // Use a dedicated client + transaction so FOR UPDATE SKIP LOCKED holds
  // row locks until we mark events as processed.
  const client = await gatewayPool.connect()
  try {
    await client.query('BEGIN')

    // Use SELECT * to be resilient to missing columns (020_agent_system migration may not be applied)
    const result = await client.query(
      `SELECT *
       FROM receipt_events
       WHERE processed = false
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [config.batch_size]
    )

    const rows: ReceiptEventRow[] = result.rows

    // Successful query — reset backoff
    currentBackoffMs = 0
    stats.consecutive_failures = 0

    if (rows.length === 0) {
      await client.query('COMMIT')
      log('debug', 'No unprocessed receipt events')
      return 0
    }

    log('info', `Processing ${rows.length} receipt events`)

    for (const row of rows) {
      try {
        const receipt = createInferenceReceipt({
          model_passport_id: row.model_passport_id,
          compute_passport_id: row.compute_passport_id ?? 'unknown',
          policy_hash: row.policy_hash,
          runtime: row.model ?? row.call_type ?? 'unknown',
          tokens_in: row.tokens_in ?? 0,
          tokens_out: row.tokens_out ?? 0,
          ttft_ms: row.latency_ms ?? 0,
          run_id: row.run_id ?? undefined,
        })

        addReceiptToEpoch(receipt.run_id, row.agent_passport_id ?? undefined)

        // Wire agent receipts to revenue pipeline
        if (row.agent_passport_id) {
          try {
            const { processAgentRevenue } = await import('../../compute/control-plane/agent/agentRevenueService')
            await processAgentRevenue({
              agent_passport_id: row.agent_passport_id,
              run_id: receipt.run_id,
              tokens_in: row.tokens_in ?? 0,
              tokens_out: row.tokens_out ?? 0,
              model: row.model ?? 'unknown',
            })
          } catch (err) {
            log('warn', `Failed to process agent revenue for ${row.agent_passport_id}`, err)
          }
        }

        // Mark as processed (within the same transaction)
        await client.query(
          `UPDATE receipt_events SET processed = true WHERE id = $1`,
          [row.id]
        )

        processed++
        stats.processed_total++

        log('debug', `Processed receipt event ${row.id} → receipt ${receipt.run_id} (agent: ${row.agent_passport_id ?? 'global'})`)
      } catch (err) {
        stats.failed_total++
        log('error', `Failed to process receipt event ${row.id}`, err)
        // Don't mark processed — it will be retried next poll
      }
    }

    await client.query('COMMIT')
    log('info', `Processed ${processed}/${rows.length} receipt events`)
    return processed
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    stats.consecutive_failures++

    currentBackoffMs = Math.min(
      currentBackoffMs === 0 ? 10_000 : currentBackoffMs * 2,
      MAX_BACKOFF_MS
    )
    backoffUntil = Date.now() + currentBackoffMs

    const code = err?.code || 'unknown'
    log('error', `Poll failed (code=${code}, backoff=${currentBackoffMs}ms, consecutive=${stats.consecutive_failures})`, err)
    return 0
  } finally {
    client.release()
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
 * Stop the background receipt consumer and close the gateway pool.
 */
export function stopReceiptConsumer(): void {
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
  stats.running = false
  if (gatewayPool) {
    gatewayPool.end().catch(() => { /* best-effort */ })
    gatewayPool = null
  }
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
  gatewayPool = null
  isPolling = false
  currentBackoffMs = 0
  backoffUntil = 0
  stats.processed_total = 0
  stats.failed_total = 0
  stats.last_poll_at = null
  stats.last_processed_count = 0
  stats.running = false
  stats.consecutive_failures = 0
}
