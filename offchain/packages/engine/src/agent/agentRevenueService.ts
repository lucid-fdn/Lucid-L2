/**
 * Agent Revenue Service
 *
 * Connects agent receipts -> payout calculation -> revenue pool -> airdrop.
 *
 * Flow:
 * 1. receiptConsumer processes agent receipt
 * 2. Calculate payout split (agent owner gets orchestrator share)
 * 3. Accumulate agent owner's share in revenue pool
 * 4. If agent has share token: distribute to token holders via airdrop
 * 5. If no share token: direct to agent owner wallet
 */

import type { SplitConfig } from '../../finance/payoutService';

export interface AgentRevenuePool {
  agent_passport_id: string;
  accumulated_lamports: bigint;
  last_airdrop_at: number;
  total_distributed_lamports: bigint;
}

// In-memory revenue pools (MVP — will move to DB later)
const revenuePools = new Map<string, AgentRevenuePool>();

// Agent-specific split: 60% compute, 15% model, 10% protocol, 15% agent owner (orchestrator)
const AGENT_SPLIT_CONFIG: SplitConfig = {
  compute_provider_bp: 6000,  // 60%
  model_provider_bp: 1500,    // 15%
  protocol_treasury_bp: 1000, // 10%
  orchestrator_bp: 1500,      // 15% -> agent owner
};

// Default price: 0.1 LUCID per 1k tokens (in lamports — 1 LUCID = 1_000_000 lamports)
const DEFAULT_PRICE_PER_1K = BigInt(100_000);

// Airdrop threshold: 1_000_000 lamports (0.001 SOL)
const AIRDROP_THRESHOLD_LAMPORTS = BigInt(1_000_000);

/**
 * Process revenue from an agent receipt.
 * Called by receiptConsumer after processing an agent-attributed receipt.
 */
export async function processAgentRevenue(receipt: {
  agent_passport_id: string;
  run_id: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  compute_wallet?: string;
  model_wallet?: string;
  agent_owner_wallet?: string;
}): Promise<void> {
  // Lazy import to avoid circular dependencies
  const { createPayoutFromReceipt, storePayout } = await import(
    '../../finance/payoutService'
  );

  // 1. Calculate payout split using agent-specific config
  const payout = createPayoutFromReceipt({
    run_id: receipt.run_id,
    tokens_in: receipt.tokens_in,
    tokens_out: receipt.tokens_out,
    price_per_1k_tokens_lamports: DEFAULT_PRICE_PER_1K,
    compute_wallet: receipt.compute_wallet ?? 'unknown',
    model_wallet: receipt.model_wallet,
    orchestrator_wallet: receipt.agent_owner_wallet,
    config: AGENT_SPLIT_CONFIG,
  });

  // Store the payout with agent attribution
  payout.agent_passport_id = receipt.agent_passport_id;
  storePayout(payout);

  // 2. Extract the agent owner's (orchestrator) share
  const orchestratorRecipient = payout.recipients.find(
    (r) => r.role === 'orchestrator',
  );
  const ownerShare = orchestratorRecipient?.amount_lamports ?? BigInt(0);

  if (ownerShare === BigInt(0)) return;

  // 3. Update revenue pool for the agent
  const existing = revenuePools.get(receipt.agent_passport_id);
  if (existing) {
    existing.accumulated_lamports += ownerShare;
  } else {
    revenuePools.set(receipt.agent_passport_id, {
      agent_passport_id: receipt.agent_passport_id,
      accumulated_lamports: ownerShare,
      last_airdrop_at: 0,
      total_distributed_lamports: BigInt(0),
    });
  }

  const pool = revenuePools.get(receipt.agent_passport_id)!;

  // 4. Log if accumulated exceeds airdrop threshold
  // For MVP, just accumulate — airdrop is manual via triggerAgentAirdrop()
  if (pool.accumulated_lamports >= AIRDROP_THRESHOLD_LAMPORTS) {
    console.log(
      `[AgentRevenue] Agent ${receipt.agent_passport_id} accumulated ${pool.accumulated_lamports} lamports — eligible for airdrop`,
    );
  }
}

/**
 * Trigger an airdrop of accumulated revenue to share token holders.
 * Returns the amount to distribute and resets the pool.
 * Actual on-chain airdrop execution is handled by revenueAirdrop.ts.
 */
export async function triggerAgentAirdrop(
  agentPassportId: string,
): Promise<{
  distributed_lamports: bigint;
  holder_count: number;
} | null> {
  // 1. Get revenue pool
  const pool = revenuePools.get(agentPassportId);
  if (!pool || pool.accumulated_lamports === BigInt(0)) {
    return null;
  }

  // 2. Capture amount to distribute
  const distributed = pool.accumulated_lamports;

  // 3. Mark as distributed (reset accumulated, update total_distributed)
  pool.total_distributed_lamports += distributed;
  pool.accumulated_lamports = BigInt(0);
  pool.last_airdrop_at = Math.floor(Date.now() / 1000);

  // 4. Return result (actual airdrop execution is separate — revenueAirdrop.ts)
  // The caller should use runRevenueAirdrop() with the returned lamports
  return {
    distributed_lamports: distributed,
    holder_count: 0, // Resolved at execution time by revenueAirdrop.ts
  };
}

/**
 * Get revenue pool for an agent.
 */
export function getAgentRevenuePool(
  agentPassportId: string,
): AgentRevenuePool | null {
  return revenuePools.get(agentPassportId) ?? null;
}

/**
 * Get all revenue pools.
 */
export function getAllRevenuePools(): AgentRevenuePool[] {
  return Array.from(revenuePools.values());
}

/**
 * Reset all revenue pools (testing only).
 */
export function resetRevenuePools(): void {
  revenuePools.clear();
}
