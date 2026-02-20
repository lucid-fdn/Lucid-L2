/**
 * Public types for the @lucid/8004-sdk.
 */

// =============================================================================
// Configuration
// =============================================================================

export interface LucidLayerConfig {
  /** Base URL of the LucidLayer API (e.g., "https://api.lucidlayer.com") */
  baseUrl: string;

  /** Default chain ID for operations (e.g., "apechain", "base") */
  chainId?: string;

  /** API key for authentication (optional if using x402 payment) */
  apiKey?: string;

  /** x402 auto-payment configuration */
  x402?: X402Config;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

export interface X402Config {
  /** EVM private key for signing x402 payment transactions */
  privateKey: string;

  /** Whether to automatically pay on HTTP 402 responses */
  autoPayment: boolean;
}

// =============================================================================
// Routing
// =============================================================================

export interface RouteRequest {
  /** Model metadata */
  model_meta?: Record<string, unknown>;

  /** Model passport ID */
  model_passport_id?: string;

  /** Routing policy */
  policy: Policy;

  /** Compute catalog (optional — server uses registered nodes if omitted) */
  compute_catalog?: Record<string, unknown>[];

  /** Chain ID override */
  chainId?: string;
}

export interface Policy {
  policy_version: string;
  allow_regions?: string[];
  residency_required?: boolean;
  attestation?: {
    attestation_required?: boolean;
    require_cc_on?: boolean;
    fallback_allowed?: boolean;
  };
  cost?: {
    max_price_per_1k_tokens_usd?: number;
    spot_only?: boolean;
  };
  latency?: {
    p95_ms_budget?: number;
    hard_timeout_ms?: number;
  };
  privacy?: {
    redact_pii?: boolean;
    store_inputs?: boolean;
  };
}

export interface RouteResult {
  success: boolean;
  selected?: {
    compute_passport_id: string;
    endpoint: string;
    score: number;
  };
  fallbacks?: Array<{
    compute_passport_id: string;
    endpoint: string;
    score: number;
  }>;
  policy_hash?: string;
  chainId?: string;
  error?: string;
}

export interface MatchResult {
  success: boolean;
  selected?: Record<string, unknown>;
  fallbacks?: Record<string, unknown>[];
  rejected?: Record<string, unknown>[];
  policy_hash?: string;
  error?: string;
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidateRequest {
  /** Receipt hash to validate */
  receipt_hash?: string;

  /** Run ID to validate */
  run_id?: string;

  /** Chain ID for on-chain validation */
  chainId?: string;
}

export interface ValidateResult {
  success: boolean;
  hash_valid?: boolean;
  signature_valid?: boolean;
  inclusion_valid?: boolean;
  on_chain?: {
    chainId: string;
    txHash: string;
  };
  error?: string;
}

export interface ProofResult {
  success: boolean;
  proof?: {
    leaf: string;
    leafIndex: number;
    siblings: string[];
    directions: string[];
    root: string;
  };
  error?: string;
}

// =============================================================================
// Reputation
// =============================================================================

export interface UnifiedReputation {
  success: boolean;
  agentId: string;
  unifiedScore: number;
  totalFeedbackCount: number;
  chainCount: number;
  chains?: ChainReputation[];
  error?: string;
}

export interface ChainReputation {
  chainId: string;
  agentTokenId: string;
  averageScore: number;
  feedbackCount: number;
  lastUpdated: number;
}

export interface ReceiptReputation {
  success: boolean;
  agentId: string;
  overall: number;
  components: {
    volume: number;
    reliability: number;
    performance: number;
    consistency: number;
  };
  receiptCount: number;
  validatedCount: number;
  avgTtftMs: number;
  p95TtftMs: number;
  periodDays: number;
  error?: string;
}

// =============================================================================
// Payouts
// =============================================================================

export interface PayoutCalculateRequest {
  run_id: string;
  total_amount_lamports: string;
  compute_wallet: string;
  model_wallet?: string;
  orchestrator_wallet?: string;
  config?: {
    compute_provider_bp: number;
    model_provider_bp: number;
    protocol_treasury_bp: number;
    orchestrator_bp?: number;
  };
}

export interface PayoutResult {
  success: boolean;
  payout?: {
    run_id: string;
    total_amount_lamports: string;
    recipients: Array<{
      wallet_address: string;
      role: string;
      amount_lamports: string;
      amount_bp: number;
    }>;
  };
  error?: string;
}

export interface PayoutExecuteRequest {
  run_id: string;
  chainId: string;
}

export interface PayoutExecution {
  success: boolean;
  execution?: {
    run_id: string;
    chainId: string;
    transfers: Array<{
      recipient: string;
      role: string;
      amountUSDC: string;
      txHash?: string;
      success: boolean;
      error?: string;
    }>;
    totalTransferred: string;
    executedAt: number;
  };
  error?: string;
}

// =============================================================================
// Inference
// =============================================================================

export interface InferRequest {
  /** Model to use */
  model?: string;

  /** Model passport ID */
  model_passport_id?: string;

  /** Compute passport ID (optional — uses routing if omitted) */
  compute_passport_id?: string;

  /** Routing policy */
  policy?: Policy;

  /** Prompt (for simple inference) */
  prompt?: string;

  /** Messages (for chat-style inference) */
  messages?: Array<{ role: string; content: string }>;

  /** Max tokens to generate */
  max_tokens?: number;

  /** Temperature */
  temperature?: number;

  /** Whether to stream the response */
  stream?: boolean;
}

export interface InferResult {
  success: boolean;
  response?: {
    text?: string;
    choices?: Array<{
      message: { role: string; content: string };
    }>;
  };
  receipt?: {
    run_id: string;
    receipt_hash: string;
  };
  error?: string;
}

// =============================================================================
// Chain Info
// =============================================================================

export interface ChainInfo {
  chainId: string;
  name: string;
  chainType: string;
  isTestnet: boolean;
  connected: boolean;
}

export interface ChainStatus {
  success: boolean;
  chainId: string;
  status: string;
  blockNumber?: number;
  latencyMs?: number;
  account?: string;
  error?: string;
}
