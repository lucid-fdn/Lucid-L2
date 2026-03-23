import { MetaplexReputationSyncer } from '../metaplex/reputation';

const mockFetchAssetV1 = jest.fn();
const mockAddPluginV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });

jest.mock('@metaplex-foundation/mpl-core', () => ({
  fetchAssetV1: (...args: any[]) => mockFetchAssetV1(...args),
  addPluginV1: (...args: any[]) => mockAddPluginV1(...args),
}), { virtual: true });

jest.mock('@metaplex-foundation/umi', () => ({ publicKey: (k: string) => k }), { virtual: true });

const mockUmi = {};
const mockConnection = { getUmi: jest.fn().mockResolvedValue(mockUmi) } as any;
const mockMintLookup = jest.fn();

describe('MetaplexReputationSyncer', () => {
  let syncer: MetaplexReputationSyncer;
  beforeEach(() => { jest.clearAllMocks(); syncer = new MetaplexReputationSyncer(mockConnection, mockMintLookup); });

  it('has correct syncer name', () => { expect(syncer.syncerName).toBe('metaplex'); });
  it('supports agent asset type only', () => { expect(syncer.supportedAssetTypes).toEqual(['agent']); });

  describe('pullFeedback', () => {
    it('returns empty when no mint found', async () => {
      mockMintLookup.mockResolvedValue(null);
      expect(await syncer.pullFeedback('p1')).toEqual([]);
    });
    it('reads reputation attributes from asset', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      mockFetchAssetV1.mockResolvedValue({ attributes: { attributeList: [
        { key: 'reputation:avg_score', value: '85' },
        { key: 'reputation:feedback_count', value: '10' },
      ] } });
      const result = await syncer.pullFeedback('p1');
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('metaplex');
      expect(result[0].score).toBe(85);
      expect(result[0].category).toBe('avg_score');
    });
  });

  describe('pushFeedback', () => {
    it('returns null for non-agent types', async () => {
      expect(await syncer.pushFeedback({ passportId: 'p1', score: 80, category: 'quality', receiptHash: 'abc', assetType: 'model' })).toBeNull();
    });
    it('returns null when no mint found', async () => {
      mockMintLookup.mockResolvedValue(null);
      expect(await syncer.pushFeedback({ passportId: 'p1', score: 80, category: 'quality', receiptHash: 'abc', assetType: 'agent' })).toBeNull();
    });
    it('writes attributes plugin when mint exists', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      const result = await syncer.pushFeedback({ passportId: 'p1', score: 80, category: 'quality', receiptHash: 'abc', assetType: 'agent' });
      expect(result).toEqual({ success: true });
      expect(mockAddPluginV1).toHaveBeenCalled();
    });
  });

  describe('resolveExternalId', () => {
    it('delegates to mintLookup', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      expect(await syncer.resolveExternalId('p1')).toBe('MintPubkey');
    });
  });
});
