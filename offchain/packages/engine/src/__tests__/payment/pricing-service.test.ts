jest.mock('../../db/pool', () => ({
  getClient: jest.fn(),
}));

import { getClient } from '../../db/pool';
import { PricingService } from '../../payment/pricingService';

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

(getClient as jest.Mock).mockResolvedValue(mockClient);

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
    jest.clearAllMocks();
    (getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('getPricing', () => {
    it('returns pricing for an existing passport', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            passport_id: 'passport-1',
            price_per_call: '1000',
            price_per_token: '50',
            price_subscription_hour: null,
            accepted_tokens: ['USDC', 'WETH'],
            accepted_chains: ['base', 'ethereum'],
            payout_address: '0xabc123',
            custom_split_bps: { compute: 7000, model: 2000, protocol: 1000 },
            updated_at: now,
          },
        ],
      });

      const result = await service.getPricing('passport-1');

      expect(result).toEqual({
        passport_id: 'passport-1',
        price_per_call: BigInt(1000),
        price_per_token: BigInt(50),
        price_subscription_hour: null,
        accepted_tokens: ['USDC', 'WETH'],
        accepted_chains: ['base', 'ethereum'],
        payout_address: '0xabc123',
        custom_split_bps: { compute: 7000, model: 2000, protocol: 1000 },
        updated_at: now,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM asset_pricing WHERE passport_id = $1',
        ['passport-1'],
      );
      expect(mockRelease).toHaveBeenCalled();
    });

    it('returns null for a non-existent passport', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getPricing('nonexistent');

      expect(result).toBeNull();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('defaults accepted_tokens to ["USDC"] and accepted_chains to ["base"] when null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            passport_id: 'passport-2',
            price_per_call: '500',
            price_per_token: null,
            price_subscription_hour: null,
            accepted_tokens: null,
            accepted_chains: null,
            payout_address: '0xdef456',
            custom_split_bps: null,
            updated_at: null,
          },
        ],
      });

      const result = await service.getPricing('passport-2');

      expect(result!.accepted_tokens).toEqual(['USDC']);
      expect(result!.accepted_chains).toEqual(['base']);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases client even when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.getPricing('passport-1')).rejects.toThrow('DB error');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('setPricing', () => {
    it('calls INSERT with ON CONFLICT for upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.setPricing({
        passport_id: 'passport-1',
        price_per_call: BigInt(1000),
        price_per_token: BigInt(50),
        payout_address: '0xabc123',
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
        custom_split_bps: { compute: 7000, model: 2000, protocol: 1000 },
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO asset_pricing');
      expect(sql).toContain('ON CONFLICT (passport_id) DO UPDATE');
      expect(params[0]).toBe('passport-1');
      expect(params[1]).toBe('1000');           // price_per_call as string
      expect(params[2]).toBe('50');             // price_per_token as string
      expect(params[3]).toBeNull();             // price_subscription_hour
      expect(params[4]).toEqual(['USDC']);
      expect(params[5]).toEqual(['base']);
      expect(params[6]).toBe('0xabc123');
      expect(params[7]).toBe(JSON.stringify({ compute: 7000, model: 2000, protocol: 1000 }));
      expect(mockRelease).toHaveBeenCalled();
    });

    it('uses default tokens and chains when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.setPricing({
        passport_id: 'passport-2',
        price_per_call: BigInt(500),
        payout_address: '0xdef456',
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[4]).toEqual(['USDC']);       // default accepted_tokens
      expect(params[5]).toEqual(['base']);        // default accepted_chains
      expect(params[7]).toBeNull();              // no custom_split_bps
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases client even when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.setPricing({
          passport_id: 'passport-1',
          payout_address: '0xabc123',
        }),
      ).rejects.toThrow('DB error');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('deletePricing', () => {
    it('returns true when a row is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.deletePricing('passport-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM asset_pricing WHERE passport_id = $1',
        ['passport-1'],
      );
      expect(mockRelease).toHaveBeenCalled();
    });

    it('returns false when no row is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.deletePricing('nonexistent');

      expect(result).toBe(false);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null });

      const result = await service.deletePricing('passport-1');

      expect(result).toBe(false);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases client even when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.deletePricing('passport-1')).rejects.toThrow('DB error');
      expect(mockRelease).toHaveBeenCalled();
    });
  });
});
