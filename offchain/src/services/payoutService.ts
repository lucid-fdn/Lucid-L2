/**
 * PR6: Payouts Minimal - Split Calculation Service
 * 
 * Handles revenue split calculation between stakeholders:
 * - Compute provider
 * - Model provider (if any royalty)
 * - Protocol treasury
 * - Optional: agent/orchestrator fee
 */

export interface SplitConfig {
  // Basis points (1 bp = 0.01%, 10000 bp = 100%)
  compute_provider_bp: number;
  model_provider_bp: number;
  protocol_treasury_bp: number;
  orchestrator_bp?: number;
}

export interface PayoutRecipient {
  wallet_address: string;
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  amount_lamports: bigint;
  amount_bp: number;
}

export interface PayoutSplit {
  run_id: string;
  total_amount_lamports: bigint;
  recipients: PayoutRecipient[];
  split_config: SplitConfig;
  created_at: number;
}

// Default split configuration (in basis points)
export const DEFAULT_SPLIT_CONFIG: SplitConfig = {
  compute_provider_bp: 7000,  // 70%
  model_provider_bp: 2000,    // 20%
  protocol_treasury_bp: 1000, // 10%
  orchestrator_bp: 0,         // 0% (optional)
};

// Protocol treasury address (MVP placeholder)
const PROTOCOL_TREASURY_ADDRESS = 'LucidTreasury111111111111111111111111111111';

/**
 * Validate split configuration (must sum to 10000 bp = 100%)
 */
export function validateSplitConfig(config: SplitConfig): { valid: boolean; error?: string } {
  const total = 
    config.compute_provider_bp + 
    config.model_provider_bp + 
    config.protocol_treasury_bp + 
    (config.orchestrator_bp || 0);

  if (total !== 10000) {
    return { 
      valid: false, 
      error: `Split config must sum to 10000 bp (100%), got ${total} bp` 
    };
  }

  if (config.compute_provider_bp < 0 || config.model_provider_bp < 0 || 
      config.protocol_treasury_bp < 0 || (config.orchestrator_bp || 0) < 0) {
    return { valid: false, error: 'Split values cannot be negative' };
  }

  return { valid: true };
}

/**
 * Calculate payout split for a run
 */
export function calculatePayoutSplit(params: {
  run_id: string;
  total_amount_lamports: bigint;
  compute_wallet: string;
  model_wallet?: string;
  orchestrator_wallet?: string;
  config?: SplitConfig;
}): PayoutSplit {
  // Always create a copy to prevent mutation of DEFAULT_SPLIT_CONFIG
  const config = { ...(params.config || DEFAULT_SPLIT_CONFIG) };
  
  // Validate config
  const validation = validateSplitConfig(config);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const recipients: PayoutRecipient[] = [];
  const total = params.total_amount_lamports;

  // Calculate compute provider share
  const computeAmount = (total * BigInt(config.compute_provider_bp)) / BigInt(10000);
  recipients.push({
    wallet_address: params.compute_wallet,
    role: 'compute',
    amount_lamports: computeAmount,
    amount_bp: config.compute_provider_bp,
  });

  // Calculate model provider share (if wallet provided)
  if (params.model_wallet && config.model_provider_bp > 0) {
    const modelAmount = (total * BigInt(config.model_provider_bp)) / BigInt(10000);
    recipients.push({
      wallet_address: params.model_wallet,
      role: 'model',
      amount_lamports: modelAmount,
      amount_bp: config.model_provider_bp,
    });
  } else if (config.model_provider_bp > 0) {
    // No model wallet, redirect to protocol treasury
    const modelAmount = (total * BigInt(config.model_provider_bp)) / BigInt(10000);
    recipients.push({
      wallet_address: PROTOCOL_TREASURY_ADDRESS,
      role: 'model',
      amount_lamports: modelAmount,
      amount_bp: config.model_provider_bp,
    });
  }

  // Calculate protocol treasury share
  const treasuryAmount = (total * BigInt(config.protocol_treasury_bp)) / BigInt(10000);
  recipients.push({
    wallet_address: PROTOCOL_TREASURY_ADDRESS,
    role: 'protocol',
    amount_lamports: treasuryAmount,
    amount_bp: config.protocol_treasury_bp,
  });

  // Calculate orchestrator share (if any)
  if (config.orchestrator_bp && config.orchestrator_bp > 0) {
    const orchestratorAmount = (total * BigInt(config.orchestrator_bp)) / BigInt(10000);
    const orchestratorWallet = params.orchestrator_wallet || PROTOCOL_TREASURY_ADDRESS;
    recipients.push({
      wallet_address: orchestratorWallet,
      role: 'orchestrator',
      amount_lamports: orchestratorAmount,
      amount_bp: config.orchestrator_bp,
    });
  }

  return {
    run_id: params.run_id,
    total_amount_lamports: total,
    recipients,
    split_config: config,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Estimate total payout for a run based on token usage
 */
export function estimatePayout(params: {
  tokens_in: number;
  tokens_out: number;
  price_per_1k_tokens_lamports: bigint;
}): bigint {
  const totalTokens = params.tokens_in + params.tokens_out;
  // price_per_1k_tokens, so multiply tokens and divide by 1000
  return (BigInt(totalTokens) * params.price_per_1k_tokens_lamports) / BigInt(1000);
}

/**
 * Create payout from receipt data
 */
export function createPayoutFromReceipt(params: {
  run_id: string;
  tokens_in: number;
  tokens_out: number;
  price_per_1k_tokens_lamports: bigint;
  compute_wallet: string;
  model_wallet?: string;
  orchestrator_wallet?: string;
  config?: SplitConfig;
}): PayoutSplit {
  const totalAmount = estimatePayout({
    tokens_in: params.tokens_in,
    tokens_out: params.tokens_out,
    price_per_1k_tokens_lamports: params.price_per_1k_tokens_lamports,
  });

  return calculatePayoutSplit({
    run_id: params.run_id,
    total_amount_lamports: totalAmount,
    compute_wallet: params.compute_wallet,
    model_wallet: params.model_wallet,
    orchestrator_wallet: params.orchestrator_wallet,
    config: params.config,
  });
}

/**
 * Verify payout split integrity
 */
export function verifyPayoutSplit(payout: PayoutSplit): { valid: boolean; error?: string } {
  // Sum of all recipient amounts should equal total
  const sum = payout.recipients.reduce((acc, r) => acc + r.amount_lamports, BigInt(0));
  
  // Allow for rounding errors up to number of recipients (due to integer division)
  const tolerance = BigInt(payout.recipients.length);
  const diff = payout.total_amount_lamports - sum;
  
  if (diff < BigInt(0) || diff > tolerance) {
    return { 
      valid: false, 
      error: `Payout amounts don't match total: expected ${payout.total_amount_lamports}, got ${sum}` 
    };
  }

  // Validate config
  const configValidation = validateSplitConfig(payout.split_config);
  if (!configValidation.valid) {
    return configValidation;
  }

  return { valid: true };
}

// In-memory store for payout splits (MVP)
const payoutStore = new Map<string, PayoutSplit>();

/**
 * Store a payout split
 */
export function storePayout(payout: PayoutSplit): void {
  payoutStore.set(payout.run_id, payout);
}

/**
 * Get a stored payout split
 */
export function getPayout(run_id: string): PayoutSplit | null {
  return payoutStore.get(run_id) || null;
}

/**
 * Get all stored payouts
 */
export function getAllPayouts(): PayoutSplit[] {
  return Array.from(payoutStore.values());
}
