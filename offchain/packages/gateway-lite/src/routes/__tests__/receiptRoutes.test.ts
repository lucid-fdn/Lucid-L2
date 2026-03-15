import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — must come before importing the router
// ---------------------------------------------------------------------------

const mockCreateInferenceReceipt = jest.fn();
const mockGetInferenceReceipt = jest.fn();
const mockGetInferenceReceiptAsync = jest.fn();
const mockVerifyInferenceReceipt = jest.fn();
const mockGetInferenceReceiptProof = jest.fn();
const mockGetInferenceReceiptProofAsync = jest.fn();
const mockGetMmrRoot = jest.fn();
const mockGetMmrLeafCount = jest.fn();
const mockGetSignerPublicKey = jest.fn();
const mockListInferenceReceipts = jest.fn();
const mockListComputeReceipts = jest.fn();
const mockVerifyComputeReceipt = jest.fn();

jest.mock('../../../../engine/src/receipt/receiptService', () => ({
  createInferenceReceipt: mockCreateInferenceReceipt,
  getInferenceReceipt: mockGetInferenceReceipt,
  getInferenceReceiptAsync: mockGetInferenceReceiptAsync,
  verifyInferenceReceiptHash: jest.fn(),
  verifyInferenceReceipt: mockVerifyInferenceReceipt,
  getInferenceReceiptProof: mockGetInferenceReceiptProof,
  getInferenceReceiptProofAsync: mockGetInferenceReceiptProofAsync,
  getMmrRoot: mockGetMmrRoot,
  getMmrLeafCount: mockGetMmrLeafCount,
  getSignerPublicKey: mockGetSignerPublicKey,
  listInferenceReceipts: mockListInferenceReceipts,
  listComputeReceipts: mockListComputeReceipts,
  getComputeReceipt: jest.fn(),
  verifyComputeReceipt: mockVerifyComputeReceipt,
}));

const mockGetAllEpochs = jest.fn();
const mockAddReceiptToEpoch = jest.fn();

jest.mock('../../../../engine/src/epoch/services/epochService', () => ({
  getAllEpochs: mockGetAllEpochs,
  addReceiptToEpoch: mockAddReceiptToEpoch,
}));

import { receiptRouter } from '../core/receiptRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(receiptRouter);
  return app;
}

const VALID_RECEIPT_INPUT = {
  model_passport_id: 'model-1',
  compute_passport_id: 'compute-1',
  policy_hash: 'abc123',
  runtime: 'vllm',
  tokens_in: 100,
  tokens_out: 200,
  ttft_ms: 50,
};

