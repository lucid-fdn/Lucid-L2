/**
 * Quote Service for BYO Runtime Worker
 * 
 * Manages quote creation, validation, and replay protection.
 * In byo_runtime mode, quotes are signed by the worker's ed25519 key.
 * 
 * Key features:
 * - Single-use quote enforcement (replay protection)
 * - Worker-signed quotes
 * - Expiration validation
 * - Binding field verification
 * 
 * @module quoteService
 */

import { v4 as uuid } from 'uuid';
import { canonicalSha256Hex } from '../../utils/hash';
import { WorkerSigningService } from './signingService';
import type { OfferQuote, WorkerIdentity } from '../../types/fluidCompute';

/**
 * Quote creation input
 */
export interface QuoteInput {
  offer_id: string;
  model_id: string;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  policy_hash?: string;
  terms_hash?: string;
}

/**
 * Quote validation result
 */
export interface QuoteValidationResult {
  valid: boolean;
  error?: string;
  expired?: boolean;
  replayed?: boolean;
}

/**
 * Pricing tier configuration
 */
export interface PricingTier {
  base_cost_per_1k_input: number;  // lamports per 1k input tokens
  base_cost_per_1k_output: number; // lamports per 1k output tokens
  currency: 'lamports' | 'usd_cents' | 'credits';
}

/**
 * Quote Service for worker-signed quotes with replay protection
 */
export class QuoteService {
  private signingService: WorkerSigningService;
  private workerIdentity: WorkerIdentity;
  private usedQuoteIds: Set<string>;
  private usedQuoteHashes: Set<string>;
  private quoteTtlSeconds: number;
  private pricing: PricingTier;
  private maxQuotesInMemory: number;

  constructor(
    signingService: WorkerSigningService,
    workerIdentity: WorkerIdentity,
    options?: {
      quoteTtlSeconds?: number;
      pricing?: Partial<PricingTier>;
      maxQuotesInMemory?: number;
    }
  ) {
    this.signingService = signingService;
    this.workerIdentity = workerIdentity;
    this.usedQuoteIds = new Set();
    this.usedQuoteHashes = new Set();
    this.quoteTtlSeconds = options?.quoteTtlSeconds || 300; // 5 minutes default
    this.maxQuotesInMemory = options?.maxQuotesInMemory || 10000;
    
    // Default pricing (can be overridden)
    this.pricing = {
      base_cost_per_1k_input: 10,   // 10 lamports per 1k input tokens
      base_cost_per_1k_output: 30,  // 30 lamports per 1k output tokens
      currency: 'lamports',
      ...options?.pricing,
    };
  }

  /**
   * Create a new signed quote.
   */
  createQuote(input: QuoteInput): OfferQuote {
    const quote_id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const expires_at = now + this.quoteTtlSeconds;

    // Calculate price based on estimated tokens
    const inputTokens = input.estimated_input_tokens || 1000;
    const outputTokens = input.estimated_output_tokens || 500;
    const price = this.calculatePrice(inputTokens, outputTokens);

    // Build quote body (for hashing)
    const quoteBody = {
      quote_id,
      offer_id: input.offer_id,
      model_id: input.model_id,
      policy_hash: input.policy_hash || this.computeDefaultPolicyHash(),
      max_input_tokens: inputTokens,
      max_output_tokens: outputTokens,
      price: {
        amount: price,
        currency: this.pricing.currency,
      },
      expires_at,
      worker_pubkey: this.signingService.getPublicKey(),
    };

    // Add optional terms_hash if provided
    if (input.terms_hash) {
      (quoteBody as Record<string, unknown>).terms_hash = input.terms_hash;
    }

    // Compute quote hash
    const quote_hash = this.computeQuoteHash(quoteBody);

    // Sign the quote hash
    const { signature } = this.signingService.signHash(quote_hash);

    // Build full quote
    const quote: OfferQuote = {
      quote_id,
      offer_id: input.offer_id,
      model_id: input.model_id,
      policy_hash: quoteBody.policy_hash,
      max_input_tokens: inputTokens,
      max_output_tokens: outputTokens,
      price: quoteBody.price,
      expires_at,
      worker_pubkey: quoteBody.worker_pubkey,
      quote_hash,
      quote_signature: signature,
    };

    if (input.terms_hash) {
      quote.terms_hash = input.terms_hash;
    }

    return quote;
  }

