/**
 * Epoch Anchored Outbox
 *
 * Writes epoch_anchored_events for platform-core consumption.
 * After an agent's epoch is committed to Solana/EVM, this outbox
 * enables reverse signaling: L2 → platform-core.
 *
 * Platform-core's consumer polls this table to:
 * - Update agent status after anchoring
 * - Trigger webhooks for epoch finalization
 * - Sync proof availability with MCPGate
 */

export interface EpochAnchoredEvent {
  epoch_id: string;
  agent_passport_id: string;
  mmr_root: string;
  chain_tx: string;
}

/**
 * Write an epoch_anchored_event to the outbox table.
 * Uses the shared DB pool from the engine.
 */
export async function writeEpochAnchoredEvent(event: EpochAnchoredEvent): Promise<void> {
  try {
    const { pool } = await import('../db/pool');

    await pool.query(
      `INSERT INTO epoch_anchored_events (epoch_id, agent_passport_id, mmr_root, chain_tx, anchored_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (epoch_id) DO NOTHING`,
      [event.epoch_id, event.agent_passport_id, event.mmr_root, event.chain_tx],
    );
  } catch (err) {
    // Best-effort: outbox write failure should not block anchoring
    console.warn(`[EpochOutbox] Failed to write event for ${event.epoch_id}:`, err);
  }
}
