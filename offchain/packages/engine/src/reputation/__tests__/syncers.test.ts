import { SATISyncer } from '../syncers/SATISyncer';
import { SAIDSyncer } from '../syncers/SAIDSyncer';
import { EVM8004Syncer } from '../syncers/EVM8004Syncer';

describe('SATISyncer', () => {
  const syncer = new SATISyncer();

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('sati');
  });

  it('supports agent asset type', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns false', async () => {
    expect(await syncer.isAvailable()).toBe(false);
  });

  it('pullFeedback returns empty array', async () => {
    expect(await syncer.pullFeedback('passport-1')).toEqual([]);
  });

  it('pullSummary returns null', async () => {
    expect(await syncer.pullSummary('passport-1')).toBeNull();
  });

  it('pushFeedback returns null', async () => {
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

describe('SAIDSyncer', () => {
  const syncer = new SAIDSyncer();

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('said');
  });

  it('supports agent asset type', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns false', async () => {
    expect(await syncer.isAvailable()).toBe(false);
  });
});

describe('EVM8004Syncer', () => {
  it('is unavailable without clients', async () => {
    const syncer = new EVM8004Syncer();
    expect(await syncer.isAvailable()).toBe(false);
  });

  it('has correct syncer name', () => {
    const syncer = new EVM8004Syncer();
    expect(syncer.syncerName).toBe('evm-8004');
  });

  it('supports agent asset type', () => {
    const syncer = new EVM8004Syncer();
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('pullFeedback returns empty without client', async () => {
    const syncer = new EVM8004Syncer();
    expect(await syncer.pullFeedback('passport-1')).toEqual([]);
  });

  it('pullSummary returns null without client', async () => {
    const syncer = new EVM8004Syncer();
    expect(await syncer.pullSummary('passport-1')).toBeNull();
  });

  it('resolveExternalId returns passportId as-is', async () => {
    const syncer = new EVM8004Syncer();
    expect(await syncer.resolveExternalId('passport-1')).toBe('passport-1');
  });

  describe('with reputation client', () => {
    const mockReputationClient = {
      getFeedback: jest.fn(),
      getAverageScore: jest.fn(),
      submitFeedback: jest.fn(),
    } as any;

    const syncer = new EVM8004Syncer(undefined, mockReputationClient);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('isAvailable returns true', async () => {
      expect(await syncer.isAvailable()).toBe(true);
    });

    it('pulls feedback from reputation client', async () => {
      mockReputationClient.getFeedback.mockResolvedValue([
        {
          from: '0xabc',
          score: 85,
          category: 'quality',
          timestamp: 1700000000,
        },
      ]);

      const result = await syncer.pullFeedback('passport-1');
      expect(result).toEqual([
        {
          source: 'evm-8004',
          externalId: 'passport-1',
          score: 85,
          category: 'quality',
          timestamp: 1700000000,
          metadata: { from: '0xabc' },
        },
      ]);
      expect(mockReputationClient.getFeedback).toHaveBeenCalledWith('passport-1');
    });

    it('pulls summary from reputation client', async () => {
      mockReputationClient.getAverageScore.mockResolvedValue({
        agentTokenId: 'passport-1',
        averageScore: 90,
        totalFeedback: 10,
        chainId: 'base',
      });

      const result = await syncer.pullSummary('passport-1');
      expect(result).not.toBeNull();
      expect(result!.source).toBe('evm-8004');
      expect(result!.avgScore).toBe(90);
      expect(result!.feedbackCount).toBe(10);
      expect(mockReputationClient.getAverageScore).toHaveBeenCalledWith('passport-1');
    });

    it('pushes feedback via reputation client', async () => {
      mockReputationClient.submitFeedback.mockResolvedValue('0xtxhash');

      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'agent',
      });

      expect(result).toEqual({ success: true, txHash: '0xtxhash' });
      expect(mockReputationClient.submitFeedback).toHaveBeenCalledWith(
        'passport-1',
        80,
        'quality',
      );
    });
  });

  describe('with validation client only', () => {
    const mockValidationClient = {} as any;
    const syncer = new EVM8004Syncer(mockValidationClient);

    it('isAvailable returns true', async () => {
      expect(await syncer.isAvailable()).toBe(true);
    });

    it('pullFeedback returns empty without reputation client', async () => {
      expect(await syncer.pullFeedback('passport-1')).toEqual([]);
    });
  });
});
