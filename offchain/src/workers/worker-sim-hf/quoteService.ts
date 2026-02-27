/**
 * Quote Service - Creates and validates offer quotes
 * 
 * Implements replay-protected pricing quotes with signature verification.
 * Each quote is bound to a specific model, policy, and token limits.
 * 
 * @module quoteService
 */

import { v4 as uuid } from 'uuid';
import { computeQuoteHash, verifyQuoteHash } from '../../services/receipt/receiptService';
import { signMessage, verifySignature, getOrchestratorPublicKey } from '../../utils/signing';
import type {
  OfferQuote,
  WorkerIdentity,
  QuoteRequest,
  Price,
  CapacityHint,
} from '../../types/fluidCompute';

/**
 * Pricing configuration for different models
 */
interface ModelPricing {
  per_input_token: number;
  per_output_token: number;
  minimum_charge: number;
  currency: 'lamports' | 'usd_cents' | 'credits';
  /** GPU rate per second in USD (for runpod_serverless billing) */
  gpu_rate_per_sec?: number;
}

/**
 * Default pricing for popular models (in lamports)
 * gpu_rate_per_sec is in USD for runpod_serverless billing transparency
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Meta Llama models
  'meta-llama/Meta-Llama-3.1-8B-Instruct': {
    per_input_token: 5,
    per_output_token: 15,
    minimum_charge: 1000,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000231, // A10G tier
  },
  'meta-llama/Meta-Llama-3.1-70B-Instruct': {
    per_input_token: 50,
    per_output_token: 150,
    minimum_charge: 5000,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000556, // A100-80GB tier
  },
  // Mistral models
  'mistralai/Mistral-7B-Instruct-v0.3': {
    per_input_token: 5,
    per_output_token: 15,
    minimum_charge: 1000,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000231, // A10G tier
  },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': {
    per_input_token: 20,
    per_output_token: 60,
    minimum_charge: 2000,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000386, // A100-40GB tier
  },
  // Microsoft Phi
  'microsoft/Phi-3-mini-4k-instruct': {
    per_input_token: 3,
    per_output_token: 10,
    minimum_charge: 500,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000122, // RTX 4090 tier
  },
  // Qwen
  'Qwen/Qwen2.5-72B-Instruct': {
    per_input_token: 50,
    per_output_token: 150,
    minimum_charge: 5000,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000556, // A100-80GB tier
  },
  // Google Gemma
  'google/gemma-2-9b-it': {
    per_input_token: 8,
    per_output_token: 24,
    minimum_charge: 1500,
    currency: 'lamports',
    gpu_rate_per_sec: 0.000231, // A10G tier
  },
};

/**
 * Default pricing for unknown models
 */
const DEFAULT_PRICING: ModelPricing = {
  per_input_token: 10,
  per_output_token: 30,
  minimum_charge: 2000,
  currency: 'lamports',
  gpu_rate_per_sec: 0.000231, // Default to A10G tier
};

/**
 * Quote expiration time in seconds (5 minutes)
 */
const QUOTE_EXPIRY_SECONDS = 300;

/**
 * Quote Service for creating and managing offer quotes
 */
export class QuoteService {
  private workerIdentity: WorkerIdentity;
  private issuedQuotes: Map<string, OfferQuote>;
  private usedQuotes: Set<string>; // Track used quote_ids for replay protection

  constructor(workerIdentity: WorkerIdentity) {
    this.workerIdentity = workerIdentity;
    this.issuedQuotes = new Map();
    this.usedQuotes = new Set();

    // Clean up expired quotes periodically
    setInterval(() => this.cleanupExpiredQuotes(), 60000);
  }

