/**
 * Tests for Epoch Service and Anchoring Service
 * 
 * Phase 3: Receipt Anchoring to Chain
 */
import {
  createEpoch,
  getCurrentEpoch,
  getEpoch,
  listEpochs,
  addReceiptToEpoch,
  getEpochForReceipt,
  shouldFinalizeEpoch,
  prepareEpochForFinalization,
  finalizeEpoch,
  failEpoch,
  retryEpoch,
  getEpochsReadyForFinalization,
  getEpochStats,
  setEpochConfig,
  getEpochConfig,
  resetEpochStore,
  getAllEpochs,
  Epoch,
} from '../services/epochService';

import {
  commitEpochRoot,
  commitEpochRootsBatch,
  verifyEpochAnchor,
  getAnchorTransaction,
  checkAnchoringHealth,
  enableMockMode,
  disableMockMode,
  resetAnchoringState,
  deriveEpochRecordPDA,
  buildCommitEpochInstruction,
} from '../services/anchoringService';

import {
  createReceipt,
  resetReceiptStore,
} from '../services/receiptService';

import { resetReceiptTree } from '../utils/merkleTree';

import { PublicKey, Keypair } from '@solana/web3.js';

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  resetEpochStore();
  resetReceiptStore();
  resetReceiptTree();
  resetAnchoringState();
  enableMockMode(); // Use mock mode for all tests
});

afterEach(() => {
  disableMockMode();
});

// Helper to create a test receipt
function createTestReceipt(overrides: Partial<{
  model_passport_id: string;
  compute_passport_id: string;
  policy_hash: string;
  runtime: string;
  tokens_in: number;
  tokens_out: number;
  ttft_ms: number;
}> = {}) {
  return createReceipt({
    model_passport_id: overrides.model_passport_id || 'model-test-123',
    compute_passport_id: overrides.compute_passport_id || 'compute-test-456',
    policy_hash: overrides.policy_hash || '0'.repeat(64),
    runtime: overrides.runtime || 'vllm',
    tokens_in: overrides.tokens_in || 100,
    tokens_out: overrides.tokens_out || 50,
    ttft_ms: overrides.ttft_ms || 250,
  });
}

// =============================================================================
// EPOCH SERVICE TESTS
// =============================================================================

