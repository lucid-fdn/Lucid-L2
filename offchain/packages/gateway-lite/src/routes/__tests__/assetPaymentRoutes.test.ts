import request from 'supertest';
import express from 'express';
import { createAssetPaymentRouter } from '../assetPaymentRoutes';

// Mock PricingService and RevenueService
const mockGetPricing = jest.fn();
const mockSetPricing = jest.fn();
const mockDeletePricing = jest.fn();
const mockGetRevenue = jest.fn();
const mockWithdraw = jest.fn();

jest.mock('../../../../engine/src/payment/pricingService', () => ({
  PricingService: jest.fn().mockImplementation(() => ({
    getPricing: mockGetPricing,
    setPricing: mockSetPricing,
    deletePricing: mockDeletePricing,
  })),
}));

jest.mock('../../../../engine/src/payment/revenueService', () => ({
  RevenueService: jest.fn().mockImplementation(() => ({
    getRevenue: mockGetRevenue,
    withdraw: mockWithdraw,
  })),
}));

describe('Asset Payment Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/assets', createAssetPaymentRouter());
    jest.clearAllMocks();
  });

  describe('GET /v1/assets/:passportId/pricing', () => {
    it('should return 200 with pricing data', async () => {
      mockGetPricing.mockResolvedValueOnce({
        passport_id: 'passport-123',
        price_per_call: 1000n,
        price_per_token: null,
        price_subscription_hour: null,
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
        payout_address: '0xabc',
        custom_split_bps: null,
      });

      const response = await request(app)
        .get('/v1/assets/passport-123/pricing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pricing.passport_id).toBe('passport-123');
      expect(response.body.pricing.price_per_call).toBe('1000');
      expect(mockGetPricing).toHaveBeenCalledWith('passport-123');
    });

    it('should return 200 with null pricing when not found', async () => {
      mockGetPricing.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/v1/assets/passport-999/pricing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pricing).toBeNull();
    });
  });

  describe('PUT /v1/assets/:passportId/pricing', () => {
    it('should return 200 when pricing is set', async () => {
      mockSetPricing.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .put('/v1/assets/passport-123/pricing')
        .send({
          price_per_call: '1000',
          payout_address: '0xabc',
          accepted_tokens: ['USDC'],
          accepted_chains: ['base'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSetPricing).toHaveBeenCalledWith(
        expect.objectContaining({
          passport_id: 'passport-123',
          payout_address: '0xabc',
        }),
      );
    });

    it('should return 400 when payout_address is missing', async () => {
      const response = await request(app)
        .put('/v1/assets/passport-123/pricing')
        .send({
          price_per_call: '1000',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('payout_address');
    });
  });

  describe('DELETE /v1/assets/:passportId/pricing', () => {
    it('should return 200 when pricing is deleted', async () => {
      mockDeletePricing.mockResolvedValueOnce(true);

      const response = await request(app)
        .delete('/v1/assets/passport-123/pricing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.deleted).toBe(true);
      expect(mockDeletePricing).toHaveBeenCalledWith('passport-123');
    });
  });

  describe('GET /v1/assets/:passportId/revenue', () => {
    it('should return 200 with revenue data', async () => {
      mockGetRevenue.mockResolvedValueOnce({
        total: 50000n,
        pending: 30000n,
        withdrawn: 20000n,
        token: 'USDC',
      });

      const response = await request(app)
        .get('/v1/assets/passport-123/revenue');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.revenue.total).toBe('50000');
      expect(response.body.revenue.pending).toBe('30000');
      expect(response.body.revenue.withdrawn).toBe('20000');
      expect(response.body.revenue.token).toBe('USDC');
    });
  });

  describe('POST /v1/assets/:passportId/withdraw', () => {
    it('should return 200 with withdrawal result', async () => {
      mockWithdraw.mockResolvedValueOnce({
        amount: 30000n,
        token: 'USDC',
      });

      const response = await request(app)
        .post('/v1/assets/passport-123/withdraw')
        .send({ token: 'USDC' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.withdrawal.amount).toBe('30000');
      expect(response.body.withdrawal.token).toBe('USDC');
      expect(mockWithdraw).toHaveBeenCalledWith('passport-123', 'USDC');
    });
  });
});
