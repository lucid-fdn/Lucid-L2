import { PricingService, AssetPricing } from './pricingService';
import { SplitRecipient, SplitResolution, TokenConfig } from './types';

/**
 * Default price per call in token micro-units ($0.01 USDC = 10000 micro-units at 6 decimals).
 */
export const DEFAULT_PRICE_PER_CALL = 10000n;

/**
 * Default USDC token config on Base.
 */
const DEFAULT_USDC_TOKEN: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base mainnet
  decimals: 6,
  chain: 'base',
};

/**
 * Default basis-point splits for multi-party resolutions.
 */
const SPLITS = {
  /** Two-party: compute + model (protocol added automatically) */
  TWO_PARTY: {
    compute: 7000,
    model: 2000,
    protocol: 1000,
  },
  /** Three-party: compute + model + orchestrator (protocol added automatically) */
  THREE_PARTY: {
    compute: 6000,
    model: 1500,
    orchestrator: 1500,
    protocol: 1000,
  },
} as const;

export interface SplitResolverConfig {
  protocolTreasuryAddress: string;
  defaultSplitterAddress: string;
  defaultToken?: TokenConfig;
  defaultChain?: string;
}

interface ResolveParams {
  modelPassportId?: string;
  computePassportId?: string;
  orchestratorPassportId?: string;
}

interface ResolvedParticipant {
  role: 'compute' | 'model' | 'orchestrator';
  passportId: string;
  pricing: AssetPricing | null;
}

export class SplitResolver {
  private readonly pricingService: PricingService;
  private readonly config: SplitResolverConfig;
  private readonly token: TokenConfig;
  private readonly chain: string;

  constructor(pricingService: PricingService, config: SplitResolverConfig) {
    this.pricingService = pricingService;
    this.config = config;
    this.token = config.defaultToken ?? DEFAULT_USDC_TOKEN;
    this.chain = config.defaultChain ?? 'base';
  }

  /**
   * Resolve the payment split for a set of participants.
   *
   * - Single participant: direct wallet payment, no splitter, 10000 bps.
   * - Multiple participants: splitter contract, default bps per role,
   *   protocol treasury always added.
   */
  async resolve(params: ResolveParams): Promise<SplitResolution> {
    const participants = await this.fetchParticipants(params);

    if (participants.length === 0) {
      throw new Error('SplitResolver: at least one participant is required');
    }

    if (participants.length === 1) {
      return this.buildSingleParty(participants[0]);
    }

    return this.buildMultiParty(participants);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fetchParticipants(params: ResolveParams): Promise<ResolvedParticipant[]> {
    const entries: Array<{ role: 'compute' | 'model' | 'orchestrator'; id: string }> = [];

    if (params.computePassportId) {
      entries.push({ role: 'compute', id: params.computePassportId });
    }
    if (params.modelPassportId) {
      entries.push({ role: 'model', id: params.modelPassportId });
    }
    if (params.orchestratorPassportId) {
      entries.push({ role: 'orchestrator', id: params.orchestratorPassportId });
    }

    const results = await Promise.all(
      entries.map(async (e) => {
        const pricing = await this.pricingService.getPricing(e.id);
        return { role: e.role, passportId: e.id, pricing } as ResolvedParticipant;
      }),
    );

    return results;
  }

  private priceFor(participant: ResolvedParticipant): bigint {
    return participant.pricing?.price_per_call ?? DEFAULT_PRICE_PER_CALL;
  }

  private walletFor(participant: ResolvedParticipant): string {
    return participant.pricing?.payout_address ?? this.config.protocolTreasuryAddress;
  }

  /**
   * Single participant → direct payment, no splitter needed.
   */
  private buildSingleParty(participant: ResolvedParticipant): SplitResolution {
    const recipient: SplitRecipient = {
      role: participant.role,
      passportId: participant.passportId,
      walletAddress: this.walletFor(participant),
      bps: 10000,
    };

    return {
      recipients: [recipient],
      useSplitter: false,
      totalAmount: this.priceFor(participant),
      token: this.token,
      chain: this.chain,
    };
  }

  /**
   * Multiple participants → use splitter contract, add protocol treasury.
   */
  private buildMultiParty(participants: ResolvedParticipant[]): SplitResolution {
    const hasOrchestrator = participants.some((p) => p.role === 'orchestrator');
    const bpsMap = hasOrchestrator ? SPLITS.THREE_PARTY : SPLITS.TWO_PARTY;

    const recipients: SplitRecipient[] = [];

    for (const p of participants) {
      const bps = this.bpsForRole(p.role, bpsMap, hasOrchestrator);
      recipients.push({
        role: p.role,
        passportId: p.passportId,
        walletAddress: this.walletFor(p),
        bps,
      });
    }

    // Always add protocol treasury for multi-party
    recipients.push({
      role: 'protocol',
      walletAddress: this.config.protocolTreasuryAddress,
      bps: bpsMap.protocol,
    });

    // Total amount = sum of each participant's price
    const totalAmount = participants.reduce((sum, p) => sum + this.priceFor(p), 0n);

    return {
      recipients,
      useSplitter: true,
      splitterAddress: this.config.defaultSplitterAddress,
      totalAmount,
      token: this.token,
      chain: this.chain,
    };
  }

  private bpsForRole(
    role: 'compute' | 'model' | 'orchestrator',
    bpsMap: typeof SPLITS.TWO_PARTY | typeof SPLITS.THREE_PARTY,
    hasOrchestrator: boolean,
  ): number {
    switch (role) {
      case 'compute':
        return bpsMap.compute;
      case 'model':
        return bpsMap.model;
      case 'orchestrator':
        return hasOrchestrator ? (bpsMap as typeof SPLITS.THREE_PARTY).orchestrator : 0;
      default:
        return 0;
    }
  }
}