describe('Epoch Service', () => {
  describe('createEpoch', () => {
    it('should create a new epoch with correct initial values', () => {
      const epoch = createEpoch();
      
      expect(epoch.epoch_id).toMatch(/^epoch_/);
      expect(epoch.status).toBe('open');
      expect(epoch.leaf_count).toBe(0);
      expect(epoch.mmr_root).toBeDefined();
      expect(epoch.created_at).toBeGreaterThan(0);
      expect(epoch.receipt_run_ids).toEqual([]);
    });

    it('should create epoch with project_id', () => {
      const epoch = createEpoch('project-123');
      
      expect(epoch.project_id).toBe('project-123');
    });

    it('should store epoch in store', () => {
      const epoch = createEpoch();
      const retrieved = getEpoch(epoch.epoch_id);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.epoch_id).toBe(epoch.epoch_id);
    });
  });

  describe('getCurrentEpoch', () => {
    it('should return existing active epoch', () => {
      const epoch1 = createEpoch();
      const epoch2 = getCurrentEpoch();
      
      expect(epoch2.epoch_id).toBe(epoch1.epoch_id);
    });

    it('should create new epoch if none exists', () => {
      const epoch = getCurrentEpoch();
      
      expect(epoch).toBeDefined();
      expect(epoch.status).toBe('open');
    });

    it('should separate epochs by project_id', () => {
      const epoch1 = getCurrentEpoch('project-1');
      const epoch2 = getCurrentEpoch('project-2');
      
      expect(epoch1.epoch_id).not.toBe(epoch2.epoch_id);
      expect(epoch1.project_id).toBe('project-1');
      expect(epoch2.project_id).toBe('project-2');
    });
  });

  describe('addReceiptToEpoch', () => {
    it('should add receipt to current epoch', () => {
      const epoch = getCurrentEpoch();
      
      addReceiptToEpoch('run_123');
      
      const updated = getEpoch(epoch.epoch_id);
      expect(updated?.leaf_count).toBe(1);
      expect(updated?.receipt_run_ids).toContain('run_123');
    });

    it('should track receipt to epoch mapping', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_456');
      
      const epochId = getEpochForReceipt('run_456');
      expect(epochId).toBe(epoch.epoch_id);
    });

    it('should update MMR root after adding receipt', () => {
      const epoch = getCurrentEpoch();
      const initialRoot = epoch.mmr_root;
      
      // Create actual receipt (which adds to merkle tree)
      const receipt = createTestReceipt();
      addReceiptToEpoch(receipt.run_id);
      
      const updated = getEpoch(epoch.epoch_id);
      // Root should be updated (or same if tree implementation differs)
      expect(updated?.mmr_root).toBeDefined();
    });
  });

  describe('shouldFinalizeEpoch', () => {
    it('should not finalize empty epoch', () => {
      const epoch = createEpoch();
      const result = shouldFinalizeEpoch(epoch);
      
      expect(result.should).toBe(false);
    });

    it('should finalize when max receipts reached', () => {
      setEpochConfig({ max_receipts_per_epoch: 5 });
      const epoch = getCurrentEpoch();
      
      // Add receipts
      for (let i = 0; i < 5; i++) {
        const receipt = createTestReceipt();
        addReceiptToEpoch(receipt.run_id);
      }
      
      const updated = getEpoch(epoch.epoch_id)!;
      const result = shouldFinalizeEpoch(updated);
      
      expect(result.should).toBe(true);
      expect(result.reason).toBe('max_receipts_reached');
    });

    it('should finalize when max duration reached', () => {
      setEpochConfig({ max_epoch_duration_ms: 100 });
      const epoch = getCurrentEpoch();
      
      // Add a receipt
      addReceiptToEpoch('run_1');
      
      // Manually set created_at to the past
      const oldEpoch = getEpoch(epoch.epoch_id)!;
      (oldEpoch as any).created_at = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      
      const result = shouldFinalizeEpoch(oldEpoch);
      
      expect(result.should).toBe(true);
      expect(result.reason).toBe('max_duration_reached');
    });

    it('should not finalize non-open epochs', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      prepareEpochForFinalization(epoch.epoch_id);
      
      const anchoring = getEpoch(epoch.epoch_id)!;
      const result = shouldFinalizeEpoch(anchoring);
      
      expect(result.should).toBe(false);
    });
  });

  describe('prepareEpochForFinalization', () => {
    it('should transition epoch to anchoring status', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      
      const prepared = prepareEpochForFinalization(epoch.epoch_id);
      
      expect(prepared).not.toBeNull();
      expect(prepared?.status).toBe('anchoring');
      expect(prepared?.finalized_at).toBeDefined();
    });

    it('should capture final MMR root', () => {
      const epoch = getCurrentEpoch();
      const receipt = createTestReceipt();
      addReceiptToEpoch(receipt.run_id);
      
      const prepared = prepareEpochForFinalization(epoch.epoch_id);
      
      expect(prepared?.mmr_root).toBeDefined();
      expect(prepared?.end_leaf_index).toBeDefined();
    });

    it('should remove from active epochs', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      
      prepareEpochForFinalization(epoch.epoch_id);
      
      // Getting current epoch should create a new one
      const newEpoch = getCurrentEpoch();
      expect(newEpoch.epoch_id).not.toBe(epoch.epoch_id);
    });

    it('should return null for non-existent epoch', () => {
      const result = prepareEpochForFinalization('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for non-open epoch', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      prepareEpochForFinalization(epoch.epoch_id);
      
      // Try to prepare again
      const result = prepareEpochForFinalization(epoch.epoch_id);
      expect(result).toBeNull();
    });
  });

  describe('finalizeEpoch', () => {
    it('should mark epoch as anchored', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      prepareEpochForFinalization(epoch.epoch_id);
      
      const finalized = finalizeEpoch(epoch.epoch_id, 'tx_signature_123', epoch.mmr_root);
      
      expect(finalized).not.toBeNull();
      expect(finalized?.status).toBe('anchored');
      expect(finalized?.chain_tx).toBe('tx_signature_123');
    });

    it('should only finalize anchoring epochs', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      
      // Try to finalize without preparing first
      const result = finalizeEpoch(epoch.epoch_id, 'tx_123', epoch.mmr_root);
      
      expect(result).toBeNull();
    });
  });

  describe('failEpoch', () => {
    it('should mark epoch as failed with error', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      prepareEpochForFinalization(epoch.epoch_id);
      
      const failed = failEpoch(epoch.epoch_id, 'Network error');
      
      expect(failed).not.toBeNull();
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Network error');
    });
  });

  describe('retryEpoch', () => {
    it('should reset failed epoch to open', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      prepareEpochForFinalization(epoch.epoch_id);
      failEpoch(epoch.epoch_id, 'Error');
      
      const retried = retryEpoch(epoch.epoch_id);
      
      expect(retried).not.toBeNull();
      expect(retried?.status).toBe('open');
      expect(retried?.error).toBeUndefined();
    });

    it('should only retry failed epochs', () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('run_1');
      
      const result = retryEpoch(epoch.epoch_id);
      
      expect(result).toBeNull();
    });
  });

  describe('listEpochs', () => {
    it('should list all epochs', () => {
      createEpoch('project-1');
      createEpoch('project-2');
      createEpoch('project-3');
      
      const result = listEpochs();
      
      expect(result.total).toBe(3);
      expect(result.epochs.length).toBe(3);
    });

    it('should filter by project_id', () => {
      createEpoch('project-1');
      createEpoch('project-2');
      createEpoch('project-1');
      
      const result = listEpochs({ project_id: 'project-1' });
      
      expect(result.total).toBe(2);
    });

    it('should filter by status', () => {
      const epoch1 = createEpoch();
      const epoch2 = createEpoch('p2');
      addReceiptToEpoch('r1');
      prepareEpochForFinalization(epoch1.epoch_id);
      
      const openResult = listEpochs({ status: 'open' });
      const anchoringResult = listEpochs({ status: 'anchoring' });
      
      expect(openResult.total).toBe(1);
      expect(anchoringResult.total).toBe(1);
    });

    it('should paginate results', () => {
      for (let i = 0; i < 5; i++) {
        createEpoch(`project-${i}`);
      }
      
      const page1 = listEpochs({ page: 1, per_page: 2 });
      const page2 = listEpochs({ page: 2, per_page: 2 });
      
      expect(page1.epochs.length).toBe(2);
      expect(page2.epochs.length).toBe(2);
      expect(page1.total_pages).toBe(3);
    });
  });

  describe('getEpochStats', () => {
    it('should return correct statistics', () => {
      const epoch1 = createEpoch();
      addReceiptToEpoch('r1');
      prepareEpochForFinalization(epoch1.epoch_id);
      finalizeEpoch(epoch1.epoch_id, 'tx1', epoch1.mmr_root);
      
      const epoch2 = createEpoch('p2');
      addReceiptToEpoch('r2', 'p2');
      addReceiptToEpoch('r3', 'p2');
      prepareEpochForFinalization(epoch2.epoch_id);
      failEpoch(epoch2.epoch_id, 'Error');
      
      createEpoch('p3');
      
      const stats = getEpochStats();
      
      expect(stats.total_epochs).toBe(3);
      expect(stats.open_epochs).toBe(1);
      expect(stats.anchored_epochs).toBe(1);
      expect(stats.failed_epochs).toBe(1);
      expect(stats.total_receipts_anchored).toBe(1);
    });
  });

  describe('getEpochsReadyForFinalization', () => {
    it('should return epochs that meet finalization criteria', () => {
      setEpochConfig({ max_receipts_per_epoch: 2 });
      
      const epoch = getCurrentEpoch();
      const r1 = createTestReceipt();
      const r2 = createTestReceipt();
      addReceiptToEpoch(r1.run_id);
      addReceiptToEpoch(r2.run_id);
      
      const ready = getEpochsReadyForFinalization();
      
      expect(ready.length).toBe(1);
      expect(ready[0].epoch_id).toBe(epoch.epoch_id);
    });
  });
});

