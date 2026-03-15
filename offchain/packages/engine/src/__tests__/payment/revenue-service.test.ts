jest.mock('../../shared/db/pool', () => ({
  getClient: jest.fn(),
}));

import { getClient } from '../../shared/db/pool';
import { RevenueService } from '../../payment/services/revenueService';

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

(getClient as jest.Mock).mockResolvedValue(mockClient);

describe('RevenueService', () => {
  let service: RevenueService;

  beforeEach(() => {
    service = new RevenueService();
    jest.clearAllMocks();
    (getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  // ---------------------------------------------------------------------------
  // recordRevenue
  // ---------------------------------------------------------------------------
  describe('recordRevenue', () => {
    it('inserts a row into asset_revenue', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.recordRevenue({
        passport_id: 'passport-1',
        run_id: 'run-42',
        amount: BigInt(5000),
        token: 'USDC',
        chain: 'base',
        role: 'compute',
        tx_hash: '0xabc',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO asset_revenue');
      expect(params[0]).toBe('passport-1');
      expect(params[1]).toBe('run-42');
      expect(params[2]).toBe('5000');        // bigint serialised as string
      expect(params[3]).toBe('USDC');
      expect(params[4]).toBe('base');
      expect(params[5]).toBe('compute');
      expect(params[6]).toBe('0xabc');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('passes null when tx_hash is omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.recordRevenue({
        passport_id: 'passport-2',
        run_id: 'run-99',
        amount: BigInt(100),
        token: 'WETH',
        chain: 'ethereum',
        role: 'model',
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[6]).toBeNull();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases client even when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('insert failed'));

      await expect(
        service.recordRevenue({
          passport_id: 'p',
          run_id: 'r',
          amount: BigInt(1),
          token: 'USDC',
          chain: 'base',
          role: 'protocol',
        }),
      ).rejects.toThrow('insert failed');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getRevenue
  // ---------------------------------------------------------------------------
  describe('getRevenue', () => {
    it('returns aggregated totals', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10000', pending: '7000', withdrawn: '3000' }],
      });

      const info = await service.getRevenue('passport-1', 'USDC');

      expect(info).toEqual({
        total: BigInt(10000),
        pending: BigInt(7000),
        withdrawn: BigInt(3000),
        token: 'USDC',
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('asset_revenue');
      expect(params).toEqual(['passport-1', 'USDC']);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('defaults token to USDC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0', pending: '0', withdrawn: '0' }],
      });

      const info = await service.getRevenue('passport-1');

      expect(info.token).toBe('USDC');
      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe('USDC');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases client even when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('select failed'));

      await expect(service.getRevenue('passport-1')).rejects.toThrow('select failed');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // withdraw
  // ---------------------------------------------------------------------------
  describe('withdraw', () => {
    it('uses BEGIN/COMMIT and returns the withdrawn amount', async () => {
      // BEGIN
      mockQuery.mockResolvedValueOnce({});
      // SELECT SUM
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '8000' }] });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });
      // COMMIT
      mockQuery.mockResolvedValueOnce({});

      const result = await service.withdraw('passport-1', 'USDC');

      expect(result).toEqual({ amount: BigInt(8000), token: 'USDC', status: 'pending_payout' });

      // Verify transaction flow
      expect(mockQuery).toHaveBeenCalledTimes(4);
      expect(mockQuery.mock.calls[0][0]).toBe('BEGIN');
      expect(mockQuery.mock.calls[1][0]).toContain('SUM(amount)');
      expect(mockQuery.mock.calls[2][0]).toContain('UPDATE asset_revenue');
      expect(mockQuery.mock.calls[3][0]).toBe('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('skips UPDATE when pending amount is zero', async () => {
      // BEGIN
      mockQuery.mockResolvedValueOnce({});
      // SELECT SUM — nothing pending
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // COMMIT
      mockQuery.mockResolvedValueOnce({});

      const result = await service.withdraw('passport-1');

      expect(result).toEqual({ amount: BigInt(0), token: 'USDC', status: 'no_funds' });
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[0][0]).toBe('BEGIN');
      expect(mockQuery.mock.calls[2][0]).toBe('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('rolls back on error and re-throws', async () => {
      // BEGIN
      mockQuery.mockResolvedValueOnce({});
      // SELECT SUM throws
      mockQuery.mockRejectedValueOnce(new Error('db crash'));
      // ROLLBACK
      mockQuery.mockResolvedValueOnce({});

      await expect(service.withdraw('passport-1')).rejects.toThrow('db crash');

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('defaults token to USDC', async () => {
      mockQuery.mockResolvedValueOnce({});
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({});

      const result = await service.withdraw('passport-1');

      expect(result.token).toBe('USDC');
      expect(mockRelease).toHaveBeenCalled();
    });
  });
});
