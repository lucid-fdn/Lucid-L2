/**
 * Epoch Archiver — Tiered Storage (Phase 3)
 *
 * After an epoch is anchored on-chain, its data is finalized and immutable.
 * This module archives the full proof bundle to DePIN permanent storage,
 * stores the CID reference in the fast DB, and cleans up hot-path data
 * that is no longer needed for pipeline continuation.
 *
 * Mental model: "Fast DB is for continuation, not for history."
 *
 * Hot (fast DB):   current MMR state, open epochs, checkpoint pointers
 * Cold (DePIN):    finalized epoch bundles, inclusion proofs, receipt bodies
 * Reference only:  archive CID in epochs table pointing to cold storage
 */
import pool from '../db/pool';
import { logger } from '../lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────

export interface EpochArchiveBundle {
  version: '1.0';
  epoch_id: string;
  epoch_index: number;
  mmr_root: string;
  chain_txs: Record<string, string>;
  leaf_count: number;
  start_leaf_index: number;
  end_leaf_index: number;
  anchored_at: string;          // ISO timestamp
  receipt_hashes: string[];     // All receipt hashes in this epoch
  mmr_peaks: string[];          // MMR peak hashes at finalization
  mmr_size: number;             // MMR size at finalization
}

export interface ArchiveResult {
  epoch_id: string;
  archive_cid: string;
  archive_url: string;
  provider: string;
  cleaned_receipts: number;
}

// ─── Archive a single finalized epoch ─────────────────────────────────────

/**
 * Archive a finalized epoch to DePIN permanent storage.
 * 1. Build full proof bundle (receipt hashes, MMR state, chain txs)
 * 2. Upload to permanent storage
 * 3. Store CID reference in epochs table
 * 4. Clean up epoch_receipts join rows (the bundle has them now)
 */