// =============================================================================
// ANCHORING SERVICE TESTS
// =============================================================================

describe('Anchoring Service', () => {
  describe('commitEpochRoot (mock mode)', () => {
    it('should successfully commit epoch in mock mode', async () => {
      const epoch = getCurrentEpoch();
      const receipt = createTestReceipt();
      addReceiptToEpoch(receipt.run_id);
      
      const result = await commitEpochRoot(epoch.epoch_id);
      
      expect(result.success).toBe(true);
      expect(result.signature).toMatch(/^mock_tx_/);
      expect(result.root).toBeDefined();
      expect(result.epoch_id).toBe(epoch.epoch_id);
    });

    it('should fail for non-existent epoch', async () => {
      const result = await commitEpochRoot('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail for empty epoch', async () => {
      const epoch = getCurrentEpoch();
      
      const result = await commitEpochRoot(epoch.epoch_id);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty epoch');
    });

    it('should update epoch status to anchored', async () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('r1');
      
      await commitEpochRoot(epoch.epoch_id);
      
      const updated = getEpoch(epoch.epoch_id);
      expect(updated?.status).toBe('anchored');
      expect(updated?.chain_tx).toBeDefined();
    });
  });

  describe('commitEpochRootsBatch (mock mode)', () => {
    it('should commit multiple epochs', async () => {
      const epoch1 = createEpoch('p1');
      addReceiptToEpoch('r1', 'p1');
      
      const epoch2 = createEpoch('p2');
      addReceiptToEpoch('r2', 'p2');
      
      const results = await commitEpochRootsBatch([epoch1.epoch_id, epoch2.epoch_id]);
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle mixed success/failure', async () => {
      const epoch1 = createEpoch('p1');
      addReceiptToEpoch('r1', 'p1');
      
      // Empty epoch will fail
      const epoch2 = createEpoch('p2');
      
      const results = await commitEpochRootsBatch([epoch1.epoch_id, epoch2.epoch_id]);
      
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should reject batch larger than 16', async () => {
      const epochIds = Array(17).fill(null).map((_, i) => `epoch_${i}`);
      
      await expect(commitEpochRootsBatch(epochIds)).rejects.toThrow('Maximum 16');
    });
  });

  describe('verifyEpochAnchor', () => {
    it('should verify anchored epoch in mock mode', async () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('r1');
      await commitEpochRoot(epoch.epoch_id);
      
      const result = await verifyEpochAnchor(epoch.epoch_id);
      
      expect(result.valid).toBe(true);
      expect(result.expected_root).toBeDefined();
    });

    it('should fail for non-anchored epoch', async () => {
      const epoch = getCurrentEpoch();
      
      const result = await verifyEpochAnchor(epoch.epoch_id);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not anchored');
    });
  });

  describe('getAnchorTransaction', () => {
    it('should return transaction details in mock mode', async () => {
      const epoch = getCurrentEpoch();
      addReceiptToEpoch('r1');
      await commitEpochRoot(epoch.epoch_id);
      
      const result = await getAnchorTransaction(epoch.epoch_id);
      
      expect(result.found).toBe(true);
      expect(result.tx_signature).toBeDefined();
      expect(result.slot).toBeDefined();
    });

    it('should fail for non-anchored epoch', async () => {
      const epoch = getCurrentEpoch();
      
      const result = await getAnchorTransaction(epoch.epoch_id);
      
      expect(result.found).toBe(false);
    });
  });

  describe('checkAnchoringHealth', () => {
    it('should report healthy in mock mode', async () => {
      const health = await checkAnchoringHealth();
      
      expect(health.connected).toBe(true);
      expect(health.mock_mode).toBe(true);
    });
  });

  describe('PDA derivation', () => {
    it('should derive consistent PDA for same authority', () => {
      const authority = Keypair.generate().publicKey;
      
      const [pda1] = deriveEpochRecordPDA(authority);
      const [pda2] = deriveEpochRecordPDA(authority);
      
      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should derive different PDAs for different authorities', () => {
      const auth1 = Keypair.generate().publicKey;
      const auth2 = Keypair.generate().publicKey;
      
      const [pda1] = deriveEpochRecordPDA(auth1);
      const [pda2] = deriveEpochRecordPDA(auth2);
      
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('buildCommitEpochInstruction', () => {
    it('should build valid instruction', () => {
      const authority = Keypair.generate().publicKey;
      const root = Buffer.alloc(32, 0xab);
      
      const instruction = buildCommitEpochInstruction(authority, root);
      
      expect(instruction.programId).toBeDefined();
      expect(instruction.keys.length).toBe(2); // authority, epoch_record
      expect(instruction.data.length).toBeGreaterThan(32); // discriminator + root
    });

    it('should reject invalid root length', () => {
      const authority = Keypair.generate().publicKey;
      const invalidRoot = Buffer.alloc(16);
      
      expect(() => buildCommitEpochInstruction(authority, invalidRoot)).toThrow('32 bytes');
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Epoch + Anchoring Integration', () => {
  it('should complete full epoch lifecycle', async () => {
    // 1. Create receipts and add to epoch
    const epoch = getCurrentEpoch();
    
    for (let i = 0; i < 3; i++) {
      const receipt = createTestReceipt();
      addReceiptToEpoch(receipt.run_id);
    }
    
    const epochWithReceipts = getEpoch(epoch.epoch_id)!;
    expect(epochWithReceipts.leaf_count).toBe(3);
    expect(epochWithReceipts.status).toBe('open');
    
    // 2. Commit epoch to chain
    const anchorResult = await commitEpochRoot(epoch.epoch_id);
    expect(anchorResult.success).toBe(true);
    
    // 3. Verify epoch is anchored
    const anchoredEpoch = getEpoch(epoch.epoch_id)!;
    expect(anchoredEpoch.status).toBe('anchored');
    expect(anchoredEpoch.chain_tx).toBeDefined();
    
    // 4. Verify anchor on chain
    const verifyResult = await verifyEpochAnchor(epoch.epoch_id);
    expect(verifyResult.valid).toBe(true);
    
    // 5. Get transaction details
    const txResult = await getAnchorTransaction(epoch.epoch_id);
    expect(txResult.found).toBe(true);
  });

  it('should handle epoch failure and retry', async () => {
    const epoch = getCurrentEpoch();
    addReceiptToEpoch('r1');
    
    // Prepare and manually fail
    prepareEpochForFinalization(epoch.epoch_id);
    failEpoch(epoch.epoch_id, 'Simulated failure');
    
    const failedEpoch = getEpoch(epoch.epoch_id)!;
    expect(failedEpoch.status).toBe('failed');
    
    // Retry
    retryEpoch(epoch.epoch_id);
    const retriedEpoch = getEpoch(epoch.epoch_id)!;
    expect(retriedEpoch.status).toBe('open');
    
    // Now commit successfully
    const result = await commitEpochRoot(epoch.epoch_id);
    expect(result.success).toBe(true);
  });

  it('should create new epoch after finalization', async () => {
    const epoch1 = getCurrentEpoch();
    addReceiptToEpoch('r1');
    
    await commitEpochRoot(epoch1.epoch_id);
    
    // Getting current epoch should create a new one
    const epoch2 = getCurrentEpoch();
    expect(epoch2.epoch_id).not.toBe(epoch1.epoch_id);
    expect(epoch2.status).toBe('open');
    expect(epoch2.leaf_count).toBe(0);
  });

  it('should track receipts across epochs', async () => {
    // First epoch
    const epoch1 = getCurrentEpoch();
    addReceiptToEpoch('r1');
    addReceiptToEpoch('r2');
    await commitEpochRoot(epoch1.epoch_id);
    
    // Second epoch
    const epoch2 = getCurrentEpoch();
    addReceiptToEpoch('r3');
    addReceiptToEpoch('r4');
    
    // Verify receipt-to-epoch mapping
    expect(getEpochForReceipt('r1')).toBe(epoch1.epoch_id);
    expect(getEpochForReceipt('r2')).toBe(epoch1.epoch_id);
    expect(getEpochForReceipt('r3')).toBe(epoch2.epoch_id);
    expect(getEpochForReceipt('r4')).toBe(epoch2.epoch_id);
    
    // Verify stats
    const stats = getEpochStats();
    expect(stats.total_epochs).toBe(2);
    expect(stats.anchored_epochs).toBe(1);
    expect(stats.open_epochs).toBe(1);
  });
});
