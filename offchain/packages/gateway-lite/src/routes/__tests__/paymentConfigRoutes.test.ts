import request from 'supertest';
import express from 'express';
import { createPaymentConfigRouter } from '../paymentConfigRoutes';

// Mock x402 middleware
const mockGetX402Config = jest.fn();
const mockGetFacilitatorRegistry = jest.fn();

jest.mock('../../middleware/x402', () => ({
  getX402Config: (...args: unknown[]) => mockGetX402Config(...args),
  getFacilitatorRegistry: (...args: unknown[]) => mockGetFacilitatorRegistry(...args),
}));

// Mock adminAuth middleware — always allow for tests
jest.mock('../../middleware/adminAuth', () => ({
  verifyAdminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('Payment Config Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/config', createPaymentConfigRouter());
    jest.clearAllMocks();
  });

  describe('GET /v1/config/payment', () => {
    it('should return 200 with payment config', async () => {
      mockGetX402Config.mockReturnValue({
        enabled: true,
        paymentChain: 'base-sepolia',
        paymentAddress: '0xabc',
        defaultPriceUSDC: '0.01',
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        maxProofAge: 300,
      });

      const mockFacilitator = {
        name: 'direct',
        supportedChains: [{ name: 'base-sepolia', rpcUrl: 'https://rpc.base-sepolia.org' }],
        supportedTokens: [{ symbol: 'USDC', address: '0x036C', decimals: 6, chain: 'base-sepolia' }],
      };

      mockGetFacilitatorRegistry.mockReturnValue({
        getDefault: () => mockFacilitator,
      });

      const response = await request(app)
        .get('/v1/config/payment');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.config.enabled).toBe(true);
      expect(response.body.config.facilitator).toBe('direct');
      expect(response.body.config.supportedChains).toHaveLength(1);
      expect(response.body.config.supportedTokens).toHaveLength(1);
    });

    it('should return config with null facilitator when registry is not set', async () => {
      mockGetX402Config.mockReturnValue({
        enabled: false,
        paymentChain: 'base-sepolia',
        paymentAddress: '0x0000',
        defaultPriceUSDC: '0.01',
      });
      mockGetFacilitatorRegistry.mockReturnValue(null);

      const response = await request(app)
        .get('/v1/config/payment');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.config.facilitator).toBeNull();
    });
  });

  describe('PUT /v1/config/facilitator', () => {
    it('should return 200 when facilitator is changed', async () => {
      const mockRegistry = {
        setDefault: jest.fn(),
      };
      mockGetFacilitatorRegistry.mockReturnValue(mockRegistry);

      const response = await request(app)
        .put('/v1/config/facilitator')
        .send({ name: 'coinbase' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilitator).toBe('coinbase');
      expect(mockRegistry.setDefault).toHaveBeenCalledWith('coinbase');
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .put('/v1/config/facilitator')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should return 500 when registry is not configured', async () => {
      mockGetFacilitatorRegistry.mockReturnValue(null);

      const response = await request(app)
        .put('/v1/config/facilitator')
        .send({ name: 'coinbase' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('FacilitatorRegistry');
    });
  });

  describe('GET /v1/config/chains', () => {
    it('should return 200 with chains and tokens', async () => {
      const mockFacilitator = {
        name: 'direct',
        supportedChains: [
          { name: 'base', rpcUrl: 'https://mainnet.base.org' },
          { name: 'base-sepolia', rpcUrl: 'https://sepolia.base.org' },
        ],
        supportedTokens: [
          { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' },
        ],
      };

      mockGetFacilitatorRegistry.mockReturnValue({
        getDefault: () => mockFacilitator,
      });

      const response = await request(app)
        .get('/v1/config/chains');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilitator).toBe('direct');
      expect(response.body.chains).toHaveLength(2);
      expect(response.body.tokens).toHaveLength(1);
    });

    it('should return empty arrays when registry is not set', async () => {
      mockGetFacilitatorRegistry.mockReturnValue(null);

      const response = await request(app)
        .get('/v1/config/chains');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.chains).toEqual([]);
      expect(response.body.tokens).toEqual([]);
    });
  });
});
