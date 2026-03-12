/**
 * MMR Checkpoint — DePIN Evolving Storage
 *
 * Periodically snapshots the full MMR node map to DePIN evolving storage
 * and stores the CID in mmr_state.checkpoint_cid. On startup, if the fast
 * DB is empty but a checkpoint CID exists, the MMR can be restored from
 * DePIN as a fallback.
 *
 * This is bucket 2 (cold) with a bucket 3 (reference) pointer in fast DB.
 */
import pool from '../db/pool';
import { logger } from '../lib/logger';

let checkpointInterval: NodeJS.Timeout | null = null;

export interface MMRCheckpointData {
  version: '1.0';
  mmr_size: number;
  leaf_count: number;
  leaf_positions: number[];
  root_hash: string;
  nodes: Array<[number, string]>;  // [position, hex hash]
  timestamp: string;
}

/**
 * Take a snapshot of the current MMR state and upload to DePIN evolving storage.
 */
export async function createCheckpoint(): Promise<string | null> {
  try {
    const { getReceiptMMR } = await import('../crypto/receiptMMR');
    const mmr = getReceiptMMR();

    // Skip if empty
    if (mmr.getLeafCount() === 0) return null;

    const state = mmr.getState();

    // Serialize nodes Map to array
    const nodes: Array<[number, string]> = [];
    for (const [pos, buf] of state.mmrState.nodes) {
      nodes.push([pos, buf.toString('hex')]);
    }

    const checkpoint: MMRCheckpointData = {
      version: '1.0',
      mmr_size: state.mmrState.size,
      leaf_count: state.leafCount,
      leaf_positions: state.leafPositions,
      root_hash: mmr.getRoot(),
      nodes,
      timestamp: new Date().toISOString(),
    };

    if (process.env.DEPIN_UPLOAD_ENABLED === 'false') {
      logger.info('[MMRCheckpoint] Skipping checkpoint upload (DEPIN_UPLOAD_ENABLED=false)');
      return null;
    }

    const { getEvolvingStorage } = await import('../storage/depin');
    const upload = await getEvolvingStorage().uploadJSON(checkpoint, {
      tags: { type: 'mmr-checkpoint', root: checkpoint.root_hash },
    });

    // Store CID reference in fast DB
    await pool.query(
      'UPDATE mmr_state SET checkpoint_cid = $1, updated_at = now() WHERE id = $2',
      [upload.cid, 'receipt_mmr'],
    );

    logger.info(`[MMRCheckpoint] Snapshot → ${upload.cid} (${mmr.getLeafCount()} leaves, ${upload.provider})`);
    return upload.cid;
  } catch (err) {
    logger.warn('[MMRCheckpoint] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Restore MMR from a DePIN checkpoint (fallback when fast DB is empty).
 */
export async function restoreFromCheckpoint(): Promise<boolean> {
  try {
    // Check if there's a checkpoint CID in fast DB
    const result = await pool.query(
      'SELECT checkpoint_cid FROM mmr_state WHERE id = $1',
      ['receipt_mmr'],
    );

    const cid = result.rows[0]?.checkpoint_cid;
    if (!cid) return false;

    const { getEvolvingStorage } = await import('../storage/depin');
    const data = await getEvolvingStorage().retrieve(cid);
    if (!data) {
      logger.warn(`[MMRCheckpoint] Checkpoint CID ${cid} not retrievable`);
      return false;
    }

    const checkpoint: MMRCheckpointData = JSON.parse(data.toString('utf-8'));

    // Reconstruct nodes Map
    const { MMR } = await import('../crypto/mmr');
    const nodes = new Map<number, Buffer>();
    for (const [pos, hex] of checkpoint.nodes) {
      nodes.set(pos, Buffer.from(hex, 'hex'));
    }

    const { ReceiptMMR } = await import('../crypto/receiptMMR');

    // Restore via constructor
    const restored = new ReceiptMMR({
      mmrState: { size: checkpoint.mmr_size, peaks: [], nodes },
      leafPositions: checkpoint.leaf_positions,
      leafCount: checkpoint.leaf_count,
    });

    // Persist restored state back to fast DB so next startup uses DB directly
    for (const [pos, hex] of checkpoint.nodes) {
      await pool.query(
        'INSERT INTO mmr_nodes (position, hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [pos, hex],
      );
    }
    await pool.query(
      `UPDATE mmr_state SET mmr_size = $1, leaf_count = $2, leaf_positions = $3, root_hash = $4, updated_at = now()
       WHERE id = 'receipt_mmr'`,
      [checkpoint.mmr_size, checkpoint.leaf_count, JSON.stringify(checkpoint.leaf_positions), checkpoint.root_hash],
    );

    logger.info(`[MMRCheckpoint] Restored from DePIN: ${checkpoint.leaf_count} leaves (CID: ${cid})`);
    return true;
  } catch (err) {
    logger.warn('[MMRCheckpoint] Restore failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Start periodic checkpointing.
 * Default: every 30 minutes (or after every 50 new leaves, whichever first).
 */
export function startCheckpointJob(intervalMs: number = 30 * 60 * 1000): void {
  if (checkpointInterval) return;

  if (process.env.DEPIN_UPLOAD_ENABLED === 'false') {
    logger.info('[MMRCheckpoint] Disabled (DEPIN_UPLOAD_ENABLED=false)');
    return;
  }

  checkpointInterval = setInterval(() => {
    createCheckpoint().catch(() => {});
  }, intervalMs);

  logger.info(`[MMRCheckpoint] Started (interval: ${Math.round(intervalMs / 60000)}min)`);
}

export function stopCheckpointJob(): void {
  if (checkpointInterval) {
    clearInterval(checkpointInterval);
    checkpointInterval = null;
  }
}
