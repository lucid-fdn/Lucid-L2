/**
 * Epoch Service - Manages epoch lifecycle for receipt anchoring.
 * 
 * An epoch is a batch of receipts that get anchored together to the chain.
 * This reduces on-chain costs by committing a single MMR root for multiple receipts.
 * 
 * Epoch finalization triggers:
 * - Receipt count > 100
 * - Time since epoch start > 1 hour
 * - Manual trigger via API
 */
import { v4 as uuid } from 'uuid';
import { getMmrRoot, getMmrLeafCount, listInferenceReceipts, InferenceReceipt } from './receiptService';
import pool from '../db/pool';
import { logger } from '../lib/logger';

// =============================================================================
// TYPES
// =============================================================================

export type EpochStatus = 'open' | 'anchoring' | 'anchored' | 'failed';

export interface Epoch {
  epoch_id: string;
  epoch_index: number;
  project_id?: string;
  /** Agent passport ID — set when epoch belongs to a specific agent (BYOR Phase 1) */
  agent_passport_id?: string;
  mmr_root: string;
  leaf_count: number;
  created_at: number;         // Unix timestamp (seconds)
  finalized_at?: number;      // When the epoch was finalized
  status: EpochStatus;
  chain_tx?: Record<string, string>;  // Per-chain transaction signatures (chainId → txHash)
  error?: string;             // Error message if failed
  start_leaf_index: number;   // First leaf index in this epoch
  end_leaf_index?: number;    // Last leaf index in this epoch (set on finalization)
  receipt_run_ids: string[];  // Run IDs of receipts in this epoch
  retry_count: number;        // Number of times this epoch has been retried after failure
}

export interface EpochSummary {
  epoch_id: string;
  project_id?: string;
  status: EpochStatus;
  leaf_count: number;
  created_at: number;
  finalized_at?: number;
  chain_tx?: Record<string, string>;
}

export interface EpochFilters {
  project_id?: string;
  status?: EpochStatus;
  page?: number;
  per_page?: number;
}

