/**
 * DirectFacilitator — EVM on-chain payment verification.
 *
 * Verifies x402 payments by reading transaction receipts from an EVM chain
 * and checking for ERC-20 Transfer events that match the expected payment.
 * This is a port of the verification logic from gateway-lite/src/middleware/x402.ts.
 */

import { createPublicClient, http, type Chain } from 'viem';
import type {
  X402Facilitator,
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from './interface';

// ERC-20 Transfer event topic0
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface DirectFacilitatorConfig {
  chains: ChainConfig[];
  tokens: TokenConfig[];
  /** Max age in seconds for a payment proof to be accepted (default: 300) */
  maxProofAge?: number;
}

export class DirectFacilitator implements X402Facilitator {
  readonly name = 'direct';
  readonly supportedChains: ChainConfig[];
  readonly supportedTokens: TokenConfig[];

  private readonly maxProofAge: number;
  private readonly chainMap: Map<string, ChainConfig>;

  constructor(config: DirectFacilitatorConfig) {
    this.supportedChains = config.chains;
    this.supportedTokens = config.tokens;
    this.maxProofAge = config.maxProofAge ?? 300;

    this.chainMap = new Map();
    for (const chain of config.chains) {
      this.chainMap.set(chain.name, chain);
    }
  }

  // ---------------------------------------------------------------------------
  // instructions()
  // ---------------------------------------------------------------------------

  instructions(params: PaymentParams): PaymentInstructions {
    return {
      chain: params.chain,
      token: params.token.symbol,
      tokenAddress: params.token.address,
      amount: params.amount.toString(),
      recipient: params.recipient,
      facilitator: this.name,
      scheme: 'exact',
    };
  }

  // ---------------------------------------------------------------------------
  // verify()
  // ---------------------------------------------------------------------------

  async verify(
    proof: PaymentProof,
    expected: PaymentExpectation,
  ): Promise<VerificationResult> {
    // --- Input validation ---------------------------------------------------
    if (!proof.txHash) {
      return { valid: false, reason: 'Missing txHash in payment proof' };
    }

    const chainCfg = this.chainMap.get(proof.chain);
    if (!chainCfg) {
      return {
        valid: false,
        reason: `Unsupported chain: ${proof.chain}`,
      };
    }

    // --- Build viem client ---------------------------------------------------
    const viemChain: Chain = {
      id: chainCfg.chainId ?? 1,
      name: chainCfg.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [chainCfg.rpcUrl] },
      },
    };

    const client = createPublicClient({
      chain: viemChain,
      transport: http(chainCfg.rpcUrl),
    });

    try {
      // --- Fetch receipt ----------------------------------------------------
      const receipt = await client.getTransactionReceipt({
        hash: proof.txHash as `0x${string}`,
      });

      // Check transaction status
      if (receipt.status !== 'success') {
        return { valid: false, reason: 'Transaction failed on-chain' };
      }

      // --- Check transaction age --------------------------------------------
      const block = await client.getBlock({
        blockNumber: receipt.blockNumber,
      });
      const txAge =
        Math.floor(Date.now() / 1000) - Number(block.timestamp);
      if (txAge > this.maxProofAge) {
        return {
          valid: false,
          reason: `Payment too old (${txAge}s > ${this.maxProofAge}s)`,
        };
      }

      // --- Scan logs for matching ERC-20 Transfer --------------------------
      const tokenAddress = expected.token.address.toLowerCase();
      const recipientAddress = expected.recipient.toLowerCase();

      for (const log of receipt.logs) {
        // Must be from the expected token contract
        if (log.address.toLowerCase() !== tokenAddress) continue;

        const logAny = log as any;
        const topics: string[] = logAny.topics || [];

        // Must be a Transfer event
        if (topics[0] !== TRANSFER_TOPIC) continue;

        // Decode 'to' address from topic[2] (zero-padded 32 bytes)
        const toAddress = '0x' + (topics[2] || '').slice(26);
        if (toAddress.toLowerCase() !== recipientAddress) continue;

        // Decode value from data
        const value = BigInt(log.data);
        if (value >= expected.amount) {
          return {
            valid: true,
            txHash: proof.txHash,
            settledAmount: value,
            metadata: { facilitator: this.name, chain: proof.chain },
          };
        }
      }

      // No qualifying transfer found
      return {
        valid: false,
        reason: `No qualifying transfer to ${expected.recipient} found in tx`,
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Failed to verify tx: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
