/**
 * Receipt MMR Adapter
 *
 * Wraps the real MMR (mmr.ts) with a hex-string interface for the receipt pipeline.
 * Provides the same singleton pattern as the old getReceiptTree() but backed by
 * a true Merkle Mountain Range with peaks and right-to-left bagging.
 *
 * Phase 2: DB persistence — every addLeaf write-through to mmr_nodes + mmr_state
 * so that the receipt MMR survives server restarts without network dependencies.
 */
import { MMR, MMRProof, MMRState } from './mmr';
import { logger } from '../lib/logger';

export interface SerializedMMRProof {
  leafIndex: number;       // Sequential receipt index (NOT MMR position)
  leafHash: string;        // Hex
  siblings: string[];      // Hex array
  peaks: string[];         // Hex array
  mmrSize: number;
  root: string;            // Current bagged root (hex)
}

export class ReceiptMMR {
  private mmr: MMR;
  private leafPositions: number[] = [];  // maps sequential index -> MMR position
  private leafCount = 0;

  constructor(state?: { mmrState: MMRState; leafPositions: number[]; leafCount: number }) {
    if (state) {
      this.mmr = new MMR(state.mmrState);
      this.leafPositions = [...state.leafPositions];
      this.leafCount = state.leafCount;
    } else {
      this.mmr = new MMR();
    }
  }

  /** Append a receipt hash (hex string) as a new leaf. Returns the sequential leaf index. */
  addLeaf(hexHash: string): number {
    const leafPosition = this.mmr.getSize(); // position before append
    const buf = Buffer.from(hexHash, 'hex');
    this.mmr.append(buf);
    const index = this.leafCount;
    this.leafPositions.push(leafPosition);
    this.leafCount++;

    // Write-through to DB (non-blocking, best-effort)
    this._persistAfterAppend(leafPosition).catch(err =>
      logger.warn('[ReceiptMMR] DB persist failed (non-blocking):', err instanceof Error ? err.message : err),
    );

    return index;
  }

  /** Get the current MMR root as a hex string. */
  getRoot(): string {
    return this.mmr.getRoot().toString('hex');
  }

  /** Get the number of receipt leaves (not total MMR nodes). */
  getLeafCount(): number {
    return this.leafCount;
  }

  /** Get the total MMR size (all nodes including internal). */
  getSize(): number {
    return this.mmr.getSize();
  }

  /** Get current peak hashes as hex strings. */
  getPeaks(): string[] {
    const state = this.mmr.getState();
    return state.peaks.map(p => p.toString('hex'));
  }

  /** Generate a proof for a receipt at the given sequential leaf index. */
  getProof(leafIndex: number): SerializedMMRProof | null {
    if (leafIndex < 0 || leafIndex >= this.leafCount) return null;
    const mmrPosition = this.leafPositions[leafIndex];
    const proof = this.mmr.generateProof(mmrPosition);
    if (!proof) return null;

    return {
      leafIndex,
      leafHash: proof.leafHash.toString('hex'),
      siblings: proof.siblings.map(s => s.toString('hex')),
      peaks: proof.peaks.map(p => p.toString('hex')),
      mmrSize: proof.mmrSize,
      root: this.getRoot(),
    };
  }

  /** Verify a serialized proof against a root. */
  static verifyProof(proof: SerializedMMRProof, expectedRoot?: string): boolean {
    const bufProof: MMRProof = {
      leafIndex: proof.leafIndex,
      leafHash: Buffer.from(proof.leafHash, 'hex'),
      siblings: proof.siblings.map(s => Buffer.from(s, 'hex')),
      peaks: proof.peaks.map(p => Buffer.from(p, 'hex')),
      mmrSize: proof.mmrSize,
    };
    const root = Buffer.from(expectedRoot || proof.root, 'hex');
    return MMR.verifyProof(bufProof, root);
  }

  /** Get serializable state for persistence. */
  getState(): { mmrState: MMRState; leafPositions: number[]; leafCount: number } {
    return {
      mmrState: this.mmr.getState(),
      leafPositions: [...this.leafPositions],
      leafCount: this.leafCount,
    };
  }

  /** Reset (for testing). */
  reset(): void {
    this.mmr = new MMR();
    this.leafPositions = [];
    this.leafCount = 0;
  }

