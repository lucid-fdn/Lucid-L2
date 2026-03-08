import type {
  X402Facilitator,
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from '../../payment/facilitators/interface';

const BASE_CHAIN: ChainConfig = {
  name: 'base',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
};

const USDC_TOKEN: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  chain: 'base',
};

class MockFacilitator implements X402Facilitator {
  readonly name = 'mock';
  readonly supportedChains: ChainConfig[] = [BASE_CHAIN];
  readonly supportedTokens: TokenConfig[] = [USDC_TOKEN];

  async verify(
    proof: PaymentProof,
    expected: PaymentExpectation,
  ): Promise<VerificationResult> {
    if (!proof.txHash) {
      return { valid: false, reason: 'missing txHash' };
    }
    return {
      valid: true,
      txHash: proof.txHash,
      settledAmount: expected.amount,
      metadata: { facilitator: this.name },
    };
  }

  instructions(params: PaymentParams): PaymentInstructions {
    const token = params.token;
    return {
      chain: params.chain,
      token: token.symbol,
      tokenAddress: token.address,
      amount: params.amount.toString(),
      recipient: params.recipient,
      facilitator: this.name,
      scheme: 'exact',
    };
  }
}

describe('X402Facilitator interface', () => {
  let facilitator: X402Facilitator;

  beforeAll(() => {
    facilitator = new MockFacilitator();
  });

  it('should expose name and supported chains/tokens', () => {
    expect(facilitator.name).toBe('mock');
    expect(facilitator.supportedChains).toHaveLength(1);
    expect(facilitator.supportedChains[0].name).toBe('base');
    expect(facilitator.supportedTokens).toHaveLength(1);
    expect(facilitator.supportedTokens[0].symbol).toBe('USDC');
  });

  describe('verify()', () => {
    const expected: PaymentExpectation = {
      amount: BigInt(1_000_000),
      token: USDC_TOKEN,
      recipient: '0xRecipient',
    };

    it('should return valid VerificationResult for good proof', async () => {
      const proof: PaymentProof = {
        chain: 'base',
        txHash: '0xabc123',
      };

      const result: VerificationResult = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(true);
      expect(result.txHash).toBe('0xabc123');
      expect(result.settledAmount).toBe(BigInt(1_000_000));
      expect(result.metadata).toEqual({ facilitator: 'mock' });
    });

    it('should return invalid VerificationResult for bad proof', async () => {
      const proof: PaymentProof = {
        chain: 'base',
        // no txHash
      };

      const result: VerificationResult = await facilitator.verify(proof, expected);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing txHash');
    });
  });

  describe('instructions()', () => {
    it('should return PaymentInstructions with correct fields', () => {
      const params: PaymentParams = {
        amount: BigInt(5_000_000),
        token: USDC_TOKEN,
        chain: 'base',
        recipient: '0xRecipient',
      };

      const inst: PaymentInstructions = facilitator.instructions(params);

      expect(inst.chain).toBe('base');
      expect(inst.token).toBe('USDC');
      expect(inst.tokenAddress).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(inst.amount).toBe('5000000');
      expect(inst.recipient).toBe('0xRecipient');
      expect(inst.facilitator).toBe('mock');
      expect(inst.scheme).toBe('exact');
    });
  });
});