  /**
   * Create a new offer quote
   */
  async createQuote(request: QuoteRequest): Promise<OfferQuote> {
    const {
      offer_id,
      model_id,
      estimated_input_tokens = 1000,
      estimated_output_tokens = 500,
      policy_hash = 'default_policy',
    } = request;

    // Get pricing for model
    const pricing = MODEL_PRICING[model_id] || DEFAULT_PRICING;

    // Calculate price
    const inputCost = estimated_input_tokens * pricing.per_input_token;
    const outputCost = estimated_output_tokens * pricing.per_output_token;
    const totalCost = Math.max(inputCost + outputCost, pricing.minimum_charge);

    // Generate quote ID (UUID nonce)
    const quote_id = `quote_${uuid().replace(/-/g, '')}`;

    // Set expiration
    const expires_at = Math.floor(Date.now() / 1000) + QUOTE_EXPIRY_SECONDS;

    // Build quote body (without hash and signature)
    const quoteBody: Omit<OfferQuote, 'quote_hash' | 'quote_signature'> = {
      quote_id,
      offer_id,
      model_id,
      policy_hash,
      max_input_tokens: estimated_input_tokens,
      max_output_tokens: estimated_output_tokens,
      price: {
        amount: totalCost,
        currency: pricing.currency,
        gpu_rate_per_sec: pricing.gpu_rate_per_sec,
      },
      // Include capacity_bucket if worker has one (for runpod_serverless)
      capacity_bucket: this.workerIdentity.capacity_bucket,
      expires_at,
      capacity_hint: this.getCapacityHint(),
      worker_pubkey: getOrchestratorPublicKey(),
    };

    // Compute quote hash
    const quote_hash = computeQuoteHash(quoteBody);

    // Sign the hash
    const { signature } = signMessage(quote_hash);

    // Build complete quote
    const quote: OfferQuote = {
      ...quoteBody,
      quote_hash,
      quote_signature: signature,
    };

    // Store quote for later validation
    this.issuedQuotes.set(quote_id, quote);

    console.log(`[QuoteService] Created quote ${quote_id} for ${model_id}: ${totalCost} ${pricing.currency}`);

    return quote;
  }

  /**
   * Validate a quote for job execution
   */
  validateQuote(quote: OfferQuote): {
    valid: boolean;
    error?: string;
    error_code?: string;
  } {
    // Check if quote has been used (replay protection)
    if (this.usedQuotes.has(quote.quote_id)) {
      return {
        valid: false,
        error: 'Quote has already been used',
        error_code: 'QUOTE_ALREADY_USED',
      };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (quote.expires_at < now) {
      return {
        valid: false,
        error: 'Quote has expired',
        error_code: 'QUOTE_EXPIRED',
      };
    }

    // Verify quote hash
    if (!verifyQuoteHash(quote)) {
      return {
        valid: false,
        error: 'Quote hash does not match',
        error_code: 'QUOTE_HASH_MISMATCH',
      };
    }

    // Verify signature
    const signatureValid = verifySignature(
      quote.quote_hash,
      quote.quote_signature,
      quote.worker_pubkey || getOrchestratorPublicKey()
    );

    if (!signatureValid) {
      return {
        valid: false,
        error: 'Invalid quote signature',
        error_code: 'INVALID_QUOTE_SIGNATURE',
      };
    }

    // Check if we issued this quote (optional - for extra security)
    const issuedQuote = this.issuedQuotes.get(quote.quote_id);
    if (!issuedQuote) {
      // Quote wasn't issued by this worker - could still be valid if signed by orchestrator
      console.warn(`[QuoteService] Quote ${quote.quote_id} was not issued by this worker`);
    }

    return { valid: true };
  }

  /**
   * Mark a quote as used (for replay protection)
   */
  markQuoteUsed(quote_id: string): void {
    this.usedQuotes.add(quote_id);
    // Remove from issued quotes
    this.issuedQuotes.delete(quote_id);
  }

  /**
   * Get current capacity hint
   */
  private getCapacityHint(): CapacityHint {
    // In managed_endpoint mode, we don't have direct queue visibility
    // Return conservative estimates
    return {
      available_slots: 5,
      estimated_wait_ms: 2000,
      queue_depth: 0,
    };
  }

  /**
   * Clean up expired quotes
   */
  private cleanupExpiredQuotes(): void {
    const now = Math.floor(Date.now() / 1000);
    let cleaned = 0;

    for (const [quote_id, quote] of this.issuedQuotes) {
      if (quote.expires_at < now) {
        this.issuedQuotes.delete(quote_id);
        cleaned++;
      }
    }

    // Also clean up old used quotes (keep for 1 hour)
    // Note: In production, this should be persisted to prevent replay across restarts
    
    if (cleaned > 0) {
      console.log(`[QuoteService] Cleaned up ${cleaned} expired quotes`);
    }
  }

  /**
   * Get pricing for a model
   */
  getModelPricing(model_id: string): ModelPricing {
    return MODEL_PRICING[model_id] || DEFAULT_PRICING;
  }

  /**
   * Check if a quote exists and is valid
   */
  hasValidQuote(quote_id: string): boolean {
    const quote = this.issuedQuotes.get(quote_id);
    if (!quote) return false;
    
    const now = Math.floor(Date.now() / 1000);
    return quote.expires_at >= now && !this.usedQuotes.has(quote_id);
  }

  /**
   * Get stats about quotes
   */
  getStats(): {
    issued_quotes: number;
    used_quotes: number;
  } {
    return {
      issued_quotes: this.issuedQuotes.size,
      used_quotes: this.usedQuotes.size,
    };
  }
}
