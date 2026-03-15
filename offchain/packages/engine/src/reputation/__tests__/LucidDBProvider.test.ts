jest.mock('../../shared/db/pool', () => {
  const mockQuery = jest.fn();
  return {
    __esModule: true,
    default: { query: mockQuery },
    pool: { query: mockQuery },
    getClient: jest.fn(),
  };
});

import pool from '../../shared/db/pool';
import { LucidDBProvider } from '../providers/LucidDBProvider';
import type { FeedbackParams, ValidationParams } from '../types';

const mockQuery = pool.query as jest.Mock;

describe('LucidDBProvider', () => {
  let provider: LucidDBProvider;

  beforeEach(() => {
    provider = new LucidDBProvider();
    mockQuery.mockReset();
  });

  it('providerName is lucid-db', () => {
    expect(provider.providerName).toBe('lucid-db');
  });

  describe('submitFeedback', () => {
    it('inserts feedback and returns success with id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'fb_1' }] });

      const params: FeedbackParams = {
        passportId: 'p1',
        score: 85,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'model',
        metadata: '{"note":"good"}',
      };

      const result = await provider.submitFeedback(params);

      expect(result.success).toBe(true);
      expect(result.id).toBe('fb_1');
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO reputation_feedback');

      const values = mockQuery.mock.calls[0][1];
      expect(values).toEqual([
        'p1',
        'local',
        85,
        'quality',
        'abc123',
        'model',
        '{"note":"good"}',
      ]);
    });

    it('returns success false on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db error'));

      const params: FeedbackParams = {
        passportId: 'p1',
        score: 50,
        category: 'speed',
        receiptHash: 'xyz',
        assetType: 'compute',
      };

      const result = await provider.submitFeedback(params);
      expect(result.success).toBe(false);
      expect(result.id).toBeUndefined();
    });
  });

  describe('readFeedback', () => {
    it('returns mapped feedback rows', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            passport_id: 'p1',
            from_address: 'local',
            score: 90,
            category: 'quality',
            receipt_hash: 'h1',
            asset_type: 'model',
            metadata: null,
            revoked: false,
            feedback_index: 0,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const data = await provider.readFeedback('p1');

      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        passportId: 'p1',
        from: 'local',
        score: 90,
        category: 'quality',
        receiptHash: 'h1',
        assetType: 'model',
        timestamp: new Date('2026-01-01T00:00:00Z').getTime(),
        revoked: false,
        index: 0,
      });
    });

    it('applies category filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await provider.readFeedback('p1', { category: 'speed' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('category = $2');

      const values = mockQuery.mock.calls[0][1];
      expect(values[0]).toBe('p1');
      expect(values[1]).toBe('speed');
    });

    it('applies assetType filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await provider.readFeedback('p1', { assetType: 'tool' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('asset_type = $2');
    });

    it('applies both category and assetType filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await provider.readFeedback('p1', {
        category: 'speed',
        assetType: 'agent',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('category = $2');
      expect(sql).toContain('asset_type = $3');
    });
  });

  describe('getSummary', () => {
    it('returns aggregated summary with parsed numbers', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              feedback_count: 10,
              avg_score: 72.5,
              total_score: 725,
              last_updated: '2026-02-15T12:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ validation_count: 3 }],
        });

      const summary = await provider.getSummary('p1');

      expect(summary).toEqual({
        passportId: 'p1',
        feedbackCount: 10,
        validationCount: 3,
        avgScore: 72.5,
        totalScore: 725,
        lastUpdated: new Date('2026-02-15T12:00:00Z').getTime(),
      });
    });

    it('returns zeros for unknown passport', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              feedback_count: 0,
              avg_score: 0,
              total_score: 0,
              last_updated: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ validation_count: 0 }],
        });

      const summary = await provider.getSummary('unknown');

      expect(summary).toEqual({
        passportId: 'unknown',
        feedbackCount: 0,
        validationCount: 0,
        avgScore: 0,
        totalScore: 0,
        lastUpdated: 0,
      });
    });
  });

  describe('submitValidation', () => {
    it('inserts validation and returns success with id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'val_1' }] });

      const params: ValidationParams = {
        passportId: 'p1',
        receiptHash: 'rh1',
        valid: true,
        assetType: 'agent',
        metadata: '{"checked":true}',
      };

      const result = await provider.submitValidation(params);

      expect(result.success).toBe(true);
      expect(result.id).toBe('val_1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO reputation_validations');

      const values = mockQuery.mock.calls[0][1];
      expect(values).toEqual([
        'p1',
        'local',
        true,
        'rh1',
        'agent',
        '{"checked":true}',
      ]);
    });

    it('returns success false on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db error'));

      const params: ValidationParams = {
        passportId: 'p1',
        receiptHash: 'rh1',
        valid: false,
        assetType: 'compute',
      };

      const result = await provider.submitValidation(params);
      expect(result.success).toBe(false);
    });
  });

  describe('getValidation', () => {
    it('returns mapped validation result', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            passport_id: 'p1',
            validator: 'local',
            valid: true,
            receipt_hash: 'rh1',
            asset_type: 'model',
            created_at: '2026-03-01T08:00:00Z',
          },
        ],
      });

      const result = await provider.getValidation('p1', 'rh1');

      expect(result).toEqual({
        passportId: 'p1',
        validator: 'local',
        valid: true,
        receiptHash: 'rh1',
        assetType: 'model',
        timestamp: new Date('2026-03-01T08:00:00Z').getTime(),
      });
    });

    it('returns null for unknown passport/receipt', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await provider.getValidation('unknown', 'nope');
      expect(result).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('returns true when SELECT NOW() succeeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ now: new Date() }] });

      const healthy = await provider.isHealthy();
      expect(healthy).toBe(true);
    });

    it('returns false when query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));

      const healthy = await provider.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});
