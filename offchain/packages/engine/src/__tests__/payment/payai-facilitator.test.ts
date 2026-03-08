import { PayAIFacilitator } from '../../payment/facilitators/payai';
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
  return new PayAIFacilitator({
    apiUrl: 'https://payai.example.com/x402',
    apiKey: 'test-key',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PayAIFacilitator', () => {
  let facilitator: PayAIFacilitator;

  beforeEach(() => {
    facilitator = makeFacilitator();
  });

  // -------------------------------------------------------------------------
  // Basic properties
  // -------------------------------------------------------------------------

  it('has name "payai"', () => {
    expect(facilitator.name).toBe('payai');
  });

  it('supports solana and base chains', () => {
    const chainNames = facilitator.supportedChains.map((c) => c.name);
    expect(chainNames).toContain('solana');
    expect(chainNames).toContain('base');
  });

  it('supports avalanche, polygon, and sei chains', () => {
    const chainNames = facilitator.supportedChains.map((c) => c.name);
    expect(chainNames).toContain('avalanche');
    expect(chainNames).toContain('polygon');
    expect(chainNames).toContain('sei');
  });

  it('supportedTokens includes USDC on solana and base', () => {
    expect(facilitator.supportedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'USDC', chain: 'solana' }),
        expect.objectContaining({ symbol: 'USDC', chain: 'base' }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // instructions()
  // -------------------------------------------------------------------------

  describe('instructions()', () => {
    it('returns PaymentInstructions with facilitatorUrl containing "payai"', () => {
      const params: PaymentParams = {
        amount: BigInt(2_000_000),
        token: USDC_BASE,
        chain: 'base',
        recipient: RECIPIENT,
      };

      const inst = facilitator.instructions(params);

      expect(inst.chain).toBe('base');
      expect(inst.token).toBe('USDC');
      expect(inst.tokenAddress).toBe(USDC_BASE.address);
      expect(inst.amount).toBe('2000000');
      expect(inst.recipient).toBe(RECIPIENT);
      expect(inst.facilitator).toBe('payai');
      expect(inst.scheme).toBe('exact');
      expect(inst.facilitatorUrl).toContain('payai');
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

    it('rejects missing txHash', async () => {
      const proof: PaymentProof = {
        chain: 'base',
        // no txHash
      };

      const result = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing txHash in payment proof');
    });
  });
});
