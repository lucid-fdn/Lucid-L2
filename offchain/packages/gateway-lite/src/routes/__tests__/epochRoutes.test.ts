import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — before importing router
// ---------------------------------------------------------------------------

const mockCreateEpoch = jest.fn();
const mockGetCurrentEpoch = jest.fn();
const mockGetEpoch = jest.fn();
const mockListEpochs = jest.fn();
const mockGetEpochsReadyForFinalization = jest.fn();
const mockGetEpochStats = jest.fn();
const mockRetryEpoch = jest.fn();

jest.mock('../../../../engine/src/receipt/epochService', () => ({
  createEpoch: mockCreateEpoch,
  getCurrentEpoch: mockGetCurrentEpoch,
  getEpoch: mockGetEpoch,
  listEpochs: mockListEpochs,
  getEpochsReadyForFinalization: mockGetEpochsReadyForFinalization,
  getEpochStats: mockGetEpochStats,
  retryEpoch: mockRetryEpoch,
  EpochStatus: {},
}));

const mockCommitEpochRoot = jest.fn();
const mockCommitEpochRootsBatch = jest.fn();
const mockVerifyEpochAnchor = jest.fn();
const mockGetAnchorTransaction = jest.fn();
const mockCheckAnchoringHealth = jest.fn();

jest.mock('../../../../engine/src/receipt/anchoringService', () => ({
  commitEpochRoot: mockCommitEpochRoot,
  commitEpochRootsBatch: mockCommitEpochRootsBatch,
  verifyEpochAnchor: mockVerifyEpochAnchor,
  getAnchorTransaction: mockGetAnchorTransaction,
  checkAnchoringHealth: mockCheckAnchoringHealth,
}));

import { epochRouter } from '../core/epochRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(epochRouter);
  return app;
}

