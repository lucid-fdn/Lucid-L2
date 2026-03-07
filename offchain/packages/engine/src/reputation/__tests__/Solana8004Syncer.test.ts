const mockSdk = {
  getSummary: jest.fn(),
  readAllFeedback: jest.fn(),
  giveFeedback: jest.fn(),
};

jest.mock('8004-solana', () => ({
  SolanaSDK8004: jest.fn().mockImplementation(() => mockSdk),
}), { virtual: true });

import { Solana8004Syncer } from '../syncers/Solana8004Syncer';

describe('Solana8004Syncer', () => {
  let syncer: Solana8004Syncer;

  beforeEach(() => {
    jest.clearAllMocks();
    syncer = new Solana8004Syncer(mockSdk);
  });

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('8004-solana');
  });

  it('supports agent asset type', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns true with SDK', async () => {
    expect(await syncer.isAvailable()).toBe(true);
  });

  it('isAvailable returns false without SDK', async () => {
    const emptySyncer = new Solana8004Syncer(null);
    expect(await emptySyncer.isAvailable()).toBe(false);
  });

  describe('pullFeedback', () => {
    it('pulls feedback and maps correctly', async () => {
      mockSdk.readAllFeedback.mockResolvedValue([
        { score: 90, category: 'reliability', timestamp: 1700000000, metadata: { note: 'good' } },
        { score: 70, category: 'speed', timestamp: 1700001000 },
      ]);

      const result = await syncer.pullFeedback('passport-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: '8004-solana',
        externalId: 'passport-1',
        score: 90,
        category: 'reliability',
        timestamp: 1700000000,
        metadata: { note: 'good' },
      });
      expect(result[1]).toEqual({
        source: '8004-solana',
        externalId: 'passport-1',
        score: 70,
        category: 'speed',
        timestamp: 1700001000,
        metadata: undefined,
      });
      expect(mockSdk.readAllFeedback).toHaveBeenCalledWith('passport-1');
    });

    it('returns empty array on SDK error', async () => {
      mockSdk.readAllFeedback.mockRejectedValue(new Error('Network error'));

      const result = await syncer.pullFeedback('passport-1');
      expect(result).toEqual([]);
    });
  });

  describe('pullSummary', () => {
    it('pulls summary and maps correctly', async () => {
      mockSdk.getSummary.mockResolvedValue({
        averageScore: 85,
        totalFeedback: 42,
        lastUpdated: 1700002000,
      });

      const result = await syncer.pullSummary('passport-1');

      expect(result).not.toBeNull();
      expect(result!.source).toBe('8004-solana');
      expect(result!.externalId).toBe('passport-1');
      expect(result!.avgScore).toBe(85);
      expect(result!.feedbackCount).toBe(42);
      expect(result!.lastUpdated).toBe(1700002000);
      expect(mockSdk.getSummary).toHaveBeenCalledWith('passport-1');
    });

    it('returns null on SDK error', async () => {
      mockSdk.getSummary.mockRejectedValue(new Error('Network error'));

      const result = await syncer.pullSummary('passport-1');
      expect(result).toBeNull();
    });
  });

  describe('pushFeedback', () => {
    it('pushes feedback for agent asset type', async () => {
      mockSdk.giveFeedback.mockResolvedValue({ txHash: 'solana-tx-123', id: 'fb-1' });

      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'agent',
      });

      expect(result).toEqual({ success: true, txHash: 'solana-tx-123', id: 'fb-1' });
      expect(mockSdk.giveFeedback).toHaveBeenCalledWith('passport-1', 80, 'quality');
    });

    it('returns null for model asset type', async () => {
      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'model',
      });

      expect(result).toBeNull();
      expect(mockSdk.giveFeedback).not.toHaveBeenCalled();
    });

    it('returns null for compute asset type', async () => {
      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'compute',
      });

      expect(result).toBeNull();
      expect(mockSdk.giveFeedback).not.toHaveBeenCalled();
    });

    it('returns null for tool asset type', async () => {
      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'tool',
      });

      expect(result).toBeNull();
    });

    it('returns null for dataset asset type', async () => {
      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'dataset',
      });

      expect(result).toBeNull();
    });

    it('handles SDK error gracefully', async () => {
      mockSdk.giveFeedback.mockRejectedValue(new Error('Transaction failed'));

      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'agent',
      });

      expect(result).toBeNull();
    });
  });

  describe('resolveExternalId', () => {
    it('returns passportId as-is', async () => {
      expect(await syncer.resolveExternalId('passport-1')).toBe('passport-1');
    });
  });
});
