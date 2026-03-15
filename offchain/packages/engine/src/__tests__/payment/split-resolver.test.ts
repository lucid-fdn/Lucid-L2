jest.mock('../../db/pool', () => ({
  getClient: jest.fn(),
}));

import { PricingService, AssetPricing } from '../../payment/services/pricingService';
import { SplitResolver, DEFAULT_PRICE_PER_CALL } from '../../payment/services/splitResolver';

// ---------------------------------------------------------------------------
// Mock PricingService
// ---------------------------------------------------------------------------

const mockGetPricing = jest.fn<Promise<AssetPricing | null>, [string]>();

const pricingService = {
  getPricing: mockGetPricing,
} as unknown as PricingService;

const TREASURY = '0xTREASURY';
const SPLITTER = '0xSPLITTER';

function makeResolver() {
  return new SplitResolver(pricingService, {
    protocolTreasuryAddress: TREASURY,
    defaultSplitterAddress: SPLITTER,
  });
}

function makePricing(overrides: Partial<AssetPricing> = {}): AssetPricing {
  return {
    passport_id: 'default',
    price_per_call: 20000n,
    price_per_token: null,
    price_subscription_hour: null,
    accepted_tokens: ['USDC'],
    accepted_chains: ['base'],
    payout_address: '0xDEFAULT_WALLET',
    custom_split_bps: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SplitResolver', () => {
  let resolver: SplitResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = makeResolver();
  });

  // -------------------------------------------------------------------------
  // Single participant
  // -------------------------------------------------------------------------

  describe('single participant (compute only)', () => {
    it('returns useSplitter=false, 1 recipient with bps=10000', async () => {
      mockGetPricing.mockResolvedValueOnce(
        makePricing({
          passport_id: 'compute-1',
          price_per_call: 50000n,
          payout_address: '0xCOMPUTE',
        }),
      );

      const result = await resolver.resolve({ computePassportId: 'compute-1' });

      expect(result.useSplitter).toBe(false);
      expect(result.splitterAddress).toBeUndefined();
      expect(result.recipients).toHaveLength(1);
      expect(result.recipients[0]).toEqual({
        role: 'compute',
        passportId: 'compute-1',
        walletAddress: '0xCOMPUTE',
        bps: 10000,
      });
      expect(result.totalAmount).toBe(50000n);
      expect(result.token.symbol).toBe('USDC');
      expect(result.chain).toBe('base');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-participant (model + compute)
  // -------------------------------------------------------------------------

  describe('multi participant (model + compute)', () => {
    it('returns useSplitter=true, 3 recipients (model + compute + protocol)', async () => {
      // getPricing is called once for compute, once for model
      mockGetPricing
        .mockResolvedValueOnce(
          makePricing({
            passport_id: 'compute-1',
            price_per_call: 30000n,
            payout_address: '0xCOMPUTE',
          }),
        )
        .mockResolvedValueOnce(
          makePricing({
            passport_id: 'model-1',
            price_per_call: 20000n,
            payout_address: '0xMODEL',
          }),
        );

      const result = await resolver.resolve({
        computePassportId: 'compute-1',
        modelPassportId: 'model-1',
      });

      expect(result.useSplitter).toBe(true);
      expect(result.splitterAddress).toBe(SPLITTER);
      expect(result.recipients).toHaveLength(3);

      const compute = result.recipients.find((r) => r.role === 'compute')!;
      const model = result.recipients.find((r) => r.role === 'model')!;
      const protocol = result.recipients.find((r) => r.role === 'protocol')!;

      expect(compute.bps).toBe(7000);
      expect(compute.walletAddress).toBe('0xCOMPUTE');
      expect(compute.passportId).toBe('compute-1');

      expect(model.bps).toBe(2000);
      expect(model.walletAddress).toBe('0xMODEL');
      expect(model.passportId).toBe('model-1');

      expect(protocol.bps).toBe(1000);
      expect(protocol.walletAddress).toBe(TREASURY);

      // Total = 30000 + 20000
      expect(result.totalAmount).toBe(50000n);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback to default price
  // -------------------------------------------------------------------------

  describe('no pricing for asset', () => {
    it('falls back to DEFAULT_PRICE_PER_CALL when getPricing returns null', async () => {
      mockGetPricing.mockResolvedValueOnce(null);

      const result = await resolver.resolve({ computePassportId: 'unknown-compute' });

      expect(result.useSplitter).toBe(false);
      expect(result.recipients).toHaveLength(1);
      expect(result.totalAmount).toBe(DEFAULT_PRICE_PER_CALL);
      // wallet falls back to treasury when no pricing
      expect(result.recipients[0].walletAddress).toBe(TREASURY);
    });
  });

  // -------------------------------------------------------------------------
  // With orchestrator → 4-way split
  // -------------------------------------------------------------------------

  describe('with orchestrator', () => {
    it('uses 4-way split (6000/1500/1500/1000)', async () => {
      mockGetPricing
        .mockResolvedValueOnce(
          makePricing({
            passport_id: 'compute-1',
            price_per_call: 10000n,
            payout_address: '0xCOMPUTE',
          }),
        )
        .mockResolvedValueOnce(
          makePricing({
            passport_id: 'model-1',
            price_per_call: 10000n,
            payout_address: '0xMODEL',
          }),
        )
        .mockResolvedValueOnce(
          makePricing({
            passport_id: 'orch-1',
            price_per_call: 10000n,
            payout_address: '0xORCH',
          }),
        );

      const result = await resolver.resolve({
        computePassportId: 'compute-1',
        modelPassportId: 'model-1',
        orchestratorPassportId: 'orch-1',
      });

      expect(result.useSplitter).toBe(true);
      expect(result.recipients).toHaveLength(4);

      const compute = result.recipients.find((r) => r.role === 'compute')!;
      const model = result.recipients.find((r) => r.role === 'model')!;
      const orchestrator = result.recipients.find((r) => r.role === 'orchestrator')!;
      const protocol = result.recipients.find((r) => r.role === 'protocol')!;

      expect(compute.bps).toBe(6000);
      expect(model.bps).toBe(1500);
      expect(orchestrator.bps).toBe(1500);
      expect(protocol.bps).toBe(1000);

      // Total = sum of all bps = 10000
      expect(compute.bps + model.bps + orchestrator.bps + protocol.bps).toBe(10000);

      // Total amount = 10000 + 10000 + 10000
      expect(result.totalAmount).toBe(30000n);
    });
  });

  // -------------------------------------------------------------------------
  // Edge: no participants
  // -------------------------------------------------------------------------

  describe('no participants', () => {
    it('throws when no passport IDs are provided', async () => {
      await expect(resolver.resolve({})).rejects.toThrow(
        'at least one participant is required',
      );
    });
  });
});
