import type {
  X402Facilitator,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from './interface';
import type { ChainConfig, TokenConfig } from '../types';

export interface PayAIFacilitatorConfig {
  apiUrl: string;
  apiKey?: string;
}

export class PayAIFacilitator implements X402Facilitator {
  readonly name = 'payai';
  readonly supportedChains: ChainConfig[] = [
    { name: 'solana', chainId: 0, rpcUrl: 'https://api.mainnet-beta.solana.com' },
    { name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' },
    { name: 'avalanche', chainId: 43114, rpcUrl: 'https://api.avax.network/ext/bc/C/rpc' },
    { name: 'polygon', chainId: 137, rpcUrl: 'https://polygon-rpc.com' },
    { name: 'sei', chainId: 1329, rpcUrl: 'https://evm-rpc.sei-apis.com' },
  ];
  readonly supportedTokens: TokenConfig[] = [
    { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, chain: 'solana' },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' },
    { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, chain: 'avalanche' },
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, chain: 'polygon' },
    { symbol: 'USDC', address: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1', decimals: 6, chain: 'sei' },
  ];

  private apiUrl: string;
  private apiKey?: string;

  constructor(config: PayAIFacilitatorConfig) {
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
      scheme: 'exact',
    };
  }

  async verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult> {
    if (!proof.txHash) {
      return { valid: false, reason: 'Missing txHash in payment proof' };
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
          expectedAmount: expected.amount.toString(),
          expectedRecipient: expected.recipient,
          tokenAddress: expected.token.address,
        }),
      });

      if (!response.ok) {
        return { valid: false, reason: `PayAI verification failed: ${response.status}` };
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
        reason: `PayAI API error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }
}
