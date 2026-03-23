import { QuantuLabsReputationSyncer } from '../quantulabs/reputation';
import type { QuantuLabsConnection } from '../quantulabs/connection';

const mockSdk = {
  getSummary: jest.fn(),
  readAllFeedback: jest.fn(),
  giveFeedback: jest.fn(),
  register: undefined,
};

const mockConnection: QuantuLabsConnection = {
  getSDK: () => mockSdk,
  capabilities: { identityRegistration: false, reputation: true },
} as any;

describe('QuantuLabsReputationSyncer', () => {
  let syncer: QuantuLabsReputationSyncer;

  beforeEach(() => {
    jest.clearAllMocks();
    syncer = new QuantuLabsReputationSyncer(mockConnection);
  });

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('quantulabs');
  });

  it('supports agent asset type', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns true with SDK', async () => {
    expect(await syncer.isAvailable()).toBe(true);
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
        source: 'quantulabs',
        externalId: 'passport-1',
        score: 90,
        category: 'reliability',
        timestamp: 1700000000,
        metadata: { note: 'good' },
      });
    });

    it('returns empty array on SDK error', async () => {
      mockSdk.readAllFeedback.mockRejectedValue(new Error('Network error'));
      expect(await syncer.pullFeedback('passport-1')).toEqual([]);
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
      expect(result!.source).toBe('quantulabs');
      expect(result!.avgScore).toBe(85);
      expect(result!.feedbackCount).toBe(42);
    });

    it('returns null on SDK error', async () => {
      mockSdk.getSummary.mockRejectedValue(new Error('Network error'));
      expect(await syncer.pullSummary('passport-1')).toBeNull();
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
    });

    it('returns null for non-agent asset types', async () => {
      for (const assetType of ['model', 'compute', 'tool', 'dataset'] as const) {
        const result = await syncer.pushFeedback({
          passportId: 'passport-1', score: 80, category: 'quality',
          receiptHash: 'abc123', assetType,
        });
        expect(result).toBeNull();
      }
    });

    it('handles SDK error gracefully', async () => {
      mockSdk.giveFeedback.mockRejectedValue(new Error('Transaction failed'));
      const result = await syncer.pushFeedback({
        passportId: 'passport-1', score: 80, category: 'quality',
        receiptHash: 'abc123', assetType: 'agent',
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