export async function archiveEpoch(epoch_id: string): Promise<ArchiveResult | null> {
  try {
    // Load epoch from DB
    const epochResult = await pool.query(
      `SELECT epoch_id, epoch_index, mmr_root, leaf_count, start_leaf_index, end_leaf_index,
              chain_tx, finalized_at, archive_cid, agent_passport_id
       FROM epochs WHERE epoch_id = $1 AND status = 'anchored'`,
      [epoch_id],
    );

    if (epochResult.rows.length === 0) {
      logger.warn(`[EpochArchiver] Epoch ${epoch_id} not found or not anchored`);
      return null;
    }

    const row = epochResult.rows[0];

    // Skip if already archived
    if (row.archive_cid) {
      logger.info(`[EpochArchiver] Epoch ${epoch_id} already archived (CID: ${row.archive_cid})`);
      return null;
    }

    // Load receipt hashes for this epoch
    const receiptsResult = await pool.query(
      `SELECT receipt_hash FROM epoch_receipts WHERE epoch_id = $1 ORDER BY added_at`,
      [epoch_id],
    );
    const receiptHashes = receiptsResult.rows.map((r: { receipt_hash: string }) => r.receipt_hash);

    // Load MMR peaks at finalization time
    const mmrStateResult = await pool.query(
      'SELECT mmr_size, leaf_count, root_hash FROM mmr_state WHERE id = $1',
      ['receipt_mmr'],
    );
    const mmrState = mmrStateResult.rows[0];

    // Load peak node hashes (the peaks depend on the MMR state; we store what we have)
    // For a finalized epoch, the peaks at finalization aren't separately stored,
    // so we include the current peaks (they're append-only, so still valid for this epoch).
    let mmrPeaks: string[] = [];
    if (mmrState) {
      // Peaks are derived from the MMR structure, not directly from DB.
      // The root_hash is the bagged-peaks result, which is sufficient for verification.
      mmrPeaks = [mmrState.root_hash];
    }

    const chainTx: Record<string, string> = row.chain_tx
      ? (typeof row.chain_tx === 'string' ? JSON.parse(row.chain_tx) : row.chain_tx)
      : {};

    // Build archive bundle
    const bundle: EpochArchiveBundle = {
      version: '1.0',
      epoch_id: row.epoch_id,
      epoch_index: row.epoch_index,
      mmr_root: row.mmr_root,
      chain_txs: chainTx,
      leaf_count: row.leaf_count,
      start_leaf_index: row.start_leaf_index,
      end_leaf_index: row.end_leaf_index ?? row.start_leaf_index + row.leaf_count - 1,
      anchored_at: row.finalized_at ? new Date(row.finalized_at).toISOString() : new Date().toISOString(),
      receipt_hashes: receiptHashes,
      mmr_peaks: mmrPeaks,
      mmr_size: mmrState?.mmr_size ?? 0,
    };

    // Upload to permanent storage via AnchorDispatcher (handles kill switch)
    const { getAnchorDispatcher } = await import('../anchoring');
    const result = await getAnchorDispatcher().dispatch({
      artifact_type: 'epoch_bundle',
      artifact_id: epoch_id,
      agent_passport_id: row.agent_passport_id || null,
      producer: 'epochArchiver',
      storage_tier: 'permanent',
      payload: bundle,
      tags: { type: 'epoch-archive', epoch: epoch_id, version: '1.0' },
      chain_tx: chainTx,
      metadata: { epoch_index: row.epoch_index, leaf_count: row.leaf_count },
    });

    if (!result) {
      logger.info(`[EpochArchiver] Skipping upload for epoch ${epoch_id} (DePIN disabled)`);
      return null;
    }

    // Store CID reference in fast DB (bucket 3)
    await pool.query(
      'UPDATE epochs SET archive_cid = $1 WHERE epoch_id = $2',
      [result.cid, epoch_id],
    );

    // Clean up hot data: remove epoch_receipts join rows (the bundle has them now)
    const cleanResult = await pool.query(
      'DELETE FROM epoch_receipts WHERE epoch_id = $1',
      [epoch_id],
    );
    const cleaned = cleanResult.rowCount ?? 0;

    logger.info(
      `[EpochArchiver] Archived epoch ${epoch_id} → ${result.cid} (${result.provider}), cleaned ${cleaned} join rows`,
    );

    return {
      epoch_id,
      archive_cid: result.cid,
      archive_url: result.url,
      provider: result.provider,
      cleaned_receipts: cleaned,
    };
  } catch (err) {
    logger.warn(`[EpochArchiver] Failed to archive epoch ${epoch_id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Batch archive all unarchived anchored epochs ─────────────────────────

/**
 * Find and archive all anchored epochs that haven't been archived yet.
 * Intended to be called periodically (e.g., every hour) or after anchoring.
 */
export async function archiveStaleEpochs(): Promise<ArchiveResult[]> {
  try {
    const result = await pool.query(
      `SELECT epoch_id FROM epochs
       WHERE status = 'anchored' AND archive_cid IS NULL
       ORDER BY epoch_index ASC
       LIMIT 50`,
    );

    const results: ArchiveResult[] = [];
    for (const row of result.rows) {
      const archived = await archiveEpoch(row.epoch_id);
      if (archived) results.push(archived);
    }

    if (results.length > 0) {
      logger.info(`[EpochArchiver] Batch: archived ${results.length} epoch(s)`);
    }
    return results;
  } catch (err) {
    logger.warn('[EpochArchiver] Batch archive failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Retrieve an archived epoch bundle from DePIN ─────────────────────────

/**
 * Retrieve a previously archived epoch bundle from DePIN storage.
 * Used when a user requests proof materials for a finalized epoch.
 */
export async function retrieveEpochArchive(epoch_id: string): Promise<EpochArchiveBundle | null> {
  try {
    const result = await pool.query(
      'SELECT archive_cid FROM epochs WHERE epoch_id = $1',
      [epoch_id],
    );

    if (result.rows.length === 0 || !result.rows[0].archive_cid) {
      return null;
    }

    const cid = result.rows[0].archive_cid;
    const { getPermanentStorage } = await import('../storage/depin');
    const data = await getPermanentStorage().retrieve(cid);
    if (!data) return null;

    return JSON.parse(data.toString('utf-8')) as EpochArchiveBundle;
  } catch (err) {
    logger.warn(`[EpochArchiver] Failed to retrieve archive for ${epoch_id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
