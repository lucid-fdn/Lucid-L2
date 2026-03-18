/**
 * Fluid Compute v0 - End-to-End Test Suite
 * 
 * Tests the complete flow: Quote → Job → Receipt → Epoch → Anchor
 * 
 * Run with: npm test -- --testPathPattern=fluid-compute-e2e
 */

import { v4 as uuid } from 'uuid';
import {
  computeQuoteHash,
  computeJobHash,
  computeInputHash,
  computeOutputsHash,
  verifyQuoteHash,
  verifyJobHash,
  createComputeReceipt,
  getComputeReceipt,
  verifyComputeReceipt,
  resetReceiptStore,
  getMmrRoot,
  getMmrLeafCount,
} from '../../packages/engine/src/receipt/receiptService';
import {
  createEpoch,
  getCurrentEpoch,
  getEpoch,
  addReceiptToEpoch,
  shouldFinalizeEpoch,
  prepareEpochForFinalization,
  getEpochStats,
  setEpochConfig,
  resetEpochStore,
} from '../../packages/engine/src/anchoring/epoch/services/epochService';
import {
  enableMockMode,
  disableMockMode,
  commitEpochRoot,
  verifyEpochAnchor,
  resetAnchoringState,
  checkAnchoringHealth,
} from '../../packages/engine/src/anchoring/epoch/services/anchoringService';
import type {
  OfferQuote,
  JobRequest,
  JobInput,
  Price,
  ExecutionMode,
} from '../../packages/engine/src/shared/types/fluidCompute';

// Helper to create a mock quote
function createMockQuote(overrides: Partial<OfferQuote> = {}): Omit<OfferQuote, 'quote_hash' | 'quote_signature'> {
  return {
    quote_id: `quote_${uuid().replace(/-/g, '')}`,
    offer_id: 'test_offer_001',
    model_id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    policy_hash: 'a'.repeat(64),
    max_input_tokens: 1000,
    max_output_tokens: 500,
    price: { amount: 10000, currency: 'lamports' } as Price,
    expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
    worker_pubkey: 'test_pubkey_hex',
    ...overrides,
  };
}

// Helper to create a mock job
function createMockJob(quote: OfferQuote, overrides: Partial<JobRequest> = {}): Omit<JobRequest, 'job_hash'> {
  const input: JobInput = {
    messages: [
      { role: 'user', content: 'Hello, how are you?' },
    ],
  };

  return {
    job_id: `job_${uuid().replace(/-/g, '')}`,
    model_id: quote.model_id,
    offer_id: quote.offer_id,
    quote,
    input,
    trace_id: `trace_${uuid()}`,
    ...overrides,
  };
}

// Helper to create a valid v0.2 receipt input with all required fields
function createValidReceiptInput(overrides: Record<string, unknown> = {}) {
  return {
    model_passport_id: 'model_001',
    compute_passport_id: 'compute_001',
    policy_hash: 'a'.repeat(64),
    runtime: 'hf-inference-api',
    tokens_in: 100,
    tokens_out: 50,
    ttft_ms: 150,
    // Required v0 fields
    execution_mode: 'managed_endpoint' as ExecutionMode,
    job_hash: 'b'.repeat(64),
    quote_hash: 'c'.repeat(64),
    outputs_hash: 'd'.repeat(64),
    node_id: 'worker-sim-hf-001',
    runtime_hash: null,
    gpu_fingerprint: null,
    ...overrides,
  };
}

