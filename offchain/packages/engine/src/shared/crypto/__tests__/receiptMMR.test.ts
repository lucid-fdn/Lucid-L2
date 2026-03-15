import { ReceiptMMR, getReceiptMMR, resetReceiptMMR, initReceiptMMR } from '../receiptMMR';
import { createHash } from 'crypto';

// Mock the DB pool — tests run without a database
jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));

function makeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('ReceiptMMR', () => {
  afterEach(() => {
    resetReceiptMMR();
  });

  // ===========================================================================
  // Core functionality (in-memory)
  // ===========================================================================

  it('starts empty', () => {
    const mmr = new ReceiptMMR();
    expect(mmr.getLeafCount()).toBe(0);
    expect(mmr.getSize()).toBe(0);
  });

  it('addLeaf returns sequential indices', () => {
    const mmr = new ReceiptMMR();
    const h1 = makeHash('receipt-1');
    const h2 = makeHash('receipt-2');
    const h3 = makeHash('receipt-3');

    expect(mmr.addLeaf(h1)).toBe(0);
    expect(mmr.addLeaf(h2)).toBe(1);
    expect(mmr.addLeaf(h3)).toBe(2);
    expect(mmr.getLeafCount()).toBe(3);
  });

  it('root changes with each append', () => {
    const mmr = new ReceiptMMR();
    const roots: string[] = [];

    for (let i = 0; i < 5; i++) {
      mmr.addLeaf(makeHash(`receipt-${i}`));
      roots.push(mmr.getRoot());
    }

    // All roots should be unique
    const unique = new Set(roots);
    expect(unique.size).toBe(5);
  });

  it('getProof returns valid proof for each leaf', () => {
    const mmr = new ReceiptMMR();
    const hashes: string[] = [];
    for (let i = 0; i < 5; i++) {
      hashes.push(makeHash(`receipt-${i}`));
      mmr.addLeaf(hashes[i]);
    }

    for (let i = 0; i < 5; i++) {
      const proof = mmr.getProof(i);
      expect(proof).not.toBeNull();
      expect(proof!.leafIndex).toBe(i);
      expect(proof!.leafHash).toBe(hashes[i]);
      expect(proof!.root).toBe(mmr.getRoot());
    }
  });

  it('getProof returns null for out-of-range index', () => {
    const mmr = new ReceiptMMR();
    mmr.addLeaf(makeHash('x'));
    expect(mmr.getProof(-1)).toBeNull();
    expect(mmr.getProof(1)).toBeNull();
    expect(mmr.getProof(100)).toBeNull();
  });

  it('verifyProof succeeds for valid proofs', () => {
    const mmr = new ReceiptMMR();
    for (let i = 0; i < 4; i++) {
      mmr.addLeaf(makeHash(`receipt-${i}`));
    }

    const proof = mmr.getProof(2)!;
    expect(ReceiptMMR.verifyProof(proof)).toBe(true);
  });

  // ===========================================================================
  // State serialization / restoration
  // ===========================================================================

  it('getState captures full state', () => {
    const mmr = new ReceiptMMR();
    for (let i = 0; i < 3; i++) {
      mmr.addLeaf(makeHash(`r-${i}`));
    }

    const state = mmr.getState();
    expect(state.leafCount).toBe(3);
    expect(state.leafPositions.length).toBe(3);
    expect(state.mmrState.size).toBeGreaterThan(0);
    expect(state.mmrState.nodes.size).toBeGreaterThan(0);
  });

  it('reconstructs identically from state', () => {
    const original = new ReceiptMMR();
    const hashes: string[] = [];
    for (let i = 0; i < 5; i++) {
      hashes.push(makeHash(`r-${i}`));
      original.addLeaf(hashes[i]);
    }

    const state = original.getState();
    const restored = new ReceiptMMR(state);

    expect(restored.getRoot()).toBe(original.getRoot());
    expect(restored.getLeafCount()).toBe(original.getLeafCount());
    expect(restored.getSize()).toBe(original.getSize());

    // Proofs from restored should match
    for (let i = 0; i < 5; i++) {
      const origProof = original.getProof(i);
      const restoredProof = restored.getProof(i);
      expect(restoredProof).toEqual(origProof);
    }
  });

  it('restored MMR accepts new leaves correctly', () => {
    const original = new ReceiptMMR();
    for (let i = 0; i < 3; i++) {
      original.addLeaf(makeHash(`r-${i}`));
    }

    const state = original.getState();
    const restored = new ReceiptMMR(state);

    // Add more leaves to both
    const newHash = makeHash('r-3');
    original.addLeaf(newHash);
    restored.addLeaf(newHash);

    expect(restored.getRoot()).toBe(original.getRoot());
    expect(restored.getLeafCount()).toBe(4);
  });

  // ===========================================================================
  // Singleton
  // ===========================================================================

  it('getReceiptMMR returns same singleton', () => {
    const a = getReceiptMMR();
    const b = getReceiptMMR();
    expect(a).toBe(b);
  });

  it('resetReceiptMMR clears singleton', () => {
    const a = getReceiptMMR();
    a.addLeaf(makeHash('x'));
    resetReceiptMMR();
    const b = getReceiptMMR();
    expect(b.getLeafCount()).toBe(0);
  });

  // ===========================================================================
  // DB persistence (loadFromDb)
  // ===========================================================================

  it('loadFromDb returns null when DB has no state', async () => {
    const { pool } = require('../../db/pool');
    pool.query.mockResolvedValueOnce({ rows: [{ leaf_count: 0, mmr_size: 0 }] });

    const loaded = await ReceiptMMR.loadFromDb();
    expect(loaded).toBeNull();
  });

  it('loadFromDb returns null when state row is empty', async () => {
    const { pool } = require('../../db/pool');
    pool.query.mockResolvedValueOnce({ rows: [] });

    const loaded = await ReceiptMMR.loadFromDb();
    expect(loaded).toBeNull();
  });

  it('loadFromDb reconstructs MMR from DB rows', async () => {
    const { pool } = require('../../db/pool');

    // Build an MMR to capture expected state
    const original = new ReceiptMMR();
    const hashes: string[] = [];
    for (let i = 0; i < 3; i++) {
      hashes.push(makeHash(`db-r-${i}`));
      original.addLeaf(hashes[i]);
    }

    // Wait for fire-and-forget persist calls to drain, then reset mocks
    await new Promise(r => setTimeout(r, 50));
    pool.query.mockClear();

    const state = original.getState();

    // Convert nodes Map to DB rows format
    const nodeRows = Array.from(state.mmrState.nodes.entries()).map(([pos, buf]) => ({
      position: pos,
      hash: buf.toString('hex'),
    }));

    // First call: mmr_state query
    pool.query.mockResolvedValueOnce({
      rows: [{
        mmr_size: state.mmrState.size,
        leaf_count: state.leafCount,
        leaf_positions: state.leafPositions,
        root_hash: original.getRoot(),
      }],
    });
    // Second call: mmr_nodes query
    pool.query.mockResolvedValueOnce({ rows: nodeRows });

    const loaded = await ReceiptMMR.loadFromDb();
    expect(loaded).not.toBeNull();
    expect(loaded!.getRoot()).toBe(original.getRoot());
    expect(loaded!.getLeafCount()).toBe(3);
    expect(loaded!.getSize()).toBe(original.getSize());
  });

  it('loadFromDb returns null on DB error', async () => {
    const { pool } = require('../../db/pool');
    pool.query.mockRejectedValueOnce(new Error('connection refused'));

    const loaded = await ReceiptMMR.loadFromDb();
    expect(loaded).toBeNull();
  });

  // ===========================================================================
  // initReceiptMMR
  // ===========================================================================

  it('initReceiptMMR starts fresh when DB is empty', async () => {
    const { pool } = require('../../db/pool');
    pool.query.mockResolvedValueOnce({ rows: [] });

    const mmr = await initReceiptMMR();
    expect(mmr.getLeafCount()).toBe(0);
    expect(getReceiptMMR()).toBe(mmr);
  });

  it('initReceiptMMR restores from DB when state exists', async () => {
    const { pool } = require('../../db/pool');

    const original = new ReceiptMMR();
    for (let i = 0; i < 2; i++) {
      original.addLeaf(makeHash(`init-${i}`));
    }

    // Wait for fire-and-forget persist calls to drain, then reset mocks
    await new Promise(r => setTimeout(r, 50));
    pool.query.mockClear();

    const state = original.getState();
    const nodeRows = Array.from(state.mmrState.nodes.entries()).map(([pos, buf]) => ({
      position: pos,
      hash: buf.toString('hex'),
    }));

    pool.query.mockResolvedValueOnce({
      rows: [{
        mmr_size: state.mmrState.size,
        leaf_count: state.leafCount,
        leaf_positions: state.leafPositions,
        root_hash: original.getRoot(),
      }],
    });
    pool.query.mockResolvedValueOnce({ rows: nodeRows });

    const mmr = await initReceiptMMR();
    expect(mmr.getLeafCount()).toBe(2);
    expect(mmr.getRoot()).toBe(original.getRoot());
    expect(getReceiptMMR()).toBe(mmr);
  });

  // ===========================================================================
  // Write-through persistence on addLeaf
  // ===========================================================================

  it('addLeaf calls DB persist (non-blocking)', async () => {
    const { pool } = require('../../db/pool');
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const mmr = new ReceiptMMR();
    mmr.addLeaf(makeHash('persist-test'));

    // Give the fire-and-forget promise time to resolve
    await new Promise(r => setTimeout(r, 50));

    // Should have called pool.query for INSERT mmr_nodes + UPDATE mmr_state
    const calls = pool.query.mock.calls;
    const insertCall = calls.find((c: string[]) => c[0]?.includes?.('INSERT INTO mmr_nodes'));
    const updateCall = calls.find((c: string[]) => c[0]?.includes?.('UPDATE mmr_state'));

    expect(insertCall).toBeDefined();
    expect(updateCall).toBeDefined();
  });
});
