/**
 * x402 Payment Middleware (v2)
 *
 * Implements the x402 HTTP payment protocol (https://x402.org).
 * When a client sends a request without payment, the server returns HTTP 402
 * with v2 payment instructions. The client pays (USDC on-chain), then retries
 * with a payment proof header.
 *
 * Opt-in per route — wrap any Express route handler with requirePayment().
 *
 * v2 changes:
 *  - requirePayment() accepts string | RequirePaymentOptions
 *  - 402 response is v2 format (version: '2', facilitator, expires)
 *  - SpentProofs backed by SpentProofsStore (async, Redis or in-memory)
 *  - Integrates with FacilitatorRegistry for pluggable verification
 *  - Keeps all existing exports with unchanged signatures for backward compat
 */

import { Request, Response, NextFunction } from 'express';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  SpentProofsStoreFactory,
  InMemorySpentProofsStore,
} from '../../../engine/src/payment/spentProofsStore';
import type { SpentProofsStore } from '../../../engine/src/payment/spentProofsStore';
import type { FacilitatorRegistry } from '../../../engine/src/payment/facilitators';
import type { X402ResponseV2 } from '../../../engine/src/payment/types';
import { PricingService } from '../../../engine/src/payment/pricingService';
import { logger } from '../../../engine/src/lib/logger';

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
  paymentAddress: process.env.X402_PAYMENT_ADDRESS || '',
  defaultPriceUSDC: process.env.X402_DEFAULT_PRICE || '0.01',
  paymentChain: (process.env.X402_PAYMENT_CHAIN as 'base' | 'base-sepolia') || 'base-sepolia',
  usdcAddress: process.env.X402_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
  enabled: process.env.X402_ENABLED === 'true',
  maxProofAge: parseInt(process.env.X402_MAX_PROOF_AGE || '300', 10),
};

let config: X402Config = { ...DEFAULT_CONFIG };

// =============================================================================
// Spent-proofs store (lazy-initialized, async)
// =============================================================================

let spentProofsStore: SpentProofsStore | null = null;

/**
 * Get or create the spent-proofs store. Uses in-memory by default;
 * automatically upgrades to Redis if REDIS_URL is set.
 */
function getSpentProofsStore(): SpentProofsStore {
  if (!spentProofsStore) {
    spentProofsStore = SpentProofsStoreFactory.create();
  }
  return spentProofsStore;
}

/**
 * Allow external code to inject a custom store (e.g., for testing or Redis).
 */
export function setSpentProofsStore(store: SpentProofsStore): void {
  spentProofsStore = store;
}

// =============================================================================
// Dynamic Pricing (lazy singleton)
// =============================================================================

let pricingServiceInstance: PricingService | null = null;

function getPricingServiceInstance(): PricingService {
  if (!pricingServiceInstance) {
    pricingServiceInstance = new PricingService();
  }
  return pricingServiceInstance;
}

/**
 * Resolve dynamic pricing from the request body.
 * Extracts passport ID from common fields and looks up pricing in DB.
 * Returns null if no dynamic pricing is available (falls back to static).
 */
async function resolveDynamicPricing(
  req: Request,
): Promise<{ price: string; recipient: string } | null> {
  const body = req.body || {};
  const passportId = body.model || body.model_passport_id || body.passport_id;
  if (!passportId || typeof passportId !== 'string') return null;

  try {
    const pricing = await getPricingServiceInstance().getPricing(passportId);
    if (!pricing || !pricing.price_per_call) return null;

    // Convert bigint micro-units to USDC string (6 decimals)
    const microUnits = pricing.price_per_call;
    const whole = microUnits / 1000000n;
    const frac = (microUnits % 1000000n).toString().padStart(6, '0');
    const price = frac === '000000' ? whole.toString() : `${whole}.${frac}`;

    return { price, recipient: pricing.payout_address };
  } catch {
    return null;
  }
}

// =============================================================================
// FacilitatorRegistry (optional)
// =============================================================================

let facilitatorRegistry: FacilitatorRegistry | null = null;

/**
 * Set the facilitator registry for pluggable payment verification.
 */
export function setFacilitatorRegistry(registry: FacilitatorRegistry): void {
  facilitatorRegistry = registry;
}

/**
 * Get the current facilitator registry (may be null).
 */
export function getFacilitatorRegistry(): FacilitatorRegistry | null {
  return facilitatorRegistry;
}

// =============================================================================
// RequirePaymentOptions
// =============================================================================