export interface PaginatedEpochs {
  epochs: EpochSummary[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// Configuration
export interface EpochConfig {
  max_receipts_per_epoch: number;  // Default: 100
  max_epoch_duration_ms: number;   // Default: 1 hour (3600000 ms)
}

const DEFAULT_CONFIG: EpochConfig = {
  max_receipts_per_epoch: parseInt(process.env.MAX_RECEIPTS_PER_EPOCH || '100', 10),
  max_epoch_duration_ms: parseInt(process.env.MAX_EPOCH_DURATION_MS || '3600000', 10),
};

// =============================================================================
// IN-MEMORY STORAGE (MVP)
// =============================================================================

// Active epoch per project (or global if no project)
const activeEpochs = new Map<string, Epoch>(); // key: project_id or '__global__'

// All epochs (historical + active)
const epochStore = new Map<string, Epoch>(); // key: epoch_id

// Configuration
let config: EpochConfig = { ...DEFAULT_CONFIG };

// Track which receipts belong to which epoch
const receiptToEpoch = new Map<string, string>(); // key: run_id, value: epoch_id

// Monotonic epoch index (in-memory)
let epochIndexCounter = 0;

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Update epoch configuration.
 */
export function setEpochConfig(newConfig: Partial<EpochConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current epoch configuration.
 */
export function getEpochConfig(): EpochConfig {
  return { ...config };
}

// =============================================================================
// DATABASE PERSISTENCE (write-through, non-blocking)
// =============================================================================

async function persistEpochToDb(epoch: Epoch): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO epochs (epoch_id, epoch_index, project_id, agent_passport_id, status, mmr_root, leaf_count, start_leaf_index, end_leaf_index, chain_tx, error, finalized_at, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (epoch_id) DO UPDATE SET
         status = EXCLUDED.status,
         mmr_root = EXCLUDED.mmr_root,
         leaf_count = EXCLUDED.leaf_count,
         end_leaf_index = EXCLUDED.end_leaf_index,
         chain_tx = EXCLUDED.chain_tx,
         error = EXCLUDED.error,
         finalized_at = EXCLUDED.finalized_at,
         retry_count = EXCLUDED.retry_count`,
      [
        epoch.epoch_id,
        epoch.epoch_index,
        epoch.project_id || null,
        epoch.agent_passport_id || null,
        epoch.status,
        epoch.mmr_root,
        epoch.leaf_count,
        epoch.start_leaf_index,
        epoch.end_leaf_index || null,
        epoch.chain_tx ? JSON.stringify(epoch.chain_tx) : null,
        epoch.error || null,
        epoch.finalized_at ? new Date(epoch.finalized_at * 1000) : null,
        epoch.retry_count || 0,
      ]
    );
  } catch (err) {
    logger.warn('[EpochService] DB persist failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

async function persistEpochReceiptToDb(epoch_id: string, receipt_hash: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO epoch_receipts (epoch_id, receipt_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [epoch_id, receipt_hash]
    );
  } catch (err) {
    logger.warn('[EpochService] DB epoch_receipt persist failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

export async function loadEpochsFromDb(): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT epoch_id, epoch_index, project_id, status, mmr_root, leaf_count,
              start_leaf_index, end_leaf_index, chain_tx, error,
              EXTRACT(EPOCH FROM created_at)::integer as created_at_unix,
              EXTRACT(EPOCH FROM finalized_at)::integer as finalized_at_unix,
              COALESCE(retry_count, 0) as retry_count
       FROM epochs WHERE status IN ('open', 'anchoring', 'failed')
       ORDER BY epoch_index ASC`
    );

    let loaded = 0;
    for (const row of result.rows) {
      // Load receipt run_ids for this epoch
      const receiptsResult = await pool.query(
        `SELECT r.run_id FROM epoch_receipts er JOIN receipts r ON er.receipt_hash = r.receipt_hash WHERE er.epoch_id = $1`,
        [row.epoch_id]
      );

      const epoch: Epoch = {
        epoch_id: row.epoch_id,
        epoch_index: row.epoch_index,
        project_id: row.project_id || undefined,
        status: row.status,
        mmr_root: row.mmr_root,
        leaf_count: row.leaf_count,
        created_at: row.created_at_unix,
        finalized_at: row.finalized_at_unix || undefined,
        start_leaf_index: row.start_leaf_index,
        end_leaf_index: row.end_leaf_index || undefined,
        chain_tx: row.chain_tx ? (typeof row.chain_tx === 'string' ? JSON.parse(row.chain_tx) : row.chain_tx) : undefined,
        error: row.error || undefined,
        receipt_run_ids: receiptsResult.rows.map((r: any) => r.run_id),
        retry_count: parseInt(row.retry_count, 10) || 0,
      };

      epochStore.set(epoch.epoch_id, epoch);
      if (epoch.status === 'open') {
        const activeKey = getActiveKey(epoch.project_id);
        activeEpochs.set(activeKey, epoch);
      }
      if (epoch.epoch_index > epochIndexCounter) {
        epochIndexCounter = epoch.epoch_index;
      }
      loaded++;
    }
    return loaded;
  } catch (err) {
    logger.warn('[EpochService] DB load failed (continuing with in-memory):', err instanceof Error ? err.message : err);
    return 0;
  }
}

// =============================================================================
// EPOCH LIFECYCLE
// =============================================================================

/**
 * Get the storage key for active epoch.
 */
function getActiveKey(project_id?: string): string {
  return project_id || '__global__';
}

/**
 * Create a new epoch.
 */
export function createEpoch(project_id?: string): Epoch {
  const epoch_id = `epoch_${uuid().replace(/-/g, '')}`;
  const now = Math.floor(Date.now() / 1000);
  const epoch_index = ++epochIndexCounter;
  
  // Get current state for starting point
  const currentRoot = getMmrRoot();
  const currentLeafCount = getMmrLeafCount();

  // When project_id looks like an agent passport ID (starts with 'agnt_'),
  // also populate agent_passport_id for indexed DB queries.
  const agent_passport_id = project_id?.startsWith('agnt_') ? project_id : undefined;

  const epoch: Epoch = {
    epoch_id,
    epoch_index,
    project_id,
    agent_passport_id,
    mmr_root: currentRoot,
    leaf_count: 0,
    created_at: now,
    status: 'open',
    start_leaf_index: currentLeafCount,
    receipt_run_ids: [],
    retry_count: 0,
  };

  // Store epoch
  epochStore.set(epoch_id, epoch);
  
  // Set as active epoch
  const activeKey = getActiveKey(project_id);
  activeEpochs.set(activeKey, epoch);

  // Persist to DB (non-blocking)
  persistEpochToDb(epoch).catch(() => {});

  return epoch;
}

/**
 * Get the current active epoch, creating one if needed.
 */
export function getCurrentEpoch(project_id?: string): Epoch {
  const activeKey = getActiveKey(project_id);
  let epoch = activeEpochs.get(activeKey);
  
  // Create new epoch if none exists
  if (!epoch) {
    epoch = createEpoch(project_id);
  }
  
  return epoch;
}

/**
 * Get an epoch by ID.
 */
export function getEpoch(epoch_id: string): Epoch | null {
  return epochStore.get(epoch_id) || null;
}

/**
 * List epochs with optional filtering.
 */
export function listEpochs(filters: EpochFilters = {}): PaginatedEpochs {
  const {
    project_id,
    status,
    page = 1,
    per_page = 20,
  } = filters;

  // Get all epochs
  let epochs = Array.from(epochStore.values());

  // Apply filters
  if (project_id !== undefined) {
    epochs = epochs.filter(e => e.project_id === project_id);
  }
  if (status !== undefined) {
    epochs = epochs.filter(e => e.status === status);
  }

  // Sort by created_at descending (newest first)
  epochs.sort((a, b) => b.created_at - a.created_at);

  // Paginate
  const total = epochs.length;
  const total_pages = Math.ceil(total / per_page);
  const startIndex = (page - 1) * per_page;
  const pageEpochs = epochs.slice(startIndex, startIndex + per_page);

  // Map to summary
  const summaries: EpochSummary[] = pageEpochs.map(e => ({
    epoch_id: e.epoch_id,
    project_id: e.project_id,
    status: e.status,
    leaf_count: e.leaf_count,
    created_at: e.created_at,
    finalized_at: e.finalized_at,
    chain_tx: e.chain_tx,
  }));

  return {
    epochs: summaries,
    total,
    page,
    per_page,
    total_pages,
  };
}

/**
 * Add a receipt to the current epoch.
 * Called after receipt creation.
 */
export function addReceiptToEpoch(run_id: string, project_id?: string): void {
  const epoch = getCurrentEpoch(project_id);
  
  // Don't add to non-open epochs
  if (epoch.status !== 'open') {
    // Create new epoch
    const newEpoch = createEpoch(project_id);
    newEpoch.receipt_run_ids.push(run_id);
    newEpoch.leaf_count++;
    receiptToEpoch.set(run_id, newEpoch.epoch_id);
    return;
  }

  epoch.receipt_run_ids.push(run_id);
  epoch.leaf_count++;
  receiptToEpoch.set(run_id, epoch.epoch_id);

  // Update MMR root snapshot
  epoch.mmr_root = getMmrRoot();

  // Persist to DB (non-blocking)
  persistEpochToDb(epoch).catch(() => {});
}

/**
 * Get the epoch ID for a specific receipt.
 */
export function getEpochForReceipt(run_id: string): string | null {
  return receiptToEpoch.get(run_id) || null;
}

/**
 * Check if an epoch should be finalized based on configuration.
 */
export function shouldFinalizeEpoch(epoch: Epoch): { should: boolean; reason?: string } {
  // Only finalize open epochs
  if (epoch.status !== 'open') {
    return { should: false };
  }

  // Check receipt count
  if (epoch.leaf_count >= config.max_receipts_per_epoch) {
    return { should: true, reason: 'max_receipts_reached' };
  }

  // Check time elapsed
  const now = Date.now();
  const epochStartMs = epoch.created_at * 1000;
  const elapsed = now - epochStartMs;
  
  if (elapsed >= config.max_epoch_duration_ms) {
    return { should: true, reason: 'max_duration_reached' };
  }

  return { should: false };
}

/**
 * Prepare an epoch for finalization (marks as 'anchoring').
 * Returns the epoch data needed for anchoring.
 *
 * Uses a PostgreSQL advisory lock to prevent multi-instance races.
 * If the DB lock cannot be acquired (e.g. DB down), falls back to
 * the in-memory status check which is safe for single-instance.
 */
export async function prepareEpochForFinalization(epoch_id: string): Promise<Epoch | null> {
  const epoch = epochStore.get(epoch_id);
  if (!epoch) {
    return null;
  }

  // Can only prepare open epochs
  if (epoch.status !== 'open') {
    return null;
  }

  // Acquire a distributed advisory lock keyed on a hash of the epoch_id.
  // This prevents two instances from finalizing the same epoch concurrently.
  const lockKey = epochIdToLockKey(epoch_id);
  let client: import('pg').PoolClient | null = null;
  try {
    client = await pool.connect();
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
    if (!lockResult.rows[0]?.acquired) {
      // Another instance is already finalizing this epoch
      logger.warn(`[EpochService] Advisory lock not acquired for epoch ${epoch_id} — another instance is finalizing`);
      return null;
    }
  } catch (err) {
    // DB unavailable — fall through to in-memory-only path (safe for single-instance)
    logger.warn('[EpochService] Advisory lock unavailable, proceeding with in-memory guard:', err instanceof Error ? err.message : err);
  }

  try {
    // Update status
    epoch.status = 'anchoring';
    epoch.finalized_at = Math.floor(Date.now() / 1000);

    // Capture final state
    epoch.mmr_root = getMmrRoot();
    epoch.end_leaf_index = getMmrLeafCount() - 1;

    // Remove from active epochs (so a new one can be created)
    const activeKey = getActiveKey(epoch.project_id);
    if (activeEpochs.get(activeKey)?.epoch_id === epoch_id) {
      activeEpochs.delete(activeKey);
    }

    // Persist to DB (blocking — must succeed before we anchor on-chain)
    await persistEpochToDb(epoch);

    return epoch;
  } finally {
    // Release advisory lock
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } catch { /* best-effort */ }
      client.release();
    }
  }
}