  // ===========================================================================
  // DB PERSISTENCE (Phase 2)
  // ===========================================================================

  /**
   * Persist new MMR nodes and state after an append.
   * All nodes created by an append are at positions >= leafPosition (the leaf
   * itself + any internal merge nodes at higher positions).
   */
  private async _persistAfterAppend(leafPosition: number): Promise<void> {
    const { pool } = await import('../db/pool');
    const state = this.mmr.getState();

    // Collect new nodes (all at position >= leafPosition are from this append)
    const newNodes: Array<[number, string]> = [];
    for (const [pos, hash] of state.nodes) {
      if (pos >= leafPosition) {
        newNodes.push([pos, hash.toString('hex')]);
      }
    }

    // Batch insert new nodes
    if (newNodes.length > 0) {
      const values = newNodes.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = newNodes.flatMap(([pos, hash]) => [pos, hash]);
      await pool.query(
        `INSERT INTO mmr_nodes (position, hash) VALUES ${values} ON CONFLICT (position) DO NOTHING`,
        params,
      );
    }

    // Update singleton state row
    await pool.query(
      `UPDATE mmr_state
       SET mmr_size = $1, leaf_count = $2, leaf_positions = $3, root_hash = $4, updated_at = now()
       WHERE id = 'receipt_mmr'`,
      [state.size, this.leafCount, JSON.stringify(this.leafPositions), this.getRoot()],
    );
  }

  /**
   * Load persisted MMR state from DB. Returns null if no state exists.
   */
  static async loadFromDb(): Promise<ReceiptMMR | null> {
    try {
      const { pool } = await import('../db/pool');

      // Load state metadata
      const stateResult = await pool.query(
        'SELECT mmr_size, leaf_count, leaf_positions, root_hash FROM mmr_state WHERE id = $1',
        ['receipt_mmr'],
      );
      if (stateResult.rows.length === 0 || stateResult.rows[0].leaf_count === 0) {
        return null; // No persisted state or empty MMR
      }

      const row = stateResult.rows[0];

      // Load all nodes
      const nodesResult = await pool.query('SELECT position, hash FROM mmr_nodes ORDER BY position');
      if (nodesResult.rows.length === 0) {
        return null; // State says leaves exist but no nodes — inconsistent, start fresh
      }

      const nodes = new Map<number, Buffer>();
      for (const nodeRow of nodesResult.rows) {
        nodes.set(nodeRow.position, Buffer.from(nodeRow.hash, 'hex'));
      }

      const leafPositions: number[] = Array.isArray(row.leaf_positions)
        ? row.leaf_positions
        : JSON.parse(row.leaf_positions);

      const mmrState: MMRState = {
        size: row.mmr_size,
        peaks: [], // Peaks are derived from nodes during getRoot(), not needed for construction
        nodes,
      };

      return new ReceiptMMR({
        mmrState,
        leafPositions,
        leafCount: row.leaf_count,
      });
    } catch (err) {
      logger.warn('[ReceiptMMR] DB load failed (starting fresh):', err instanceof Error ? err.message : err);
      return null;
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let receiptMMR: ReceiptMMR | null = null;

/** Get the global receipt MMR singleton. If not yet initialized, creates a fresh one. */
export function getReceiptMMR(): ReceiptMMR {
  if (!receiptMMR) {
    receiptMMR = new ReceiptMMR();
  }
  return receiptMMR;
}

/** Reset singleton (for testing). */
export function resetReceiptMMR(): void {
  receiptMMR = null;
}

/**
 * Initialize the receipt MMR from DB (call at startup).
 * If DB has persisted state, restores it. Otherwise starts fresh.
 */
export async function initReceiptMMR(): Promise<ReceiptMMR> {
  const loaded = await ReceiptMMR.loadFromDb();
  if (loaded) {
    receiptMMR = loaded;
    logger.info(`[ReceiptMMR] Restored from DB: ${loaded.getLeafCount()} leaves, MMR size ${loaded.getSize()}`);
  } else {
    receiptMMR = new ReceiptMMR();
    logger.info('[ReceiptMMR] Starting fresh (no persisted state)');
  }
  return receiptMMR;
}