const SAMPLE_RECEIPT = {
  run_id: 'run-001',
  receipt_hash: 'a'.repeat(64),
  model_passport_id: 'model-1',
  compute_passport_id: 'compute-1',
  signer_pubkey: 'pubkey123',
  signer_type: 'orchestrator',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Receipt Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  // =========================================================================
  // POST /v1/receipts
  // =========================================================================
  describe('POST /v1/receipts', () => {
    it('should create a receipt and return it', async () => {
      mockCreateInferenceReceipt.mockReturnValue(SAMPLE_RECEIPT);
      mockAddReceiptToEpoch.mockReturnValue(undefined);

      const res = await request(buildApp())
        .post('/v1/receipts')
        .send(VALID_RECEIPT_INPUT);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receipt.run_id).toBe('run-001');
      expect(mockCreateInferenceReceipt).toHaveBeenCalledWith(VALID_RECEIPT_INPUT);
      expect(mockAddReceiptToEpoch).toHaveBeenCalledWith('run-001');
    });

    it.each([
      'model_passport_id',
      'compute_passport_id',
      'policy_hash',
      'runtime',
      'tokens_in',
      'tokens_out',
      'ttft_ms',
    ])('should return 400 when %s is missing', async (field) => {
      const input = { ...VALID_RECEIPT_INPUT, [field]: undefined };

      const res = await request(buildApp())
        .post('/v1/receipts')
        .send(input);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain(field);
    });

    it('should return 500 when createInferenceReceipt throws', async () => {
      mockCreateInferenceReceipt.mockImplementation(() => {
        throw new Error('crypto failure');
      });

      const res = await request(buildApp())
        .post('/v1/receipts')
        .send(VALID_RECEIPT_INPUT);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('crypto failure');
    });
  });

  // =========================================================================
  // GET /v1/receipts/:receipt_id
  // =========================================================================
  describe('GET /v1/receipts/:receipt_id', () => {
    it('should return a receipt when found', async () => {
      mockGetInferenceReceipt.mockReturnValue(SAMPLE_RECEIPT);

      const res = await request(buildApp()).get('/v1/receipts/run-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receipt.run_id).toBe('run-001');
      expect(mockGetInferenceReceipt).toHaveBeenCalledWith('run-001');
    });

    it('should return 404 when receipt not found', async () => {
      mockGetInferenceReceipt.mockReturnValue(null);

      const res = await request(buildApp()).get('/v1/receipts/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Receipt not found');
    });

    it('should return 500 when service throws', async () => {
      mockGetInferenceReceipt.mockImplementation(() => {
        throw new Error('db read error');
      });

      const res = await request(buildApp()).get('/v1/receipts/run-001');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/receipts/:receipt_id/verify
  // =========================================================================
  describe('GET /v1/receipts/:receipt_id/verify', () => {
    it('should return valid verification result', async () => {
      mockVerifyInferenceReceipt.mockReturnValue({
        hash_valid: true,
        signature_valid: true,
        inclusion_valid: true,
        expected_hash: 'aaa',
        computed_hash: 'aaa',
        merkle_root: 'root1',
      });

      const res = await request(buildApp()).get('/v1/receipts/run-001/verify');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.hash_valid).toBe(true);
      expect(res.body.signature_valid).toBe(true);
    });

    it('should return 404 when receipt not found (hash_valid false, no expected_hash)', async () => {
      mockVerifyInferenceReceipt.mockReturnValue({
        hash_valid: false,
        signature_valid: false,
        expected_hash: undefined,
      });

      const res = await request(buildApp()).get('/v1/receipts/nonexistent/verify');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return invalid when hash or signature fails', async () => {
      mockVerifyInferenceReceipt.mockReturnValue({
        hash_valid: true,
        signature_valid: false,
        expected_hash: 'aaa',
        computed_hash: 'bbb',
      });

      const res = await request(buildApp()).get('/v1/receipts/run-001/verify');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.hash_valid).toBe(true);
      expect(res.body.signature_valid).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/receipts/:receipt_id/proof
  // =========================================================================
  describe('GET /v1/receipts/:receipt_id/proof', () => {
    it('should return MMR proof when available', async () => {
      mockGetInferenceReceipt.mockReturnValue(SAMPLE_RECEIPT);
      mockGetInferenceReceiptAsync.mockResolvedValue(null); // not needed, sync found it
      mockGetInferenceReceiptProofAsync.mockResolvedValue({
        leafIndex: 0,
        leafHash: 'leaf1',
        siblings: ['sib1'],
        peaks: ['peak1'],
        mmrSize: 3,
        root: 'root1',
      });

      const res = await request(buildApp()).get('/v1/receipts/run-001/proof');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.proof.proof_type).toBe('mmr');
      expect(res.body.proof.run_id).toBe('run-001');
      expect(res.body.proof.leaf_index).toBe(0);
      expect(res.body.proof.leaf_hash).toBe('leaf1');
      expect(res.body.proof.siblings).toEqual(['sib1']);
      expect(res.body.proof.peaks).toEqual(['peak1']);
      expect(res.body.proof.mmr_size).toBe(3);
    });

    it('should return 404 when receipt not found', async () => {
      mockGetInferenceReceipt.mockReturnValue(null);
      mockGetInferenceReceiptAsync.mockResolvedValue(null);

      const res = await request(buildApp()).get('/v1/receipts/nonexistent/proof');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Receipt not found');
    });

    it('should return 404 when no proof is available', async () => {
      mockGetInferenceReceipt.mockReturnValue(SAMPLE_RECEIPT);
      mockGetInferenceReceiptProofAsync.mockResolvedValue(null);

      const res = await request(buildApp()).get('/v1/receipts/run-001/proof');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No proof available for this receipt');
    });
  });

  // =========================================================================
  // GET /v1/verify/:receipt_hash — hash-based verification
  // =========================================================================
  describe('GET /v1/verify/:receipt_hash', () => {
    const VALID_HASH = 'a'.repeat(64);

    it('should return 400 for invalid hash format', async () => {
      const res = await request(buildApp()).get('/v1/verify/tooshort');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid receipt_hash format');
    });

    it('should return 404 when receipt not found by hash', async () => {
      mockListInferenceReceipts.mockReturnValue([]);
      mockListComputeReceipts.mockReturnValue([]);

      const res = await request(buildApp()).get(`/v1/verify/${VALID_HASH}`);

      expect(res.status).toBe(404);
      expect(res.body.verified).toBe(false);
    });

    it('should verify a regular receipt found by hash', async () => {
      mockListInferenceReceipts.mockReturnValue([
        { ...SAMPLE_RECEIPT, receipt_hash: VALID_HASH },
      ]);
      mockVerifyInferenceReceipt.mockReturnValue({
        hash_valid: true,
        signature_valid: true,
      });
      mockGetInferenceReceiptProof.mockReturnValue(null);
      mockGetAllEpochs.mockReturnValue([]);

      const res = await request(buildApp()).get(`/v1/verify/${VALID_HASH}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(true);
      expect(res.body.hash_valid).toBe(true);
      expect(res.body.signature_valid).toBe(true);
      expect(res.body.on_chain_verified).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/mmr/root
  // =========================================================================
  describe('GET /v1/mmr/root', () => {
    it('should return MMR root and leaf count', async () => {
      mockGetMmrRoot.mockReturnValue('root_abc');
      mockGetMmrLeafCount.mockReturnValue(42);

      const res = await request(buildApp()).get('/v1/mmr/root');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.root).toBe('root_abc');
      expect(res.body.leaf_count).toBe(42);
    });
  });

  // =========================================================================
  // GET /v1/signer/pubkey
  // =========================================================================
  describe('GET /v1/signer/pubkey', () => {
    it('should return the signer public key', async () => {
      mockGetSignerPublicKey.mockReturnValue('ed25519_pubkey_hex');

      const res = await request(buildApp()).get('/v1/signer/pubkey');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.signer_type).toBe('orchestrator');
      expect(res.body.pubkey).toBe('ed25519_pubkey_hex');
    });
  });
});