/**
 * Convert epoch_id string to a 32-bit integer for pg_advisory_lock.
 */
function epochIdToLockKey(epoch_id: string): number {
  let hash = 0;
  for (let i = 0; i < epoch_id.length; i++) {
    hash = ((hash << 5) - hash + epoch_id.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Finalize an epoch - Mark as anchored with transaction signature(s).
 * Accepts either a Record<string, string> (multi-chain) or a plain string (legacy Solana-only).
 * A plain string is auto-wrapped as { 'solana-devnet': tx }.
 */
export function finalizeEpoch(
  epoch_id: string,
  chain_tx: Record<string, string> | string,
  final_root: string
): Epoch | null {
  const epoch = epochStore.get(epoch_id);
  if (!epoch) {
    return null;
  }

  // Can only finalize epochs that are anchoring
  if (epoch.status !== 'anchoring') {
    return null;
  }

  // Normalize string → Record for backward compatibility
  const txRecord: Record<string, string> = typeof chain_tx === 'string'
    ? { 'solana-devnet': chain_tx }
    : chain_tx;

  // Update epoch
  epoch.status = 'anchored';
  epoch.chain_tx = txRecord;
  epoch.mmr_root = final_root;

  // Persist to DB (non-blocking)
  persistEpochToDb(epoch).catch(() => {});

  return epoch;
}

/**
 * Mark an epoch as failed.
 */
export function failEpoch(epoch_id: string, error: string): Epoch | null {
  const epoch = epochStore.get(epoch_id);
  if (!epoch) {
    return null;
  }

  // Can only fail epochs that are anchoring
  if (epoch.status !== 'anchoring') {
    return null;
  }

  epoch.status = 'failed';
  epoch.error = error;

  // Persist to DB (non-blocking)
  persistEpochToDb(epoch).catch(() => {});

  return epoch;
}

/**
 * Retry a failed epoch - Reset to open status.
 */
export function retryEpoch(epoch_id: string): Epoch | null {
  const epoch = epochStore.get(epoch_id);
  if (!epoch) {
    return null;
  }

  // Can only retry failed epochs
  if (epoch.status !== 'failed') {
    return null;
  }

  // Reset to open
  epoch.status = 'open';
  epoch.retry_count = (epoch.retry_count || 0) + 1;
  delete epoch.error;
  delete epoch.finalized_at;

  // Set as active again
  const activeKey = getActiveKey(epoch.project_id);
  if (!activeEpochs.has(activeKey)) {
    activeEpochs.set(activeKey, epoch);
  }

  // Persist to DB (non-blocking)
  persistEpochToDb(epoch).catch(() => {});

  return epoch;
}

/**
 * Get all open epochs that should be finalized.
 */
export function getEpochsReadyForFinalization(): Epoch[] {
  const ready: Epoch[] = [];
  
  for (const epoch of activeEpochs.values()) {
    const check = shouldFinalizeEpoch(epoch);
    if (check.should) {
      ready.push(epoch);
    }
  }

  return ready;
}

/**
 * Get all epochs with 'failed' status.
 * Used by the anchoring job to retry failed epochs.
 */
export function getFailedEpochs(): Epoch[] {
  return Array.from(epochStore.values()).filter(e => e.status === 'failed');
}

/**
 * Get statistics about epochs.
 */
export function getEpochStats(): {
  total_epochs: number;
  open_epochs: number;
  anchoring_epochs: number;
  anchored_epochs: number;
  failed_epochs: number;
  total_receipts_anchored: number;
} {
  const epochs = Array.from(epochStore.values());
  
  return {
    total_epochs: epochs.length,
    open_epochs: epochs.filter(e => e.status === 'open').length,
    anchoring_epochs: epochs.filter(e => e.status === 'anchoring').length,
    anchored_epochs: epochs.filter(e => e.status === 'anchored').length,
    failed_epochs: epochs.filter(e => e.status === 'failed').length,
    total_receipts_anchored: epochs
      .filter(e => e.status === 'anchored')
      .reduce((sum, e) => sum + e.leaf_count, 0),
  };
}

// =============================================================================
// AUTO-FINALIZATION SCHEDULER
// =============================================================================

/** Interval handle for the finalization scheduler */
let finalizationInterval: NodeJS.Timeout | null = null;

/** Callback type for anchoring */
type AnchorCallback = (epoch_id: string) => Promise<{ success: boolean; error?: string }>;

/** Optional anchor callback - set by anchoringService when integrated */
let anchorCallback: AnchorCallback | null = null;

/**
 * Set the anchor callback for auto-finalization.
 * This should be called by anchoringService to integrate with epochService.
 */
export function setAnchorCallback(callback: AnchorCallback): void {
  anchorCallback = callback;
}

/**
 * Start the auto-finalization scheduler.
 * 
 * This runs periodically and checks if any epochs should be finalized.
 * When an epoch is ready, it calls the anchor callback to commit to chain.
 * 
 * @param intervalMs - Check interval in milliseconds (default: 60000 = 1 minute)
 */
export function startAutoFinalization(intervalMs: number = 60000): void {
  if (finalizationInterval) {
    logger.warn('[EpochService] Auto-finalization already running');
    return;
  }

  logger.info(`[EpochService] Starting auto-finalization scheduler (interval: ${intervalMs}ms)`);

  finalizationInterval = setInterval(async () => {
    const readyEpochs = getEpochsReadyForFinalization();
    
    if (readyEpochs.length === 0) return;

    logger.info(`[EpochService] Found ${readyEpochs.length} epoch(s) ready for finalization`);

    for (const epoch of readyEpochs) {
      const reason = shouldFinalizeEpoch(epoch);
      logger.info(`[EpochService] Finalizing epoch ${epoch.epoch_id} (reason: ${reason.reason})`);

      if (anchorCallback) {
        try {
          const result = await anchorCallback(epoch.epoch_id);
          if (result.success) {
            logger.info(`[EpochService] Epoch ${epoch.epoch_id} anchored successfully`);
          } else {
            logger.error(`[EpochService] Failed to anchor epoch ${epoch.epoch_id}: ${result.error}`);
          }
        } catch (error) {
          logger.error(`[EpochService] Error anchoring epoch ${epoch.epoch_id}:`, error);
        }
      } else {
        // No anchor callback - just prepare epoch (mock mode)
        const prepared = await prepareEpochForFinalization(epoch.epoch_id);
        logger.info(`[EpochService] Epoch ${epoch.epoch_id} prepared for finalization (no anchor callback)`);
      }
    }
  }, intervalMs);
}

/**
 * Stop the auto-finalization scheduler.
 */
export function stopAutoFinalization(): void {
  if (finalizationInterval) {
    clearInterval(finalizationInterval);
    finalizationInterval = null;
    logger.info('[EpochService] Auto-finalization scheduler stopped');
  }
}

/**
 * Check if auto-finalization is running.
 */
export function isAutoFinalizationRunning(): boolean {
  return finalizationInterval !== null;
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Reset all epoch state (for testing).
 */
export function resetEpochStore(): void {
  activeEpochs.clear();
  epochStore.clear();
  receiptToEpoch.clear();
  config = { ...DEFAULT_CONFIG };
  epochIndexCounter = 0;
  anchorCallback = null;
  if (finalizationInterval) {
    clearInterval(finalizationInterval);
    finalizationInterval = null;
  }
}

/**
 * Get all epochs (for testing/debugging).
 */
export function getAllEpochs(): Epoch[] {
  return Array.from(epochStore.values());
}
