/**
 * Agent Mirror Routes — read-only proof/receipt/epoch endpoints for agents.
 *
 * These endpoints let agents (and the @lucid/agent-sdk) retrieve:
 * - Receipts tied to a specific agent passport
 * - The current open epoch for an agent
 * - An MMR proof for a specific run_id
 *
 * All endpoints are protected by verifyAdminAuth (same key used by L2 internal).
 * The @lucid/agent-sdk calls these via LUCID_L2_URL.
 */

import { Router, Request, Response } from 'express'
import { verifyAdminAuth } from '../../middleware/adminAuth'
import { getCurrentEpoch } from '../../../../engine/src/anchoring/epoch/services/epochService'
import pool from '../../../../engine/src/shared/db/pool'
import { logger } from '../../../../engine/src/shared/lib/logger';

const router = Router()

// ─── GET /v1/agents/:passportId/receipts ──────────────────────────────────
// Returns paginated receipts from the L2 DB filtered by agent_passport_id.
router.get('/v1/agents/:passportId/receipts', verifyAdminAuth, async (req: Request, res: Response) => {
  const { passportId } = req.params
  const page = Math.max(1, parseInt((req.query.page as string) || '1'))
  const perPage = Math.min(100, Math.max(1, parseInt((req.query.per_page as string) || '20')))
  const offset = (page - 1) * perPage

  try {
    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT receipt_hash, run_id, model_passport_id, compute_passport_id, policy_hash,
                tokens_in, tokens_out, model, status, created_at
         FROM receipts
         WHERE agent_passport_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [passportId, perPage, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM receipts WHERE agent_passport_id = $1`,
        [passportId]
      ),
    ])

    const total = countResult.rows[0]?.total ?? 0
    return res.json({
      receipts: rowsResult.rows,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    })
  } catch (err) {
    logger.error('[agentMirrorRoutes] receipts query failed:', err)
    return res.status(500).json({ error: 'Failed to fetch receipts' })
  }
})

// ─── GET /v1/agents/:passportId/epoch ─────────────────────────────────────
// Returns the current open epoch for the agent (in-memory + DB).
router.get('/v1/agents/:passportId/epoch', verifyAdminAuth, async (req: Request, res: Response) => {
  const { passportId } = req.params

  // In-memory active epoch (fast path)
  const activeEpoch = getCurrentEpoch(passportId)

  // Also check DB for the most recent epoch (covers server restarts)
  let dbEpoch: Record<string, unknown> | null = null
  try {
    const result = await pool.query(
      `SELECT epoch_id, epoch_index, status, mmr_root, leaf_count,
              chain_tx, error, created_at, finalized_at
       FROM epochs
       WHERE agent_passport_id = $1
       ORDER BY epoch_index DESC
       LIMIT 1`,
      [passportId]
    )
    dbEpoch = result.rows[0] || null
  } catch (err) {
    logger.error('[agentMirrorRoutes] epoch query failed:', err)
  }

  return res.json({
    active: {
      epoch_id: activeEpoch.epoch_id,
      status: activeEpoch.status,
      leaf_count: activeEpoch.leaf_count,
      mmr_root: activeEpoch.mmr_root,
      created_at: activeEpoch.created_at,
    },
    latest_db: dbEpoch,
  })
})

// ─── GET /v1/agents/:passportId/proof ─────────────────────────────────────
// Returns the latest MMR proof for the agent — includes chain_tx if anchored.
router.get('/v1/agents/:passportId/proof', verifyAdminAuth, async (req: Request, res: Response) => {
  const { passportId } = req.params

  try {
    // Fetch the most recent anchored epoch for this agent
    const epochResult = await pool.query(
      `SELECT epoch_id, epoch_index, status, mmr_root, leaf_count,
              chain_tx, created_at, finalized_at, start_leaf_index, end_leaf_index
       FROM epochs
       WHERE agent_passport_id = $1 AND status = 'anchored'
       ORDER BY epoch_index DESC
       LIMIT 1`,
      [passportId]
    )

    if (!epochResult.rows[0]) {
      return res.status(404).json({
        error: 'No anchored epoch found for this agent',
        hint: 'The agent may not have any completed epochs yet. Check /v1/agents/:id/epoch for the current open epoch.',
      })
    }

    const epoch = epochResult.rows[0]

    // Fetch receipt count in this epoch
    const receiptCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM receipts WHERE agent_passport_id = $1`,
      [passportId]
    )
    const totalReceipts = receiptCountResult.rows[0]?.count ?? 0

    return res.json({
      passport_id: passportId,
      epoch_id: epoch.epoch_id,
      epoch_index: epoch.epoch_index,
      mmr_root: epoch.mmr_root,
      leaf_count: epoch.leaf_count,
      chain_tx: epoch.chain_tx ?? null,
      verified: !!epoch.chain_tx,
      finalized_at: epoch.finalized_at,
      total_receipts: totalReceipts,
    })
  } catch (err) {
    logger.error('[agentMirrorRoutes] proof query failed:', err)
    return res.status(500).json({ error: 'Failed to fetch proof' })
  }
})

// ─── GET /v1/agents/:passportId/proof/:runId ──────────────────────────────
// Returns proof details for a specific run_id (leaf-level proof).
router.get('/v1/agents/:passportId/proof/:runId', verifyAdminAuth, async (req: Request, res: Response) => {
  const { passportId, runId } = req.params

  try {
    const result = await pool.query(
      `SELECT r.receipt_hash, r.run_id, r.model_passport_id, r.policy_hash,
              r.tokens_in, r.tokens_out, r.status, r.created_at,
              e.epoch_id, e.mmr_root, e.chain_tx, e.status AS epoch_status
       FROM receipts r
       LEFT JOIN epoch_receipts er ON er.receipt_hash = r.receipt_hash
       LEFT JOIN epochs e ON e.epoch_id = er.epoch_id
       WHERE r.agent_passport_id = $1 AND r.run_id = $2
       LIMIT 1`,
      [passportId, runId]
    )

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Receipt not found for this agent and run_id' })
    }

    const row = result.rows[0]
    return res.json({
      passport_id: passportId,
      run_id: row.run_id,
      receipt_hash: row.receipt_hash,
      epoch_id: row.epoch_id ?? null,
      mmr_root: row.mmr_root ?? null,
      chain_tx: row.chain_tx ?? null,
      verified: !!row.chain_tx,
      epoch_status: row.epoch_status ?? null,
      model_passport_id: row.model_passport_id,
      policy_hash: row.policy_hash,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      status: row.status,
      created_at: row.created_at,
    })
  } catch (err) {
    logger.error('[agentMirrorRoutes] proof/runId query failed:', err)
    return res.status(500).json({ error: 'Failed to fetch proof for run' })
  }
})

export const agentMirrorRouter = router