export interface RequirePaymentOptions {
  /** Price in USDC (e.g., "0.01") */
  priceUSDC?: string;
  /** Whether pricing is dynamic (resolved per-request) */
  dynamic?: boolean;
  /** Name of the facilitator to use (default: registry default or 'direct') */
  facilitator?: string;
  /** Async predicate — if returns true, skip payment check */
  skipIf?: (req: Request) => Promise<boolean>;
}

// ERC-20 Transfer event topic0 (for built-in fallback verification)
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// =============================================================================
// Middleware
// =============================================================================

/**
 * x402 payment middleware factory.
 * Returns an Express middleware that checks for payment proof.
 *
 * Backward-compatible overloads:
 *   requirePayment()              — use default price
 *   requirePayment('0.01')        — use specific price
 *   requirePayment({ priceUSDC: '0.01', skipIf: ... }) — full options
 */
export function requirePayment(optsOrPrice?: string | RequirePaymentOptions) {
  const opts: RequirePaymentOptions =
    typeof optsOrPrice === 'string'
      ? { priceUSDC: optsOrPrice }
      : optsOrPrice ?? {};

  const facilitatorName = opts.facilitator ?? 'direct';

  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Skip if x402 is disabled
    if (!config.enabled) {
      return next();
    }

    // 1b. Fail fast if enabled but no payment address configured
    if (!config.paymentAddress) {
      return res.status(500).json({
        error: 'x402 is enabled but X402_PAYMENT_ADDRESS is not configured',
      });
    }

    // 2. Skip if skipIf predicate returns true
    if (opts.skipIf) {
      try {
        const skip = await opts.skipIf(req);
        if (skip) {
          return next();
        }
      } catch {
        // If skipIf throws, continue with payment check
      }
    }

    // 3. Resolve price — dynamic (from DB) or static (from options/config)
    let price = opts.priceUSDC || config.defaultPriceUSDC;
    let recipient = config.paymentAddress;

    if (opts.dynamic) {
      const resolved = await resolveDynamicPricing(req);
      if (resolved) {
        price = resolved.price;
        recipient = resolved.recipient;
      }
    }

    // 4. Check for payment proof header
    const paymentProof = req.headers['x-payment-proof'] as string | undefined;

    if (!paymentProof) {
      // Return 402 with v2 payment instructions
      return res.status(402).json(build402Response(price, facilitatorName, recipient));
    }

    // 5. Check spent proofs (async)
    const normalizedHash = paymentProof.toLowerCase();
    const store = getSpentProofsStore();

    try {
      const spent = await store.isSpent(normalizedHash);
      if (spent) {
        return res.status(402).json({
          error: 'Payment already used',
          reason: 'This transaction hash has already been used as payment proof.',
          x402: buildX402Block(price, facilitatorName, recipient),
        });
      }
    } catch (err) {
      logger.error('x402 spent-proof check error:', err);
      // Async store failed (e.g. Redis down) — fall back to in-memory sync cache
      // to prevent replay of proofs verified in this process instance.
      if (syncSpentCache.has(normalizedHash)) {
        return res.status(402).json({
          error: 'Payment already used',
          reason: 'This transaction hash has already been used as payment proof.',
          x402: buildX402Block(price, facilitatorName, recipient),
        });
      }
      // If not in sync cache either, reject — fail-closed to prevent replay attacks.
      return res.status(503).json({
        error: 'Payment service temporarily unavailable',
        reason: 'Replay protection store is unreachable. Please retry shortly.',
      });
    }

    // 6. Verify via facilitator or built-in fallback
    try {
      const verified = await verifyWithFacilitatorOrFallback(
        paymentProof,
        price,
        facilitatorName,
        recipient,
      );

      if (!verified.valid) {
        return res.status(402).json({
          error: 'Payment verification failed',
          reason: verified.reason,
          x402: buildX402Block(price, facilitatorName, recipient),
        });
      }

      // Payment verified — mark as spent and proceed
      syncSpentCache.add(normalizedHash);
      try {
        await store.markSpent(normalizedHash, config.maxProofAge);
      } catch (err) {
        logger.error('x402 mark-spent error (continuing):', err);
      }

      (req as any).x402 = {
        txHash: paymentProof,
        amount: price,
        recipient,
        chain: config.paymentChain,
        verified: true,
      };

      return next();
    } catch (error) {
      logger.error('x402 verification error:', error);
      return res.status(500).json({
        error: 'Payment verification error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

// =============================================================================
// v2 Response Builders
// =============================================================================

function buildX402Block(price: string, facilitatorName: string, recipient?: string): X402ResponseV2 {
  const amountMicro = parseUSDCAmount(price).toString();
  const expiresAt = Math.floor(Date.now() / 1000) + config.maxProofAge;

  return {
    version: '2',
    facilitator: facilitatorName,
    description: 'API access',
    payment: {
      chain: config.paymentChain,
      token: 'USDC',
      tokenAddress: config.usdcAddress,
      amount: amountMicro,
      recipient: recipient || config.paymentAddress,
      facilitator: facilitatorName,
      scheme: 'exact',
    },
    expires: expiresAt,
  };
}

function build402Response(price: string, facilitatorName: string, recipient?: string) {
  return {
    error: 'Payment Required',
    x402: buildX402Block(price, facilitatorName, recipient),
  };
}

// =============================================================================
// Payment Verification
// =============================================================================

/**
 * Verify a payment proof using the facilitator registry if available,
 * otherwise fall back to built-in on-chain verification.
 */
async function verifyWithFacilitatorOrFallback(
  txHash: string,
  expectedAmountUSDC: string,
  facilitatorName: string,
  recipient?: string,
): Promise<{ valid: boolean; reason?: string }> {
  const expectedRecipient = recipient || config.paymentAddress;

  // Try facilitator registry first
  if (facilitatorRegistry) {
    try {
      const facilitator =
        facilitatorRegistry.get(facilitatorName) ??
        facilitatorRegistry.getDefault();

      const result = await facilitator.verify(
        { chain: config.paymentChain, txHash },
        {
          amount: parseUSDCAmount(expectedAmountUSDC),
          token: {
            symbol: 'USDC',
            address: config.usdcAddress,
            decimals: 6,
            chain: config.paymentChain,
          },
          recipient: expectedRecipient,
        },
      );

      return { valid: result.valid, reason: result.reason };
    } catch (err) {
      logger.error('Facilitator verify failed, falling back to built-in:', err);
      // Fall through to built-in verification
    }
  }

  // Built-in fallback (original on-chain verification)
  return verifyPaymentProof(txHash, expectedAmountUSDC, expectedRecipient);
}

/**
 * Verify a USDC payment on-chain by checking the transaction receipt.
 * (Built-in fallback when no FacilitatorRegistry is available.)
 */
async function verifyPaymentProof(
  txHash: string,
  expectedAmountUSDC: string,
  recipient?: string,
): Promise<{ valid: boolean; reason?: string }> {
  const expectedRecipient = recipient || config.paymentAddress;
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

    // Look for USDC Transfer event to the expected recipient
    const expectedAmount = parseUSDCAmount(expectedAmountUSDC);
    let foundTransfer = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== config.usdcAddress.toLowerCase()) continue;

      const logAny = log as any;
      const topics: string[] = logAny.topics || [];

      if (topics[0] !== TRANSFER_TOPIC) continue;

      // Decode the 'to' address from topic2
      const toAddress = '0x' + (topics[2] || '').slice(26);
      if (toAddress.toLowerCase() !== expectedRecipient.toLowerCase()) continue;

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
        reason: `No qualifying USDC transfer to ${expectedRecipient} found in tx`,
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
// Configuration Helpers (backward-compatible exports)
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

// Synchronous spent-proofs cache — kept in sync with the async store by the
// middleware's markSpent path. Provides backward-compat for sync callers.
const syncSpentCache = new Set<string>();

/**
 * Check if a tx hash has already been used as payment proof.
 * Synchronous — uses the in-memory sync cache (backward compat).
 */
export function isProofSpent(txHash: string): boolean {
  return syncSpentCache.has(txHash.toLowerCase());
}

/**
 * Get the number of spent proofs (for monitoring).
 */
export function getSpentProofsCount(): number {
  return syncSpentCache.size;
}

/**
 * Export parseUSDCAmount for use by payout execution.
 */
export { parseUSDCAmount };

/**
 * Reset spent proofs (for testing).
 */
export function resetSpentProofs(): void {
  syncSpentCache.clear();
  // Also reset the async store — preserve the store type
  if (spentProofsStore) {
    if (spentProofsStore instanceof InMemorySpentProofsStore) {
      spentProofsStore.close(); // clears the internal set
      spentProofsStore = SpentProofsStoreFactory.createInMemory();
    } else {
      // For Redis or other stores, create a fresh instance of the same type
      spentProofsStore = SpentProofsStoreFactory.create();
    }
  }
}