  /**
   * Validate a quote for use.
   */
  validateQuote(quote: OfferQuote): QuoteValidationResult {
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (quote.expires_at < now) {
      return {
        valid: false,
        error: 'Quote has expired',
        expired: true,
      };
    }

    // Check replay - quote_id
    if (this.usedQuoteIds.has(quote.quote_id)) {
      return {
        valid: false,
        error: 'Quote has already been used (quote_id replay)',
        replayed: true,
      };
    }

    // Check replay - quote_hash (belt + suspenders)
    if (this.usedQuoteHashes.has(quote.quote_hash)) {
      return {
        valid: false,
        error: 'Quote has already been used (quote_hash replay)',
        replayed: true,
      };
    }

    // Verify quote hash
    const computedHash = this.computeQuoteHash({
      quote_id: quote.quote_id,
      offer_id: quote.offer_id,
      model_id: quote.model_id,
      policy_hash: quote.policy_hash,
      max_input_tokens: quote.max_input_tokens,
      max_output_tokens: quote.max_output_tokens,
      price: quote.price,
      expires_at: quote.expires_at,
      worker_pubkey: quote.worker_pubkey,
      terms_hash: quote.terms_hash,
    });

    if (computedHash !== quote.quote_hash) {
      return {
        valid: false,
        error: 'Quote hash verification failed',
      };
    }

    // Verify signature
    const signatureValid = WorkerSigningService.verifyHash(
      quote.quote_hash,
      quote.quote_signature,
      quote.worker_pubkey || this.signingService.getPublicKey()
    );

    if (!signatureValid) {
      return {
        valid: false,
        error: 'Quote signature verification failed',
      };
    }

    return { valid: true };
  }

  /**
   * Validate quote bindings against job request.
   */
  validateQuoteBindings(
    quote: OfferQuote,
    jobRequest: {
      offer_id: string;
      model_id: string;
      policy_hash?: string;
    }
  ): QuoteValidationResult {
    // First, validate the quote itself
    const quoteValidation = this.validateQuote(quote);
    if (!quoteValidation.valid) {
      return quoteValidation;
    }

    // Check offer_id binding
    if (quote.offer_id !== jobRequest.offer_id) {
      return {
        valid: false,
        error: `Quote offer_id mismatch: expected ${jobRequest.offer_id}, got ${quote.offer_id}`,
      };
    }

    // Check model_id binding
    if (quote.model_id !== jobRequest.model_id) {
      return {
        valid: false,
        error: `Quote model_id mismatch: expected ${jobRequest.model_id}, got ${quote.model_id}`,
      };
    }

    // Check policy_hash binding (if provided in job request)
    if (jobRequest.policy_hash && quote.policy_hash !== jobRequest.policy_hash) {
      return {
        valid: false,
        error: `Quote policy_hash mismatch: expected ${jobRequest.policy_hash}, got ${quote.policy_hash}`,
      };
    }

    return { valid: true };
  }

  /**
   * Mark a quote as used (for replay protection).
   */
  markQuoteUsed(quoteId: string, quoteHash?: string): void {
    // Cleanup if we've accumulated too many quotes
    if (this.usedQuoteIds.size >= this.maxQuotesInMemory) {
      this.cleanupOldQuotes();
    }

    this.usedQuoteIds.add(quoteId);
    if (quoteHash) {
      this.usedQuoteHashes.add(quoteHash);
    }
  }

  /**
   * Check if a quote has been used.
   */
  isQuoteUsed(quoteId: string): boolean {
    return this.usedQuoteIds.has(quoteId);
  }

