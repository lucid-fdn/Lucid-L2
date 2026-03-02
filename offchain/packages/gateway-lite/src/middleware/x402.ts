/**
 * x402 Payment Middleware
 *
 * Implements the x402 HTTP payment protocol (https://x402.org).
 * When a client sends a request without payment, the server returns HTTP 402
 * with payment instructions. The client pays (USDC on-chain), then retries
 * with a payment proof header.
 *
 * Opt-in per route — wrap any Express route handler with requirePayment().
 */

import { Request, Response, NextFunction } from 'express';
import { createPublicClient, http, parseAbi } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// =============================================================================
// Configuration
// =============================================================================

export interface X402Config {
  /** Wallet address to receive payments */
  paymentAddress: string;

  /** Default price in USDC (6 decimals) for paid endpoints */
  defaultPriceUSDC: string;

  /** Chain to verify payments on (default: 'base') */
  paymentChain: 'base' | 'base-sepolia';

  /** USDC contract address on the payment chain */
  usdcAddress: string;

  /** Whether x402 is enabled */
  enabled: boolean;

  /** Max age (seconds) for a payment proof to be accepted */
  maxProofAge: number;
}

const DEFAULT_CONFIG: X402Config = {
  paymentAddress: process.env.X402_PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
  defaultPriceUSDC: process.env.X402_DEFAULT_PRICE || '0.01',
  paymentChain: (process.env.X402_PAYMENT_CHAIN as 'base' | 'base-sepolia') || 'base-sepolia',
  usdcAddress: process.env.X402_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
  enabled: process.env.X402_ENABLED === 'true',
  maxProofAge: parseInt(process.env.X402_MAX_PROOF_AGE || '300', 10),
};

let config: X402Config = { ...DEFAULT_CONFIG };

// Replay protection: set of already-spent transaction hashes
const spentProofs = new Set<string>();

// Minimal ERC-20 Transfer event ABI for verifying USDC transfers
const TRANSFER_EVENT_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// =============================================================================
// Middleware
// =============================================================================

/**
 * x402 payment middleware factory.
 * Returns an Express middleware that checks for payment proof.
 *
 * @param priceUSDC  Price for this endpoint in USDC (e.g., "0.01")
 */
export function requirePayment(priceUSDC?: string) {
  const price = priceUSDC || config.defaultPriceUSDC;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if x402 is disabled
    if (!config.enabled) {
      return next();
    }

    // Check for payment proof header
    const paymentProof = req.headers['x-payment-proof'] as string | undefined;

    if (!paymentProof) {
      // Return 402 with payment instructions
      return res.status(402).json({
        error: 'Payment Required',
        x402: {
          version: '1',
          payment: {
            chain: config.paymentChain,
            currency: 'USDC',
            amount: price,
            recipient: config.paymentAddress,
            usdc_address: config.usdcAddress,
          },
          instructions: 'Send USDC to the recipient address, then retry with X-Payment-Proof header containing the transaction hash.',
        },
      });
    }

    // Replay protection: reject already-used tx hashes
    const normalizedHash = paymentProof.toLowerCase();
    if (spentProofs.has(normalizedHash)) {
      return res.status(402).json({
        error: 'Payment already used',
        reason: 'This transaction hash has already been used as payment proof.',
        x402: {
          version: '1',
          payment: {
            chain: config.paymentChain,
            currency: 'USDC',
            amount: price,
            recipient: config.paymentAddress,
            usdc_address: config.usdcAddress,
          },
        },
      });
    }

    // Verify the payment proof (transaction hash)
    try {
      const verified = await verifyPaymentProof(paymentProof, price);

      if (!verified.valid) {
        return res.status(402).json({
          error: 'Payment verification failed',
          reason: verified.reason,
          x402: {
            version: '1',
            payment: {
              chain: config.paymentChain,
              currency: 'USDC',
              amount: price,
              recipient: config.paymentAddress,
              usdc_address: config.usdcAddress,
            },
          },
        });
      }

      // Payment verified — mark as spent and proceed
      spentProofs.add(normalizedHash);

      (req as any).x402 = {
        txHash: paymentProof,
        amount: price,
        chain: config.paymentChain,
        verified: true,
      };

      return next();
    } catch (error) {
      console.error('x402 verification error:', error);
      return res.status(500).json({
        error: 'Payment verification error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

// =============================================================================
// Payment Verification
// =============================================================================

/**
 * Verify a USDC payment on-chain by checking the transaction receipt.
 */
async function verifyPaymentProof(
  txHash: string,
  expectedAmountUSDC: string,
): Promise<{ valid: boolean; reason?: string }> {
  const chain = config.paymentChain === 'base' ? base : baseSepolia;

  const client = createPublicClient({
    chain,
    transport: http(),
  });

  try {
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status !== 'success') {
      return { valid: false, reason: 'Transaction failed' };
    }

    // Check transaction age
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const txAge = Math.floor(Date.now() / 1000) - Number(block.timestamp);
    if (txAge > config.maxProofAge) {
      return { valid: false, reason: `Payment too old (${txAge}s > ${config.maxProofAge}s)` };
    }

    // Look for USDC Transfer event to our payment address
    const expectedAmount = parseUSDCAmount(expectedAmountUSDC);
    let foundTransfer = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== config.usdcAddress.toLowerCase()) continue;

      // Cast to access topics (viem log type)
      const logAny = log as any;
      const topics: string[] = logAny.topics || [];

      // Check if this is a Transfer event
      // Transfer(address,address,uint256) topic0 = 0xddf252ad...
      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      if (topics[0] !== TRANSFER_TOPIC) continue;

      // Decode the 'to' address from topic2
      const toAddress = '0x' + (topics[2] || '').slice(26);
      if (toAddress.toLowerCase() !== config.paymentAddress.toLowerCase()) continue;

      // Decode value from data
      const value = BigInt(log.data);
      if (value >= expectedAmount) {
        foundTransfer = true;
        break;
      }
    }

    if (!foundTransfer) {
      return {
        valid: false,
        reason: `No qualifying USDC transfer to ${config.paymentAddress} found in tx`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Failed to verify tx: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Parse a USDC amount string (e.g., "0.01") to its 6-decimal representation.
 */
function parseUSDCAmount(amount: string): bigint {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const decimal = (parts[1] || '').padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * 1000000n + BigInt(decimal);
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Update x402 configuration at runtime.
 */
export function setX402Config(newConfig: Partial<X402Config>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current x402 configuration (without sensitive fields).
 */
export function getX402Config(): Omit<X402Config, 'paymentAddress'> & { paymentAddress: string } {
  return { ...config };
}

/**
 * Check if a tx hash has already been used as payment proof.
 */
export function isProofSpent(txHash: string): boolean {
  return spentProofs.has(txHash.toLowerCase());
}

/**
 * Get the number of spent proofs (for monitoring).
 */
export function getSpentProofsCount(): number {
  return spentProofs.size;
}

/**
 * Export parseUSDCAmount for use by payout execution.
 */
export { parseUSDCAmount };

/**
 * Reset spent proofs (for testing).
 */
export function resetSpentProofs(): void {
  spentProofs.clear();
}
