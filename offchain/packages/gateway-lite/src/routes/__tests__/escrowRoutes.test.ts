import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — before importing the router
// ---------------------------------------------------------------------------

const mockGetAdapter = jest.fn();
const mockGetAccount = jest.fn();
const mockCreateEscrow = jest.fn();
const mockReleaseEscrow = jest.fn();
const mockDisputeEscrow = jest.fn();

jest.mock('../../../../engine/src/shared/chains/factory', () => ({
  blockchainAdapterFactory: {
    getAdapter: mockGetAdapter,
  },
}));

const mockGetEscrow = jest.fn();

jest.mock('../../../../engine/src/payment/escrow/escrowService', () => ({
  getEscrowService: () => ({
    getEscrow: mockGetEscrow,
  }),
}));

import { escrowRouter } from '../chain/escrowRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(escrowRouter);
  return app;
}

/** Wire up the mock adapter so it returns an escrow sub-interface */
function setupMockAdapter() {
  const adapterMock = {
    getAccount: mockGetAccount,
    escrow: () => ({
      createEscrow: mockCreateEscrow,
      releaseEscrow: mockReleaseEscrow,
      disputeEscrow: mockDisputeEscrow,
    }),
  };
  mockGetAdapter.mockResolvedValue(adapterMock);
  mockGetAccount.mockResolvedValue({ address: '0xpayer' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Escrow Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMockAdapter();
  });

  // =========================================================================
  // POST /v2/escrow/create
  // =========================================================================
  describe('POST /v2/escrow/create', () => {
    const VALID_INPUT = {
      chainId: 'base',
      beneficiary: '0xbeneficiary',
      token: 'USDC',
      amount: '10000',
      duration: 3600,
    };

    it('should create an escrow successfully', async () => {
      mockCreateEscrow.mockResolvedValue({
        escrowId: 'esc-1',
        tx: { hash: '0xtx1' },
      });

      const res = await request(buildApp())
        .post('/v2/escrow/create')
        .send(VALID_INPUT);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.escrowId).toBe('esc-1');
      expect(res.body.txHash).toBe('0xtx1');
      expect(mockGetAdapter).toHaveBeenCalledWith('base');
      expect(mockCreateEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          payer: '0xpayer',
          payee: '0xbeneficiary',
          amount: '10000',
          timeoutSeconds: 3600,
        })
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(buildApp())
        .post('/v2/escrow/create')
        .send({ chainId: 'base' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 when chainId is missing', async () => {
      const res = await request(buildApp())
        .post('/v2/escrow/create')
        .send({ beneficiary: '0xb', token: 'USDC', amount: '100', duration: 60 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when adapter throws', async () => {
      mockGetAdapter.mockRejectedValue(new Error('Unknown chain'));

      const res = await request(buildApp())
        .post('/v2/escrow/create')
        .send(VALID_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unknown chain');
    });

    it('should return 400 when on-chain call fails', async () => {
      mockCreateEscrow.mockRejectedValue(new Error('Insufficient funds'));

      const res = await request(buildApp())
        .post('/v2/escrow/create')
        .send(VALID_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient funds');
    });
  });

  // =========================================================================
  // POST /v2/escrow/release
  // =========================================================================
  describe('POST /v2/escrow/release', () => {
    const VALID_INPUT = {
      chainId: 'base',
      escrowId: 'esc-1',
      receiptHash: 'hash123',
      signature: 'sig123',
    };

    it('should release an escrow successfully', async () => {
      mockReleaseEscrow.mockResolvedValue({ hash: '0xtx2' });

      const res = await request(buildApp())
        .post('/v2/escrow/release')
        .send(VALID_INPUT);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.txHash).toBe('0xtx2');
      expect(mockReleaseEscrow).toHaveBeenCalledWith('esc-1', 'hash123', 'sig123');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(buildApp())
        .post('/v2/escrow/release')
        .send({ chainId: 'base' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 when release fails on-chain', async () => {
      mockReleaseEscrow.mockRejectedValue(new Error('Escrow expired'));

      const res = await request(buildApp())
        .post('/v2/escrow/release')
        .send(VALID_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Escrow expired');
    });
  });

  // =========================================================================
  // POST /v2/escrow/dispute
  // =========================================================================
  describe('POST /v2/escrow/dispute', () => {
    const VALID_INPUT = {
      chainId: 'base',
      escrowId: 'esc-1',
      reason: 'Inference was incorrect',
    };

    it('should dispute an escrow successfully', async () => {
      mockDisputeEscrow.mockResolvedValue({ hash: '0xtx3' });

      const res = await request(buildApp())
        .post('/v2/escrow/dispute')
        .send(VALID_INPUT);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.txHash).toBe('0xtx3');
      expect(mockDisputeEscrow).toHaveBeenCalledWith('esc-1', 'Inference was incorrect');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(buildApp())
        .post('/v2/escrow/dispute')
        .send({ chainId: 'base', escrowId: 'esc-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 when dispute fails', async () => {
      mockDisputeEscrow.mockRejectedValue(new Error('Not disputable'));

      const res = await request(buildApp())
        .post('/v2/escrow/dispute')
        .send(VALID_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Not disputable');
    });
  });

  // =========================================================================
  // GET /v2/escrow/:chainId/:escrowId
  // =========================================================================
  describe('GET /v2/escrow/:chainId/:escrowId', () => {
    it('should return escrow details when found', async () => {
      mockGetEscrow.mockResolvedValue({
        escrowId: 'esc-1',
        payer: '0xpayer',
        payee: '0xpayee',
        amount: '10000',
        status: 'active',
      });

      const res = await request(buildApp()).get('/v2/escrow/base/esc-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.escrow.escrowId).toBe('esc-1');
      expect(res.body.escrow.status).toBe('active');
      expect(mockGetEscrow).toHaveBeenCalledWith('esc-1');
    });

    it('should return 404 when escrow not found', async () => {
      mockGetEscrow.mockResolvedValue(null);

      const res = await request(buildApp()).get('/v2/escrow/base/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Escrow not found');
    });

    it('should return 400 when service throws', async () => {
      mockGetEscrow.mockRejectedValue(new Error('DB connection lost'));

      const res = await request(buildApp()).get('/v2/escrow/base/esc-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('DB connection lost');
    });
  });
});
