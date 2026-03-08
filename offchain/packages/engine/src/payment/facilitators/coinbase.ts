import type {
  X402Facilitator,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from './interface';
import type { ChainConfig, TokenConfig } from '../types';

export interface CoinbaseFacilitatorConfig {
  apiUrl: string;
  apiKey?: string;
}

export class CoinbaseFacilitator implements X402Facilitator {
  readonly name = 'coinbase';
  readonly supportedChains: ChainConfig[] = [
    { name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' },
    { name: 'base-sepolia', chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
  ];
  readonly supportedTokens: TokenConfig[] = [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' },
    { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, chain: 'base-sepolia' },
  ];

  private apiUrl: string;
  private apiKey?: string;

  constructor(config: CoinbaseFacilitatorConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
  }

  instructions(params: PaymentParams): PaymentInstructions {
    return {
      chain: params.chain,
      token: params.token.symbol,
      tokenAddress: params.token.address,
      amount: params.amount.toString(),
      recipient: params.recipient,
      facilitator: this.name,
      facilitatorUrl: this.apiUrl,
      scheme: 'eip-3009',
    };
  }

  async verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult> {
    if (!proof.txHash && !proof.authorization) {
      return { valid: false, reason: 'Missing txHash or authorization in payment proof' };
    }

    try {
      const response = await fetch(`${this.apiUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          chain: proof.chain,
          txHash: proof.txHash,
          authorization: proof.authorization,
          expectedAmount: expected.amount.toString(),
          expectedRecipient: expected.recipient,
          tokenAddress: expected.token.address,
        }),
      });

      if (!response.ok) {
        return { valid: false, reason: `Coinbase verification failed: ${response.status}` };
      }

      const data = await response.json() as { valid: boolean; txHash?: string; reason?: string };
      return {
        valid: data.valid,
        txHash: data.txHash || proof.txHash,
        reason: data.reason,
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Coinbase API error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }
}
