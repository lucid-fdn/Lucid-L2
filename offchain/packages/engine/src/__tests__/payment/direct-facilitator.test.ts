import { DirectFacilitator } from '../../payment/facilitators/direct';
import type {
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  PaymentParams,
} from '../../payment/facilitators/interface';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CHAIN: ChainConfig = {
  name: 'base',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
};

const BASE_SEPOLIA: ChainConfig = {
  name: 'base-sepolia',
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
};

const USDC_TOKEN: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  chain: 'base',
};

const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678';

function makeFacilitator() {
  return new DirectFacilitator({
    chains: [BASE_CHAIN, BASE_SEPOLIA],
    tokens: [USDC_TOKEN],
    maxProofAge: 300,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DirectFacilitator', () => {
  let facilitator: DirectFacilitator;

  beforeEach(() => {
    facilitator = makeFacilitator();
  });

  // -------------------------------------------------------------------------
  // Basic properties
  // -------------------------------------------------------------------------

  it('has name "direct"', () => {
    expect(facilitator.name).toBe('direct');
  });

  it('exposes supportedChains from config', () => {
    expect(facilitator.supportedChains).toHaveLength(2);
    expect(facilitator.supportedChains[0].name).toBe('base');
    expect(facilitator.supportedChains[1].name).toBe('base-sepolia');
  });

  it('exposes supportedTokens from config', () => {
    expect(facilitator.supportedTokens).toHaveLength(1);
    expect(facilitator.supportedTokens[0].symbol).toBe('USDC');
  });

  // -------------------------------------------------------------------------
  // instructions()
  // -------------------------------------------------------------------------

  describe('instructions()', () => {
    it('returns PaymentInstructions with scheme "exact"', () => {
      const params: PaymentParams = {
        amount: BigInt(5_000_000),
        token: USDC_TOKEN,
        chain: 'base',
        recipient: RECIPIENT,
      };

      const inst = facilitator.instructions(params);

      expect(inst.chain).toBe('base');
      expect(inst.token).toBe('USDC');
      expect(inst.tokenAddress).toBe(USDC_TOKEN.address);
      expect(inst.amount).toBe('5000000');
      expect(inst.recipient).toBe(RECIPIENT);
      expect(inst.facilitator).toBe('direct');
      expect(inst.scheme).toBe('exact');
    });
  });

  // -------------------------------------------------------------------------
  // verify() — input validation (no RPC calls)
  // -------------------------------------------------------------------------

  describe('verify() input validation', () => {
    const expected: PaymentExpectation = {
      amount: BigInt(1_000_000),
      token: USDC_TOKEN,
      recipient: RECIPIENT,
    };

    it('rejects missing txHash', async () => {
      const proof: PaymentProof = {
        chain: 'base',
        // no txHash
      };

      const result = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing txHash in payment proof');
    });

    it('rejects unsupported chain', async () => {
      const proof: PaymentProof = {
        chain: 'ethereum',
        txHash: '0xabc123',
      };

      const result = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Unsupported chain: ethereum');
    });
  });
});