const SAMPLE_EPOCH = {
  epoch_id: 'epoch-001',
  project_id: 'proj-1',
  mmr_root: 'root123',
  leaf_count: 42,
  created_at: '2026-03-12T00:00:00Z',
  finalized_at: null,
  status: 'open',
  chain_tx: null,
  error: null,
  start_leaf_index: 0,
  end_leaf_index: 41,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Epoch Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  // =========================================================================
  // GET /v1/epochs/current
  // =========================================================================
  describe('GET /v1/epochs/current', () => {
    it('should return the current epoch', async () => {
      mockGetCurrentEpoch.mockReturnValue(SAMPLE_EPOCH);

      const res = await request(buildApp()).get('/v1/epochs/current');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.epoch.epoch_id).toBe('epoch-001');
      expect(res.body.epoch.status).toBe('open');
    });

    it('should pass project_id query param when provided', async () => {
      mockGetCurrentEpoch.mockReturnValue(SAMPLE_EPOCH);

      await request(buildApp()).get('/v1/epochs/current?project_id=proj-2');

      expect(mockGetCurrentEpoch).toHaveBeenCalledWith('proj-2');
    });

    it('should return 500 when service throws', async () => {
      mockGetCurrentEpoch.mockImplementation(() => {
        throw new Error('no epoch');
      });

      const res = await request(buildApp()).get('/v1/epochs/current');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/epochs/stats
  // =========================================================================
  describe('GET /v1/epochs/stats', () => {
    it('should return epoch statistics', async () => {
      const stats = { total: 10, open: 1, anchored: 8, failed: 1 };
      mockGetEpochStats.mockReturnValue(stats);

      const res = await request(buildApp()).get('/v1/epochs/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toEqual(stats);
    });
  });

  // =========================================================================
  // GET /v1/epochs/ready
  // =========================================================================
  describe('GET /v1/epochs/ready', () => {
    it('should return epochs ready for finalization', async () => {
      mockGetEpochsReadyForFinalization.mockReturnValue([SAMPLE_EPOCH]);

      const res = await request(buildApp()).get('/v1/epochs/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.epochs[0].epoch_id).toBe('epoch-001');
    });

    it('should return empty array when none ready', async () => {
      mockGetEpochsReadyForFinalization.mockReturnValue([]);

      const res = await request(buildApp()).get('/v1/epochs/ready');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.epochs).toEqual([]);
    });
  });

  // =========================================================================
  // GET /v1/epochs/:epoch_id
  // =========================================================================
  describe('GET /v1/epochs/:epoch_id', () => {
    it('should return an epoch by ID', async () => {
      mockGetEpoch.mockReturnValue(SAMPLE_EPOCH);

      const res = await request(buildApp()).get('/v1/epochs/epoch-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.epoch.epoch_id).toBe('epoch-001');
      expect(res.body.epoch.chain_tx).toBeNull();
    });

    it('should return 404 when epoch not found', async () => {
      mockGetEpoch.mockReturnValue(null);

      const res = await request(buildApp()).get('/v1/epochs/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Epoch not found');
    });
  });

  // =========================================================================
  // GET /v1/epochs (list)
  // =========================================================================
  describe('GET /v1/epochs', () => {
    it('should return paginated list of epochs', async () => {
      mockListEpochs.mockReturnValue({
        epochs: [SAMPLE_EPOCH],
        total: 1,
        page: 1,
        per_page: 20,
        total_pages: 1,
      });

      const res = await request(buildApp()).get('/v1/epochs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.epochs).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should pass filtering params to service', async () => {
      mockListEpochs.mockReturnValue({
        epochs: [],
        total: 0,
        page: 2,
        per_page: 10,
        total_pages: 0,
      });

      await request(buildApp()).get(
        '/v1/epochs?status=anchored&project_id=proj-1&page=2&per_page=10'
      );

      expect(mockListEpochs).toHaveBeenCalledWith({
        status: 'anchored',
        project_id: 'proj-1',
        page: 2,
        per_page: 10,
      });
    });
  });

  // =========================================================================
  // POST /v1/epochs
  // =========================================================================
  describe('POST /v1/epochs', () => {
    it('should create a new epoch', async () => {
      mockCreateEpoch.mockReturnValue(SAMPLE_EPOCH);

      const res = await request(buildApp())
        .post('/v1/epochs')
        .send({ project_id: 'proj-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.epoch.epoch_id).toBe('epoch-001');
      expect(mockCreateEpoch).toHaveBeenCalledWith('proj-1');
    });

    it('should create epoch without project_id', async () => {
      mockCreateEpoch.mockReturnValue(SAMPLE_EPOCH);

      const res = await request(buildApp()).post('/v1/epochs').send({});

      expect(res.status).toBe(201);
      expect(mockCreateEpoch).toHaveBeenCalledWith(undefined);
    });
  });

  // =========================================================================
  // POST /v1/epochs/:epoch_id/retry
  // =========================================================================
  describe('POST /v1/epochs/:epoch_id/retry', () => {
    it('should retry a failed epoch', async () => {
      mockRetryEpoch.mockReturnValue({ epoch_id: 'epoch-002', status: 'open' });

      const res = await request(buildApp()).post('/v1/epochs/epoch-002/retry');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.epoch.status).toBe('open');
    });

    it('should return 400 when epoch not retryable', async () => {
      mockRetryEpoch.mockReturnValue(null);

      const res = await request(buildApp()).post('/v1/epochs/epoch-003/retry');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found or not in failed state');
    });
  });

  // =========================================================================
  // POST /v1/receipts/commit-root
  // =========================================================================
  describe('POST /v1/receipts/commit-root', () => {
    it('should commit a specific epoch by epoch_id', async () => {
      mockCommitEpochRoot.mockResolvedValue({
        success: true,
        epoch_id: 'epoch-001',
        root: 'root123',
        signature: 'sig1',
      });

      const res = await request(buildApp())
        .post('/v1/receipts/commit-root')
        .send({ epoch_id: 'epoch-001' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.tx).toBe('sig1');
    });

    it('should return 503 when commit fails', async () => {
      mockCommitEpochRoot.mockResolvedValue({
        success: false,
        error: 'chain unavailable',
        epoch_id: 'epoch-001',
        root: 'root123',
      });

      const res = await request(buildApp())
        .post('/v1/receipts/commit-root')
        .send({ epoch_id: 'epoch-001' });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('chain unavailable');
    });

    it('should return 400 when current epoch is empty and not forced', async () => {
      mockGetCurrentEpoch.mockReturnValue({ ...SAMPLE_EPOCH, leaf_count: 0 });
      mockGetEpochsReadyForFinalization.mockReturnValue([]);

      const res = await request(buildApp())
        .post('/v1/receipts/commit-root')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Current epoch is empty');
    });
  });

  // =========================================================================
  // POST /v1/receipts/commit-roots-batch
  // =========================================================================
  describe('POST /v1/receipts/commit-roots-batch', () => {
    it('should reject missing epoch_ids', async () => {
      const res = await request(buildApp())
        .post('/v1/receipts/commit-roots-batch')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('epoch_ids array is required');
    });

    it('should reject more than 16 epochs', async () => {
      const ids = Array.from({ length: 17 }, (_, i) => `epoch-${i}`);
      const res = await request(buildApp())
        .post('/v1/receipts/commit-roots-batch')
        .send({ epoch_ids: ids });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Maximum 16 epochs per batch');
    });

    it('should batch commit successfully', async () => {
      mockCommitEpochRootsBatch.mockResolvedValue([
        { success: true, epoch_id: 'e1', root: 'r1', signature: 's1' },
        { success: true, epoch_id: 'e2', root: 'r2', signature: 's2' },
      ]);

      const res = await request(buildApp())
        .post('/v1/receipts/commit-roots-batch')
        .send({ epoch_ids: ['e1', 'e2'] });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.successful_count).toBe(2);
      expect(res.body.failed_count).toBe(0);
    });
  });

  // =========================================================================
  // GET /v1/epochs/:epoch_id/verify
  // =========================================================================
  describe('GET /v1/epochs/:epoch_id/verify', () => {
    it('should return verification result', async () => {
      mockVerifyEpochAnchor.mockResolvedValue({
        valid: true,
        on_chain_root: 'root123',
        expected_root: 'root123',
        tx_signature: 'tx1',
        error: null,
      });

      const res = await request(buildApp()).get('/v1/epochs/epoch-001/verify');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.tx_signature).toBe('tx1');
    });
  });

  // =========================================================================
  // GET /v1/epochs/:epoch_id/transaction
  // =========================================================================
  describe('GET /v1/epochs/:epoch_id/transaction', () => {
    it('should return transaction details', async () => {
      mockGetAnchorTransaction.mockResolvedValue({
        found: true,
        tx_signature: 'tx1',
        slot: 12345,
        block_time: 1710000000,
      });

      const res = await request(buildApp()).get('/v1/epochs/epoch-001/transaction');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.slot).toBe(12345);
    });

    it('should return 404 when transaction not found', async () => {
      mockGetAnchorTransaction.mockResolvedValue({
        found: false,
        error: 'No tx for this epoch',
      });

      const res = await request(buildApp()).get('/v1/epochs/epoch-001/transaction');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/anchoring/health
  // =========================================================================
  describe('GET /v1/anchoring/health', () => {
    it('should return 200 when healthy', async () => {
      mockCheckAnchoringHealth.mockResolvedValue({
        connected: true,
        latency_ms: 50,
      });

      const res = await request(buildApp()).get('/v1/anchoring/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.connected).toBe(true);
    });

    it('should return 503 when unhealthy', async () => {
      mockCheckAnchoringHealth.mockResolvedValue({
        connected: false,
        error: 'connection refused',
      });

      const res = await request(buildApp()).get('/v1/anchoring/health');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.connected).toBe(false);
    });
  });
});
