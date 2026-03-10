/**
 * Agent Mirror Consumer — polls platform-core `agent_created_events` outbox
 * and upserts agent passports into the Lucid-L2 passports table.
 *
 * Design rules:
 * - Same passport_id shared across both DBs — no cross-reference columns
 * - Upsert is idempotent + monotonic: stale/out-of-order events silently skipped
 * - event_seq (epoch-ms from platform-core) guards against replay
 * - Marks events processed in platform-core DB after successful upsert
 * - Non-blocking: errors are logged, never propagated to callers
 */

import { Pool } from 'pg'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AgentMirrorConfig {
  /** Poll interval in ms (default: 10000) */
  interval_ms: number
  /** Max rows per poll batch (default: 50) */
  batch_size: number
  /** Whether the consumer is enabled (default: true) */
  enabled: boolean
}

const DEFAULT_CONFIG: AgentMirrorConfig = {
  interval_ms: 10_000,
  batch_size: 50,
  enabled: true,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let config: AgentMirrorConfig = { ...DEFAULT_CONFIG }
let pollInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false

/** L2 local pool (same DB as the rest of the L2 backend) */
let l2QueryFn: ((sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) | null = null

/** platform-core DB pool (polled for outbox events) */
let platformCorePgPool: Pool | null = null

const stats = {
  mirrored_total: 0,
  failed_total: 0,
  last_poll_at: null as number | null,
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialize the agent mirror consumer.
 * - `l2Query` — L2 DB query function (same as rest of offchain backend)
 * - `platformCoreDbUrl` — Postgres connection string for platform-core DB
 */
export function initAgentMirrorConsumer(
  l2Query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  platformCoreDbUrl: string,
  overrides?: Partial<AgentMirrorConfig>
): void {
  l2QueryFn = l2Query
  platformCorePgPool = new Pool({
    connectionString: platformCoreDbUrl,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  if (overrides) config = { ...config, ...overrides }
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

interface AgentCreatedEventRow {
  id: string
  passport_id: string
  tenant_id: string
  name: string
  framework: string | null
  metadata: Record<string, unknown> | null
  event_seq: number
}

async function pollOnce(): Promise<number> {
  if (!l2QueryFn || !platformCorePgPool) return 0
  if (isPolling) return 0

  isPolling = true
  stats.last_poll_at = Date.now()
  let mirrored = 0

  try {
    const result = await platformCorePgPool.query<AgentCreatedEventRow>(
      `SELECT id, passport_id, tenant_id, name, framework, metadata, event_seq
       FROM agent_created_events
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [config.batch_size]
    )

    if (result.rows.length === 0) return 0

    console.log(`[AgentMirrorConsumer] Processing ${result.rows.length} agent events`)

    for (const row of result.rows) {
      try {
        // Idempotent upsert — only update if the incoming event_seq is strictly
        // greater than the last event_seq stored on the passport row.
        // We store event_seq in the JSONB metadata column under '__event_seq'.
        await l2QueryFn!(
          `INSERT INTO passports (passport_id, type, owner, name, metadata, platform_tenant_id, status, created_at, updated_at)
           VALUES ($1, 'agent', $2, $3, $4::jsonb, $2, 'active', now(), now())
           ON CONFLICT (passport_id) DO UPDATE SET
             name               = EXCLUDED.name,
             metadata           = EXCLUDED.metadata,
             platform_tenant_id = EXCLUDED.platform_tenant_id,
             updated_at         = now()
           WHERE (passports.metadata->>'__event_seq')::bigint < $5
              OR  passports.metadata->>'__event_seq' IS NULL`,
          [
            row.passport_id,
            row.tenant_id,
            row.name,
            JSON.stringify({
              ...(row.metadata || {}),
              framework: row.framework,
              __event_seq: row.event_seq,
            }),
            row.event_seq,
          ]
        )

        // Mark processed in platform-core DB
        await platformCorePgPool!.query(
          `UPDATE agent_created_events SET processed = true WHERE id = $1`,
          [row.id]
        )

        mirrored++
        stats.mirrored_total++
        console.log(`[AgentMirrorConsumer] Mirrored agent ${row.passport_id} (event_seq=${row.event_seq})`)
      } catch (err) {
        stats.failed_total++
        console.error(`[AgentMirrorConsumer] Failed to mirror agent ${row.passport_id}:`, err)
        // Don't mark processed — retry next poll
      }
    }

    return mirrored
  } catch (err) {
    console.error('[AgentMirrorConsumer] Poll failed:', err)
    return 0
  } finally {
    isPolling = false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startAgentMirrorConsumer(): void {
  if (!config.enabled) {
    console.log('[AgentMirrorConsumer] Disabled — skipping start')
    return
  }
  if (pollInterval) {
    console.warn('[AgentMirrorConsumer] Already running')
    return
  }

  console.log(`[AgentMirrorConsumer] Starting (interval: ${config.interval_ms}ms, batch: ${config.batch_size})`)

  pollOnce().catch(err => console.error('[AgentMirrorConsumer] Initial poll failed:', err))

  pollInterval = setInterval(() => {
    pollOnce().catch(err => console.error('[AgentMirrorConsumer] Poll failed:', err))
  }, config.interval_ms)
}

export function stopAgentMirrorConsumer(): void {
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
  platformCorePgPool?.end().catch(() => {})
  console.log('[AgentMirrorConsumer] Stopped')
}

export function getAgentMirrorStats() {
  return { ...stats, running: pollInterval !== null }
}

/** Manually trigger one poll (testing / admin use) */
export async function triggerAgentMirrorPoll(): Promise<number> {
  return pollOnce()
}