describe('Fluid Compute v0 - E2E Tests', () => {
  beforeEach(() => {
    // Reset all stores before each test
    resetReceiptStore();
    resetEpochStore();
    resetAnchoringState();
    enableMockMode(); // Use mock mode by default
  });

  afterEach(() => {
    disableMockMode();
  });

  describe('1. Quote Hash & Validation', () => {
    it('should compute deterministic quote hash', () => {
      const quoteBody = createMockQuote();
      
      const hash1 = computeQuoteHash(quoteBody);
      const hash2 = computeQuoteHash(quoteBody);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different quotes', () => {
      const quote1 = createMockQuote({ quote_id: 'quote_001' });
      const quote2 = createMockQuote({ quote_id: 'quote_002' });
      
      const hash1 = computeQuoteHash(quote1);
      const hash2 = computeQuoteHash(quote2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should verify valid quote hash', () => {
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      
      // Create full quote with hash (signature would be added by signing)
      const fullQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      expect(verifyQuoteHash(fullQuote)).toBe(true);
    });

    it('should reject tampered quote hash', () => {
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      
      const tamperedQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
        max_input_tokens: 9999, // Tampered!
      };
      
      expect(verifyQuoteHash(tamperedQuote)).toBe(false);
    });
  });

  describe('2. Job Hash & Binding', () => {
    it('should compute deterministic job hash', () => {
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      const fullQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      const jobBody = createMockJob(fullQuote);
      
      const hash1 = computeJobHash(
        jobBody.job_id,
        jobBody.model_id,
        jobBody.offer_id,
        fullQuote.quote_hash,
        jobBody.input
      );
      const hash2 = computeJobHash(
        jobBody.job_id,
        jobBody.model_id,
        jobBody.offer_id,
        fullQuote.quote_hash,
        jobBody.input
      );
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should bind job to quote via hash', () => {
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      const fullQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      const jobBody = createMockJob(fullQuote);
      const job_hash = computeJobHash(
        jobBody.job_id,
        jobBody.model_id,
        jobBody.offer_id,
        fullQuote.quote_hash,
        jobBody.input
      );
      
      const fullJob: JobRequest = {
        ...jobBody,
        job_hash,
      };
      
      expect(verifyJobHash(fullJob)).toBe(true);
    });

    it('should reject job with mismatched quote', () => {
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      const fullQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      const jobBody = createMockJob(fullQuote);
      const job_hash = computeJobHash(
        jobBody.job_id,
        jobBody.model_id,
        jobBody.offer_id,
        fullQuote.quote_hash,
        jobBody.input
      );
      
      // Create a different quote
      const differentQuote: OfferQuote = {
        ...createMockQuote({ quote_id: 'different_quote' }),
        quote_hash: 'b'.repeat(64),
        quote_signature: 'different_sig',
      };
      
      const tamperedJob: JobRequest = {
        ...jobBody,
        job_hash,
        quote: differentQuote, // Different quote!
      };
      
      expect(verifyJobHash(tamperedJob)).toBe(false);
    });
  });

  describe('3. Extended Receipt Creation', () => {
    it('should create receipt with all v0 fields', () => {
      const receipt = createComputeReceipt({
        model_passport_id: 'model_001',
        compute_passport_id: 'compute_001',
        policy_hash: 'a'.repeat(64),
        runtime: 'hf-inference-api',
        tokens_in: 100,
        tokens_out: 50,
        ttft_ms: 150,
        // v0 extended fields
        execution_mode: 'managed_endpoint',
        job_hash: 'b'.repeat(64),
        quote_hash: 'c'.repeat(64),
        node_id: 'worker-sim-hf-001',
        runtime_hash: null, // managed_endpoint
        gpu_fingerprint: null, // managed_endpoint
        outputs_hash: 'd'.repeat(64),
        output_ref: 's3://bucket/output.json',
        start_ts: Math.floor(Date.now() / 1000) - 10,
        end_ts: Math.floor(Date.now() / 1000),
        total_latency_ms: 1500,
      }, 'worker');
      
      expect(receipt.run_id).toBeDefined();
      expect(receipt.execution_mode).toBe('managed_endpoint');
      expect(receipt.job_hash).toBe('b'.repeat(64));
      expect(receipt.quote_hash).toBe('c'.repeat(64));
      expect(receipt.runtime_hash).toBeNull();
      expect(receipt.gpu_fingerprint).toBeNull();
      expect(receipt.signer_type).toBe('worker');
      expect(receipt.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.receipt_signature).toBeDefined();
    });

    it('should verify receipt hash and signature', () => {
      const receipt = createComputeReceipt({
        model_passport_id: 'model_001',
        compute_passport_id: 'compute_001',
        policy_hash: 'a'.repeat(64),
        runtime: 'vllm',
        tokens_in: 200,
        tokens_out: 100,
        ttft_ms: 80,
        // Required v0 fields
        execution_mode: 'byo_runtime',
        job_hash: 'b'.repeat(64),
        quote_hash: 'c'.repeat(64),
        outputs_hash: 'd'.repeat(64),
        runtime_hash: 'sha256:' + 'e'.repeat(64),
        gpu_fingerprint: 'NVIDIA-A100-40GB',
      });

      const verification = verifyComputeReceipt(receipt.run_id);

      expect(verification.hash_valid).toBe(true);
      expect(verification.signature_valid).toBe(true);
    });

    it('should add receipt to Merkle tree', () => {
      const leafCountBefore = getMmrLeafCount();

      createComputeReceipt(createValidReceiptInput());

      const leafCountAfter = getMmrLeafCount();

      expect(leafCountAfter).toBe(leafCountBefore + 1);
    });
  });

  describe('4. Epoch Lifecycle', () => {
    it('should create and track epochs', () => {
      const epoch = createEpoch();
      
      expect(epoch.epoch_id).toMatch(/^epoch_[a-f0-9]+$/);
      expect(epoch.status).toBe('open');
      expect(epoch.leaf_count).toBe(0);
    });

    it('should add receipts to current epoch', () => {
      const epoch = getCurrentEpoch();

      const receipt = createComputeReceipt(createValidReceiptInput());

      addReceiptToEpoch(receipt.run_id);

      const updatedEpoch = getEpoch(epoch.epoch_id);
      expect(updatedEpoch?.leaf_count).toBe(1);
      expect(updatedEpoch?.receipt_run_ids).toContain(receipt.run_id);
    });

    it('should detect when epoch should finalize (receipt count)', () => {
      // Configure low threshold for testing
      setEpochConfig({ max_receipts_per_epoch: 3 });

      const epoch = getCurrentEpoch();

      // Add 2 receipts
      for (let i = 0; i < 2; i++) {
        const receipt = createComputeReceipt(createValidReceiptInput({
          model_passport_id: `model_${i}`,
          job_hash: `${'b'.repeat(62)}${i.toString().padStart(2, '0')}`,
        }));
        addReceiptToEpoch(receipt.run_id);
      }

      expect(shouldFinalizeEpoch(epoch).should).toBe(false);

      // Add 3rd receipt - should trigger finalization
      const receipt = createComputeReceipt(createValidReceiptInput({
        model_passport_id: 'model_final',
        job_hash: 'b'.repeat(62) + '99',
      }));
      addReceiptToEpoch(receipt.run_id);

      const updatedEpoch = getEpoch(epoch.epoch_id)!;
      expect(shouldFinalizeEpoch(updatedEpoch).should).toBe(true);
    });

    it('should prepare epoch for finalization', async () => {
      const epoch = getCurrentEpoch();

      // Add a receipt
      const receipt = createComputeReceipt(createValidReceiptInput());
      addReceiptToEpoch(receipt.run_id);

      const prepared = await prepareEpochForFinalization(epoch.epoch_id);

      expect(prepared).not.toBeNull();
      expect(prepared?.status).toBe('anchoring');
      expect(prepared?.finalized_at).toBeDefined();
    });
  });

  describe('5. Anchoring (Mock Mode)', () => {
    it('should commit epoch root in mock mode', async () => {
      const epoch = getCurrentEpoch();

      // Add receipts
      for (let i = 0; i < 3; i++) {
        const receipt = createComputeReceipt(createValidReceiptInput({
          model_passport_id: `model_${i}`,
          job_hash: `${'b'.repeat(62)}${i.toString().padStart(2, '0')}`,
        }));
        addReceiptToEpoch(receipt.run_id);
      }

      const result = await commitEpochRoot(epoch.epoch_id);

      expect(result.success).toBe(true);
      expect(result.signature).toMatch(/^mock_tx_/);
      expect(result.root).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should verify anchored epoch in mock mode', async () => {
      const epoch = getCurrentEpoch();

      const receipt = createComputeReceipt(createValidReceiptInput());
      addReceiptToEpoch(receipt.run_id);

      await commitEpochRoot(epoch.epoch_id);

      const verification = await verifyEpochAnchor(epoch.epoch_id);

      expect(verification.valid).toBe(true);
      expect(verification.on_chain_root).toBe(verification.expected_root);
    });

    it('should reject empty epoch', async () => {
      const epoch = createEpoch();
      
      const result = await commitEpochRoot(epoch.epoch_id);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty epoch');
    });

    it('should check anchoring health', async () => {
      const health = await checkAnchoringHealth();
      
      expect(health.mock_mode).toBe(true);
      expect(health.connected).toBe(true);
      expect(health.network).toBe('devnet');
    });
  });

  describe('6. Complete E2E Flow', () => {
    it('should execute complete quote → job → receipt → anchor flow', async () => {
      // 1. Create quote
      const quoteBody = createMockQuote();
      const quote_hash = computeQuoteHash(quoteBody);
      const fullQuote: OfferQuote = {
        ...quoteBody,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      expect(verifyQuoteHash(fullQuote)).toBe(true);
      
      // 2. Create job bound to quote
      const jobBody = createMockJob(fullQuote);
      const job_hash = computeJobHash(
        jobBody.job_id,
        jobBody.model_id,
        jobBody.offer_id,
        fullQuote.quote_hash,
        jobBody.input
      );
      const fullJob: JobRequest = {
        ...jobBody,
        job_hash,
      };
      
      expect(verifyJobHash(fullJob)).toBe(true);
      
      // 3. Simulate execution and create receipt
      const start_ts = Math.floor(Date.now() / 1000);
      const mockOutput = {
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello! I am doing well.' },
          finish_reason: 'stop',
        }],
      };
      const end_ts = Math.floor(Date.now() / 1000);
      
      const outputs_hash = computeOutputsHash(mockOutput);
      
      const receipt = createComputeReceipt({
        run_id: fullJob.job_id, // Use job_id for traceability
        model_passport_id: fullJob.model_id,
        compute_passport_id: fullJob.offer_id,
        policy_hash: fullQuote.policy_hash,
        runtime: 'hf-inference-api',
        tokens_in: 10,
        tokens_out: 15,
        ttft_ms: 200,
        trace_id: fullJob.trace_id,
        // v0 fields
        execution_mode: 'managed_endpoint',
        job_hash: fullJob.job_hash,
        quote_hash: fullQuote.quote_hash,
        node_id: 'worker-sim-hf-test',
        runtime_hash: null,
        gpu_fingerprint: null,
        outputs_hash,
        output_ref: 's3://test-bucket/outputs/' + fullJob.job_id + '.json',
        start_ts,
        end_ts,
        total_latency_ms: (end_ts - start_ts) * 1000 + 200,
        cache_hit: false,
      }, 'worker');
      
      // Verify receipt
      const receiptVerification = verifyComputeReceipt(receipt.run_id);
      expect(receiptVerification.hash_valid).toBe(true);
      expect(receiptVerification.signature_valid).toBe(true);
      
      // 4. Add receipt to epoch
      addReceiptToEpoch(receipt.run_id);
      
      const epoch = getCurrentEpoch();
      expect(epoch.receipt_run_ids).toContain(receipt.run_id);
      
      // 5. Anchor epoch
      const anchorResult = await commitEpochRoot(epoch.epoch_id);
      
      expect(anchorResult.success).toBe(true);
      expect(anchorResult.signature).toBeDefined();
      
      // 6. Verify anchor
      const anchorVerification = await verifyEpochAnchor(epoch.epoch_id);
      expect(anchorVerification.valid).toBe(true);
      
      // 7. Check final epoch state
      const finalEpoch = getEpoch(epoch.epoch_id);
      expect(finalEpoch?.status).toBe('anchored');
      expect(finalEpoch?.chain_tx).toEqual({ 'solana-devnet': anchorResult.signature });
      
      console.log('✅ E2E Flow Complete:');
      console.log(`   Quote: ${fullQuote.quote_id}`);
      console.log(`   Job: ${fullJob.job_id}`);
      console.log(`   Receipt: ${receipt.run_id}`);
      console.log(`   Epoch: ${epoch.epoch_id}`);
      console.log(`   Anchor TX: ${anchorResult.signature}`);
    });
  });

  describe('7. Error Handling', () => {
    it('should create error receipt for failed jobs', () => {
      // Error receipts don't require outputs_hash when error_code is set
      const receipt = createComputeReceipt({
        model_passport_id: 'model_001',
        compute_passport_id: 'compute_001',
        policy_hash: 'a'.repeat(64),
        runtime: 'hf-inference-api',
        tokens_in: 100,
        tokens_out: 0,
        ttft_ms: 0,
        // Required v0 fields
        execution_mode: 'managed_endpoint',
        job_hash: 'b'.repeat(64),
        quote_hash: 'c'.repeat(64),
        // Note: outputs_hash NOT required when error_code is set
        node_id: 'worker-sim-hf-001',
        runtime_hash: null,
        gpu_fingerprint: null,
        // Error fields
        error_code: 'TIMEOUT', // Using v0.2 simplified error code
        error_message: 'Request timed out after 120 seconds',
        start_ts: Math.floor(Date.now() / 1000) - 120,
        end_ts: Math.floor(Date.now() / 1000),
      }, 'worker');

      expect(receipt.error_code).toBe('TIMEOUT');
      expect(receipt.error_message).toContain('timed out');
      expect(receipt.metrics.tokens_out).toBe(0);

      // Error receipts should still be valid
      const verification = verifyComputeReceipt(receipt.run_id);
      expect(verification.hash_valid).toBe(true);
    });

    it('should handle expired quote detection', () => {
      const expiredQuote = createMockQuote({
        expires_at: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
      });
      const quote_hash = computeQuoteHash(expiredQuote);
      const fullQuote: OfferQuote = {
        ...expiredQuote,
        quote_hash,
        quote_signature: 'mock_signature',
      };
      
      // Quote hash is still valid (it's the content that matters)
      expect(verifyQuoteHash(fullQuote)).toBe(true);
      
      // But expiration check would be done by the worker
      expect(fullQuote.expires_at < Math.floor(Date.now() / 1000)).toBe(true);
    });
  });

  describe('8. Statistics & Monitoring', () => {
    it('should track epoch statistics', async () => {
      // Create and anchor some epochs
      for (let e = 0; e < 3; e++) {
        const epoch = createEpoch();
        for (let r = 0; r < 5; r++) {
          const receipt = createComputeReceipt(createValidReceiptInput({
            model_passport_id: `model_${e}_${r}`,
            job_hash: `${'b'.repeat(60)}${e.toString().padStart(2, '0')}${r.toString().padStart(2, '0')}`,
          }));
          addReceiptToEpoch(receipt.run_id);
        }
        await commitEpochRoot(epoch.epoch_id);
      }

      const stats = getEpochStats();

      expect(stats.total_epochs).toBeGreaterThanOrEqual(3);
      expect(stats.anchored_epochs).toBeGreaterThanOrEqual(3);
      expect(stats.total_receipts_anchored).toBeGreaterThanOrEqual(15);
    });
  });
});
