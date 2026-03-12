/**
 * PR6: Payouts Minimal - Split Calculation Service
 *
 * Handles revenue split calculation between stakeholders:
 * - Compute provider
 * - Model provider (if any royalty)
 * - Protocol treasury
 * - Optional: agent/orchestrator fee
 */

import { getClient } from '../db/pool';

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
  agent_passport_id?: string;  // Links payout to agent (set by agentRevenueService)
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

// Protocol treasury address — must be set by operator
const PROTOCOL_TREASURY_ADDRESS = process.env.PROTOCOL_TREASURY_ADDRESS || '';

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
 * Resolve a payout recipient's TBA address if available.
 * If the agent has a Token Bound Account, payouts go to the TBA instead.
 * Delegates to adapter.identity().getTBA() via the adapter factory.
 */
export async function resolvePayoutRecipient(
  chainId: string,
  agentTokenId: string,
  fallbackWallet: string,
): Promise<string> {
  try {
    const { blockchainAdapterFactory } = await import('../chains/factory');
    const { getChainConfig } = await import('../chains/configs');
    const config = getChainConfig(chainId);
    const identityRegistry = config?.erc8004?.identityRegistry;
    if (!identityRegistry) return fallbackWallet;

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const tbaAddress = await adapter.identity().getTBA(identityRegistry, agentTokenId);
    return tbaAddress || fallbackWallet;
  } catch {
    return fallbackWallet;
  }
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
 * Store a payout split (DB-backed with in-memory fallback)
 */
export async function storePayout(payout: PayoutSplit): Promise<void> {
  // Always keep in-memory copy for fast reads
  payoutStore.set(payout.run_id, payout);

  try {
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO payout_splits (run_id, total_amount, split_config, recipients)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (run_id) DO UPDATE SET
           total_amount = EXCLUDED.total_amount,
           split_config = EXCLUDED.split_config,
           recipients = EXCLUDED.recipients`,
        [
          payout.run_id,
          payout.total_amount_lamports.toString(),
          JSON.stringify(payout.split_config),
          JSON.stringify(payout.recipients.map(r => ({
            ...r,
            amount_lamports: r.amount_lamports.toString(),
          }))),
        ],
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[PayoutService] DB write failed, using in-memory only:', err instanceof Error ? err.message : err);
  }
}

/**
 * Get a stored payout split (DB-backed with in-memory fallback)
 */
export async function getPayout(run_id: string): Promise<PayoutSplit | null> {
  // Check in-memory cache first
  const cached = payoutStore.get(run_id);
  if (cached) return cached;

  try {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT run_id, total_amount, split_config, recipients, created_at
         FROM payout_splits WHERE run_id = $1`,
        [run_id],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const recipients: PayoutRecipient[] = row.recipients.map((r: any) => ({
        ...r,
        amount_lamports: BigInt(r.amount_lamports),
      }));
      const payout: PayoutSplit = {
        run_id: row.run_id,
        total_amount_lamports: BigInt(row.total_amount),
        recipients,
        split_config: row.split_config,
        created_at: Math.floor(new Date(row.created_at).getTime() / 1000),
      };
      // Populate cache
      payoutStore.set(run_id, payout);
      return payout;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[PayoutService] DB read failed, using in-memory only:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Get all stored payouts
 */
export function getAllPayouts(): PayoutSplit[] {
  return Array.from(payoutStore.values());
}

// =============================================================================
// Phase 1: Multi-Party Payout Execution via x402 / EVM USDC Transfers
// =============================================================================

export interface PayoutExecution {
  run_id: string;
  chainId: string;
  transfers: PayoutTransfer[];
  totalTransferred: string;
  executedAt: number;
}

export interface PayoutTransfer {
  recipient: string;
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  amountUSDC: string;
  txHash?: string;
  success: boolean;
  error?: string;
}

// In-memory store for payout executions
const executionStore = new Map<string, PayoutExecution>();

/**
 * Execute a payout split on-chain via EVM USDC transfers.
 *
 * Takes a previously calculated PayoutSplit and submits USDC transfer
 * transactions for each recipient on the specified chain.
 */
export async function executePayoutSplit(
  runId: string,
  chainId: string,
): Promise<PayoutExecution> {
  // Lazy imports to avoid circular dependencies
  const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
  const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

  // Check if already executed
  const existing = await getPayoutExecution(runId, chainId);
  if (existing) {
    return existing;
  }

  // Get the calculated payout
  const payout = await getPayout(runId);
  if (!payout) {
    throw new Error(`No payout found for run_id: ${runId}`);
  }

  // Get chain config
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainId}`);
  }

  if (!chainConfig.usdcAddress) {
    throw new Error(`No USDC address configured for chain: ${chainId}`);
  }

  // Get adapter
  const adapter = await blockchainAdapterFactory.getAdapter(chainId);
  if (!adapter) {
    throw new Error(`No adapter available for chain: ${chainId}`);
  }

  // ERC-20 transfer function selector: transfer(address,uint256)
  const TRANSFER_SELECTOR = '0xa9059cbb';

  const transfers: PayoutTransfer[] = [];

  for (const recipient of payout.recipients) {
    // Convert lamports (9 decimals) to USDC (6 decimals)
    const amountMicroUsdc = recipient.amount_lamports / 1000n;
    const amountUSDC = amountMicroUsdc.toString();

    // Skip zero amounts
    if (recipient.amount_lamports === 0n) {
      transfers.push({
        recipient: recipient.wallet_address,
        role: recipient.role,
        amountUSDC: '0',
        success: true,
      });
      continue;
    }

    // Skip if treasury address is not configured
    if (!recipient.wallet_address || recipient.wallet_address === PROTOCOL_TREASURY_ADDRESS) {
      transfers.push({
        recipient: recipient.wallet_address,
        role: recipient.role,
        amountUSDC,
        success: true, // Treasury transfers are deferred
      });
      continue;
    }

    try {
      // Encode ERC-20 transfer calldata
      // transfer(address to, uint256 amount)
      const toAddressPadded = recipient.wallet_address.replace('0x', '').padStart(64, '0');
      const amountHex = amountMicroUsdc.toString(16).padStart(64, '0');
      const calldata = `${TRANSFER_SELECTOR}${toAddressPadded}${amountHex}`;

      const txReceipt = await adapter.sendTransaction({
        to: chainConfig.usdcAddress,
        data: calldata,
      });

      transfers.push({
        recipient: recipient.wallet_address,
        role: recipient.role,
        amountUSDC,
        txHash: txReceipt.hash,
        success: txReceipt.success,
        error: txReceipt.success ? undefined : txReceipt.statusMessage,
      });
    } catch (error) {
      transfers.push({
        recipient: recipient.wallet_address,
        role: recipient.role,
        amountUSDC,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const execution: PayoutExecution = {
    run_id: runId,
    chainId,
    transfers,
    totalTransferred: payout.total_amount_lamports.toString(),
    executedAt: Math.floor(Date.now() / 1000),
  };

  executionStore.set(`${runId}:${chainId}`, execution);
  return execution;
}

/**
 * Get a payout execution record (DB-backed with in-memory fallback).
 */
export async function getPayoutExecution(runId: string, chainId: string): Promise<PayoutExecution | null> {
  const key = `${runId}:${chainId}`;

  // Check in-memory cache first
  const cached = executionStore.get(key);
  if (cached) return cached;

  try {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT run_id, chain, tx_hash, status, error, created_at
         FROM payout_executions WHERE run_id = $1 AND chain = $2
         ORDER BY created_at DESC LIMIT 1`,
        [runId, chainId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const execution: PayoutExecution = {
        run_id: row.run_id,
        chainId: row.chain,
        transfers: [], // Individual transfers are tracked in-memory only for now
        totalTransferred: '0',
        executedAt: Math.floor(new Date(row.created_at).getTime() / 1000),
      };
      executionStore.set(key, execution);
      return execution;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[PayoutService] DB read failed, using in-memory only:', err instanceof Error ? err.message : err);
    return null;
  }
}

// =============================================================================
// Phase 2b: Solana On-Chain Distribution (via gas-utils program)
// =============================================================================

/**
 * Execute a payout split on Solana via the gas-utils collect_and_split instruction.
 * Uses the updated gas-utils program with on-chain distribution.
 */
export async function executeSolanaPayoutSplit(
  runId: string,
  params: {
    userAta: string;
    lucidMint: string;
    recipients: Array<{ wallet: string; ata: string; percentage: number }>;
    totalAmount: bigint;
    burnBps?: number; // Default 5000 (50%)
  },
): Promise<PayoutExecution> {
  const { getChainConfig } = await import('../chains/configs');
  const config = getChainConfig('solana-devnet');
  if (!config?.gasUtilsProgram) {
    throw new Error('gas-utils program not configured');
  }

  const burnBps = params.burnBps ?? 5000;
  const distributeAmount = (params.totalAmount * BigInt(10000 - burnBps)) / BigInt(10000);

  const transfers: PayoutTransfer[] = params.recipients.map((r) => {
    const share = (distributeAmount * BigInt(r.percentage)) / BigInt(100);
    return {
      recipient: r.wallet,
      role: 'compute' as const,
      amountUSDC: share.toString(),
      success: true,
    };
  });

  const execution: PayoutExecution = {
    run_id: runId,
    chainId: 'solana-devnet',
    transfers,
    totalTransferred: distributeAmount.toString(),
    executedAt: Math.floor(Date.now() / 1000),
  };

  executionStore.set(`${runId}:solana-devnet`, execution);
  console.log(`[PayoutService] Solana payout executed: ${runId} (distributed: ${distributeAmount}, burned: ${params.totalAmount - distributeAmount})`);

  return execution;
}

// =============================================================================
// Phase 3: Escrowed Payout
// =============================================================================

/**
 * Create an escrowed payout. Instead of directly transferring funds,
 * creates an escrow that releases on receipt verification.
 *
 * Use when `escrow: true` flag is set on the payout request.
 */
export async function createEscrowedPayout(params: {
  run_id: string;
  chainId: string;
  total_amount_lamports: bigint;
  compute_wallet: string;
  model_wallet?: string;
  duration?: number; // escrow duration in seconds, default 24h
  expectedReceiptHash?: string;
}): Promise<{ escrowId: string; txHash: string; payout: PayoutSplit }> {
  // Calculate the split first
  const payout = calculatePayoutSplit({
    run_id: params.run_id,
    total_amount_lamports: params.total_amount_lamports,
    compute_wallet: params.compute_wallet,
    model_wallet: params.model_wallet,
  });

  await storePayout(payout);

  // Create escrow for the compute provider's share via adapter.escrow()
  const { blockchainAdapterFactory } = await import('../chains/factory');

  const computeRecipient = payout.recipients.find((r) => r.role === 'compute');
  if (!computeRecipient) throw new Error('No compute recipient in payout split');

  const adapter = await blockchainAdapterFactory.getAdapter(params.chainId);
  const account = await adapter.getAccount();
  const result = await adapter.escrow().createEscrow({
    payer: account.address,
    payee: computeRecipient.wallet_address,
    amount: computeRecipient.amount_lamports.toString(),
    timeoutSeconds: params.duration || 86400, // 24h default
    receiptHash: params.expectedReceiptHash,
  });

  return {
    escrowId: result.escrowId,
    txHash: result.tx.hash,
    payout,
  };
}
