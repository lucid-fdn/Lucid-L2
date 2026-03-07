import { ReputationService, UnifiedSummary, UnifiedFeedback } from '../reputationService';
import { IReputationProvider } from '../../../../engine/src/reputation/IReputationProvider';
import {
  IReputationSyncer,
  ExternalFeedback,
  ExternalSummary,
} from '../../../../engine/src/reputation/IReputationSyncer';
import {
  FeedbackParams,
  ReputationData,
  ReputationSummary,
  TxReceipt,
  AssetType,
} from '../../../../engine/src/reputation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockProvider(overrides?: Partial<IReputationProvider>): IReputationProvider {
  return {
    providerName: 'mock-provider',
    submitFeedback: jest.fn().mockResolvedValue({ success: true, txHash: 'tx-local' } as TxReceipt),
    readFeedback: jest.fn().mockResolvedValue([] as ReputationData[]),
    getSummary: jest.fn().mockResolvedValue({
      passportId: 'p1',
      feedbackCount: 5,
      validationCount: 2,
      avgScore: 80,
      totalScore: 400,
      lastUpdated: 1700000000,
    } as ReputationSummary),
    submitValidation: jest.fn().mockResolvedValue({ success: true } as TxReceipt),
    getValidation: jest.fn().mockResolvedValue(null),
    isHealthy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function mockSyncer(
  name: string,
  overrides?: Partial<IReputationSyncer> & { assetTypes?: AssetType[] },
): IReputationSyncer {
  const { assetTypes, ...rest } = overrides ?? {};
  return {
    syncerName: name,
    supportedAssetTypes: assetTypes ?? ['agent'],
    pullFeedback: jest.fn().mockResolvedValue([] as ExternalFeedback[]),
    pullSummary: jest.fn().mockResolvedValue(null as ExternalSummary | null),
    pushFeedback: jest.fn().mockResolvedValue(null as TxReceipt | null),
    resolveExternalId: jest.fn().mockResolvedValue(null as string | null),
    isAvailable: jest.fn().mockResolvedValue(true),
    ...rest,
  };
}

const agentFeedback: FeedbackParams = {
  passportId: 'p1',
  score: 85,
  category: 'quality',
  receiptHash: 'abc123',
  assetType: 'agent',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReputationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. delegates submitFeedback to provider
  it('delegates submitFeedback to provider', async () => {
    const provider = mockProvider();
    const svc = new ReputationService(provider, [], true, true);

    const result = await svc.submitFeedback(agentFeedback);

    expect(result).toEqual({ success: true, txHash: 'tx-local' });
    expect(provider.submitFeedback).toHaveBeenCalledWith(agentFeedback);
  });

  // 2. pushes feedback to matching syncers on submit
  it('pushes feedback to matching syncers on submit', async () => {
    const provider = mockProvider();
    const agentSyncer = mockSyncer('agent-syncer', { assetTypes: ['agent'] });
    const modelSyncer = mockSyncer('model-syncer', { assetTypes: ['model'] });

    const svc = new ReputationService(provider, [agentSyncer, modelSyncer], true, true);
    await svc.submitFeedback(agentFeedback);

    // Agent syncer should be called (assetType matches)
    expect(agentSyncer.pushFeedback).toHaveBeenCalledWith(agentFeedback);
    // Model syncer should NOT be called (assetType doesn't match)
    expect(modelSyncer.pushFeedback).not.toHaveBeenCalled();
  });

  // 3. does not push when pushEnabled is false
  it('does not push when pushEnabled is false', async () => {
    const provider = mockProvider();
    const syncer = mockSyncer('agent-syncer', { assetTypes: ['agent'] });

    const svc = new ReputationService(provider, [syncer], false, true);
    await svc.submitFeedback(agentFeedback);

    expect(provider.submitFeedback).toHaveBeenCalledWith(agentFeedback);
    expect(syncer.pushFeedback).not.toHaveBeenCalled();
  });

  // 4. returns unified summary merging provider + syncers (weighted by feedbackCount)
  it('returns unified summary merging provider + syncers weighted by feedbackCount', async () => {
    const provider = mockProvider({
      getSummary: jest.fn().mockResolvedValue({
        passportId: 'p1',
        feedbackCount: 10,
        validationCount: 0,
        avgScore: 80,
        totalScore: 800,
        lastUpdated: 1700000000,
      } as ReputationSummary),
    });

    const syncer1 = mockSyncer('syncer-a', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'syncer-a',
        externalId: 'ext-p1',
        avgScore: 90,
        feedbackCount: 10,
        lastUpdated: 1700000000,
      } as ExternalSummary),
    });

    const syncer2 = mockSyncer('syncer-b', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'syncer-b',
        externalId: 'ext-p1-b',
        avgScore: 60,
        feedbackCount: 5,
        lastUpdated: 1700000000,
      } as ExternalSummary),
    });

    const svc = new ReputationService(provider, [syncer1, syncer2], true, true);
    const unified: UnifiedSummary = await svc.getUnifiedSummary('p1');

    expect(unified.local.avgScore).toBe(80);
    expect(unified.external).toHaveLength(2);

    // Weighted average: (80*10 + 90*10 + 60*5) / (10+10+5) = 2000/25 = 80
    expect(unified.merged.totalFeedback).toBe(25);
    expect(unified.merged.avgScore).toBe(80);
  });

  // 5. does not pull when pullEnabled is false
  it('does not pull when pullEnabled is false', async () => {
    const provider = mockProvider();
    const syncer = mockSyncer('syncer-a', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'syncer-a',
        externalId: 'ext-p1',
        avgScore: 90,
        feedbackCount: 10,
        lastUpdated: 1700000000,
      } as ExternalSummary),
    });

    const svc = new ReputationService(provider, [syncer], true, false);
    const unified = await svc.getUnifiedSummary('p1');

    // Syncer should never be called
    expect(syncer.pullSummary).not.toHaveBeenCalled();
    expect(unified.external).toEqual([]);
    // Merged uses only local
    expect(unified.merged.avgScore).toBe(80);
    expect(unified.merged.totalFeedback).toBe(5);
  });

  // 6. isolates syncer failures
  it('isolates syncer failures — bad syncer throws, good syncer data still present', async () => {
    const provider = mockProvider();

    const goodSyncer = mockSyncer('good', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'good',
        externalId: 'ext-p1',
        avgScore: 95,
        feedbackCount: 20,
        lastUpdated: 1700000000,
      } as ExternalSummary),
    });

    const badSyncer = mockSyncer('bad', {
      pullSummary: jest.fn().mockRejectedValue(new Error('network down')),
    });

    const svc = new ReputationService(provider, [goodSyncer, badSyncer], true, true);
    const unified = await svc.getUnifiedSummary('p1');

    // Good syncer data should be present
    expect(unified.external).toHaveLength(1);
    expect(unified.external[0].source).toBe('good');

    // Merged should include local (5 @ 80) + good (20 @ 95) = (400+1900)/25 = 92
    expect(unified.merged.totalFeedback).toBe(25);
    expect(unified.merged.avgScore).toBe(92);
  });

  // 7. combines local + external feedback in readFeedback
  it('combines local + external feedback in readFeedback', async () => {
    const localData: ReputationData[] = [
      {
        passportId: 'p1',
        from: 'reviewer-1',
        score: 70,
        category: 'quality',
        receiptHash: 'hash1',
        assetType: 'agent',
        timestamp: 1700000000,
        revoked: false,
        index: 0,
      },
    ];

    const externalData: ExternalFeedback[] = [
      {
        source: 'syncer-a',
        externalId: 'ext-p1',
        score: 88,
        category: 'reliability',
        timestamp: 1700000001,
      },
    ];

    const provider = mockProvider({
      readFeedback: jest.fn().mockResolvedValue(localData),
    });

    const syncer = mockSyncer('syncer-a', {
      pullFeedback: jest.fn().mockResolvedValue(externalData),
    });

    const svc = new ReputationService(provider, [syncer], true, true);
    const result: UnifiedFeedback = await svc.readFeedback('p1');

    expect(result.local).toEqual(localData);
    expect(result.external).toEqual(externalData);
  });

  // Additional: readFeedback isolates syncer failure
  it('readFeedback isolates syncer failure', async () => {
    const localData: ReputationData[] = [
      {
        passportId: 'p1',
        from: 'reviewer-1',
        score: 70,
        category: 'quality',
        receiptHash: 'hash1',
        assetType: 'agent',
        timestamp: 1700000000,
        revoked: false,
        index: 0,
      },
    ];

    const provider = mockProvider({
      readFeedback: jest.fn().mockResolvedValue(localData),
    });

    const goodSyncer = mockSyncer('good', {
      pullFeedback: jest.fn().mockResolvedValue([
        { source: 'good', externalId: 'ext-p1', score: 88, timestamp: 1700000001 },
      ] as ExternalFeedback[]),
    });
    const badSyncer = mockSyncer('bad', {
      pullFeedback: jest.fn().mockRejectedValue(new Error('timeout')),
    });

    const svc = new ReputationService(provider, [goodSyncer, badSyncer], true, true);
    const result = await svc.readFeedback('p1');

    expect(result.local).toEqual(localData);
    expect(result.external).toHaveLength(1);
    expect(result.external[0].source).toBe('good');
  });

  // Validation delegation
  it('delegates submitValidation to provider', async () => {
    const provider = mockProvider();
    const svc = new ReputationService(provider, [], true, true);

    await svc.submitValidation({
      passportId: 'p1',
      receiptHash: 'hash1',
      valid: true,
      assetType: 'agent',
    });

    expect(provider.submitValidation).toHaveBeenCalled();
  });

  it('delegates getValidation to provider', async () => {
    const provider = mockProvider();
    const svc = new ReputationService(provider, [], true, true);

    await svc.getValidation('p1', 'hash1');

    expect(provider.getValidation).toHaveBeenCalledWith('p1', 'hash1');
  });

  it('delegates getSummary to provider', async () => {
    const provider = mockProvider();
    const svc = new ReputationService(provider, [], true, true);

    const result = await svc.getSummary('p1');

    expect(result.avgScore).toBe(80);
    expect(provider.getSummary).toHaveBeenCalledWith('p1');
  });
});