  /**
   * Check if a quote hash has been used.
   */
  isQuoteHashUsed(quoteHash: string): boolean {
    return this.usedQuoteHashes.has(quoteHash);
  }

  /**
   * Compute quote hash from quote body.
   */
  computeQuoteHash(quoteBody: {
    quote_id: string;
    offer_id: string;
    model_id: string;
    policy_hash: string;
    max_input_tokens: number;
    max_output_tokens: number;
    price: { amount: number; currency: string };
    expires_at: number;
    worker_pubkey?: string;
    terms_hash?: string;
  }): string {
    const hashInput: Record<string, unknown> = {
      quote_id: quoteBody.quote_id,
      offer_id: quoteBody.offer_id,
      model_id: quoteBody.model_id,
      policy_hash: quoteBody.policy_hash,
      max_input_tokens: quoteBody.max_input_tokens,
      max_output_tokens: quoteBody.max_output_tokens,
      price: quoteBody.price,
      expires_at: quoteBody.expires_at,
    };

    // Only include optional fields if present
    if (quoteBody.worker_pubkey) {
      hashInput.worker_pubkey = quoteBody.worker_pubkey;
    }
    if (quoteBody.terms_hash) {
      hashInput.terms_hash = quoteBody.terms_hash;
    }

    return canonicalSha256Hex(hashInput);
  }

  /**
   * Calculate price based on token counts.
   */
  calculatePrice(inputTokens: number, outputTokens: number): number {
    const inputCost = Math.ceil((inputTokens / 1000) * this.pricing.base_cost_per_1k_input);
    const outputCost = Math.ceil((outputTokens / 1000) * this.pricing.base_cost_per_1k_output);
    return inputCost + outputCost;
  }

  /**
   * Compute default policy hash (for development).
   */
  private computeDefaultPolicyHash(): string {
    const defaultPolicy = {
      version: '1.0',
      provider: this.workerIdentity.provider_passport_id,
      worker_id: this.workerIdentity.worker_id,
      execution_mode: this.workerIdentity.execution_mode,
    };
    return canonicalSha256Hex(defaultPolicy);
  }

  /**
   * Cleanup old quotes (simple FIFO approach).
   * In production, use Redis with TTL.
   */
  private cleanupOldQuotes(): void {
    // Remove oldest half of quotes
    const idsArray = Array.from(this.usedQuoteIds);
    const hashesArray = Array.from(this.usedQuoteHashes);
    
    const keepCount = Math.floor(this.maxQuotesInMemory / 2);
    
    this.usedQuoteIds = new Set(idsArray.slice(-keepCount));
    this.usedQuoteHashes = new Set(hashesArray.slice(-keepCount));
    
    console.log(`[QuoteService] Cleaned up quotes, kept ${keepCount} most recent`);
  }

  /**
   * Get current pricing configuration.
   */
  getPricing(): PricingTier {
    return { ...this.pricing };
  }

  /**
   * Update pricing configuration.
   */
  setPricing(pricing: Partial<PricingTier>): void {
    this.pricing = { ...this.pricing, ...pricing };
  }

  /**
   * Get quote TTL in seconds.
   */
  getQuoteTtl(): number {
    return this.quoteTtlSeconds;
  }

  /**
   * Set quote TTL in seconds.
   */
  setQuoteTtl(seconds: number): void {
    this.quoteTtlSeconds = seconds;
  }

  /**
   * Get statistics about quote usage.
   */
  getStats(): {
    used_quote_ids: number;
    used_quote_hashes: number;
    max_quotes: number;
    quote_ttl_seconds: number;
  } {
    return {
      used_quote_ids: this.usedQuoteIds.size,
      used_quote_hashes: this.usedQuoteHashes.size,
      max_quotes: this.maxQuotesInMemory,
      quote_ttl_seconds: this.quoteTtlSeconds,
    };
  }

  /**
   * Reset all state (for testing).
   */
  reset(): void {
    this.usedQuoteIds.clear();
    this.usedQuoteHashes.clear();
  }
}