import { CoinbaseFacilitator } from '../../payment/facilitators/coinbase';
import type {
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  PaymentParams,
} from '../../payment/facilitators/interface';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USDC_BASE: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  chain: 'base',
};

const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678';

function makeFacilitator() {
  return new CoinbaseFacilitator({
    apiUrl: 'https://api.coinbase.com/x402',
    apiKey: 'test-key',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoinbaseFacilitator', () => {
  let facilitator: CoinbaseFacilitator;

  beforeEach(() => {
    facilitator = makeFacilitator();
  });

  // -------------------------------------------------------------------------
  // Basic properties
  // -------------------------------------------------------------------------

  it('has name "coinbase"', () => {
    expect(facilitator.name).toBe('coinbase');
  });

  it('supportedChains includes base', () => {
    const chainNames = facilitator.supportedChains.map((c) => c.name);
    expect(chainNames).toContain('base');
    expect(chainNames).toContain('base-sepolia');
  });

  it('supportedTokens includes USDC on base', () => {
    expect(facilitator.supportedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'USDC', chain: 'base' }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // instructions()
  // -------------------------------------------------------------------------

  describe('instructions()', () => {
    it('returns PaymentInstructions with eip-3009 scheme and facilitatorUrl', () => {
      const params: PaymentParams = {
        amount: BigInt(5_000_000),
        token: USDC_BASE,
        chain: 'base',
        recipient: RECIPIENT,
      };

      const inst = facilitator.instructions(params);

      expect(inst.chain).toBe('base');
      expect(inst.token).toBe('USDC');
      expect(inst.tokenAddress).toBe(USDC_BASE.address);
      expect(inst.amount).toBe('5000000');
      expect(inst.recipient).toBe(RECIPIENT);
      expect(inst.facilitator).toBe('coinbase');
      expect(inst.scheme).toBe('eip-3009');
      expect(inst.facilitatorUrl).toBe('https://api.coinbase.com/x402');
    });
  });

  // -------------------------------------------------------------------------
  // verify() — input validation (no API calls)
  // -------------------------------------------------------------------------

  describe('verify() input validation', () => {
    const expected: PaymentExpectation = {
      amount: BigInt(1_000_000),
      token: USDC_BASE,
      recipient: RECIPIENT,
    };

    it('rejects missing txHash and authorization', async () => {
      const proof: PaymentProof = {
        chain: 'base',
        // no txHash, no authorization
      };

      const result = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing txHash or authorization in payment proof');
    });
  });
});
