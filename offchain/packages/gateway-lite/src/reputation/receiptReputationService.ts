/**
 * Receipt-Based Reputation Service
 *
 * Computes objective, Sybil-resistant reputation from verified receipts.
 * An agent's reputation is derived from real work (receipts) rather than
 * subjective votes — solving Gap #5 from the EVM Multi-Chain Strategy.
 *
 * Score components:
 *   Volume     (0.25) — receipt count, normalized
 *   Reliability (0.35) — validation pass rate
 *   Performance (0.25) — normalized TTFT + throughput
 *   Consistency (0.15) — 1 - coefficient of variation of latencies
 */

import { listReceipts, listExtendedReceipts, verifyReceipt } from '../../../engine/src/receipt/receiptService';
import type { SignedReceipt, ExtendedSignedReceipt } from '../../../engine/src/receipt/receiptService';
import { blockchainAdapterFactory } from '../../../engine/src/chain/blockchain/BlockchainAdapterFactory';

// =============================================================================
// Types
// =============================================================================

export interface ReceiptReputationScore {
  agentId: string;
  /** Overall score (0–100) */
  overall: number;
  /** Component scores (0–100 each) */
  components: {
    volume: number;
    reliability: number;
    performance: number;
    consistency: number;
  };
  /** Raw stats */
  receiptCount: number;
  validatedCount: number;
  avgTtftMs: number;
  p95TtftMs: number;
  avgTokensPerReceipt: number;
  /** Period covered (days) */
  periodDays: number;
  /** When this score was computed */
  computedAt: number;
}

// Component weights
const WEIGHT_VOLUME = 0.25;
const WEIGHT_RELIABILITY = 0.35;
const WEIGHT_PERFORMANCE = 0.25;
const WEIGHT_CONSISTENCY = 0.15;

// Volume scoring: logarithmic scale
// 1 receipt = ~20, 10 = ~50, 100 = ~75, 1000 = ~100
const VOLUME_LOG_BASE = 1000;

// Performance: TTFT target (lower is better)
const TTFT_TARGET_MS = 200;
const TTFT_MAX_MS = 5000;

// Cache for computed scores
const scoreCache = new Map<string, ReceiptReputationScore>();

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Compute receipt-based reputation for an agent.
 *
 * Scans the receipt store for receipts where the agent is either
 * the compute_passport_id or model_passport_id.
 */
export function computeReceiptReputation(agentId: string): ReceiptReputationScore {
  // Gather all receipts for this agent
  const allReceipts = listReceipts();
  const allExtended = listExtendedReceipts();

  const agentReceipts = allReceipts.filter(
    r => r.compute_passport_id === agentId || r.model_passport_id === agentId
  );
  const agentExtended = allExtended.filter(
    r => r.compute_passport_id === agentId || r.model_passport_id === agentId
  );

  const totalCount = agentReceipts.length + agentExtended.length;

  if (totalCount === 0) {
    const empty: ReceiptReputationScore = {
      agentId,
      overall: 0,
      components: { volume: 0, reliability: 0, performance: 0, consistency: 0 },
      receiptCount: 0,
      validatedCount: 0,
      avgTtftMs: 0,
      p95TtftMs: 0,
      avgTokensPerReceipt: 0,
      periodDays: 0,
      computedAt: Math.floor(Date.now() / 1000),
    };
    scoreCache.set(agentId, empty);
    return empty;
  }

  // Collect metrics from all receipts
  const ttfts: number[] = [];
  const tokenCounts: number[] = [];
  let validatedCount = 0;
  let oldestTimestamp = Infinity;
  let newestTimestamp = 0;

  for (const receipt of agentReceipts) {
    ttfts.push(receipt.metrics.ttft_ms);
    tokenCounts.push(receipt.metrics.tokens_in + receipt.metrics.tokens_out);

    if (receipt.timestamp < oldestTimestamp) oldestTimestamp = receipt.timestamp;
    if (receipt.timestamp > newestTimestamp) newestTimestamp = receipt.timestamp;

    // Verify receipt to check validation status
    const verification = verifyReceipt(receipt.run_id);
    if (verification.hash_valid && verification.signature_valid) {
      validatedCount++;
    }
  }

  for (const receipt of agentExtended) {
    ttfts.push(receipt.metrics.ttft_ms);
    tokenCounts.push(receipt.metrics.tokens_in + receipt.metrics.tokens_out);

    if (receipt.timestamp < oldestTimestamp) oldestTimestamp = receipt.timestamp;
    if (receipt.timestamp > newestTimestamp) newestTimestamp = receipt.timestamp;

    // Extended receipts are always validated at creation
    validatedCount++;
  }

  // Calculate period
  const now = Math.floor(Date.now() / 1000);
  const periodSeconds = newestTimestamp > oldestTimestamp
    ? newestTimestamp - oldestTimestamp
    : 1;
  const periodDays = Math.max(1, Math.ceil(periodSeconds / 86400));

  // --- Volume Score ---
  // Logarithmic: score = min(100, 100 * log(count+1) / log(VOLUME_LOG_BASE+1))
  const volumeScore = Math.min(
    100,
    (100 * Math.log(totalCount + 1)) / Math.log(VOLUME_LOG_BASE + 1)
  );

  // --- Reliability Score ---
  // Simple pass rate: validated / total * 100
  const reliabilityScore = totalCount > 0
    ? (validatedCount / totalCount) * 100
    : 0;

  // --- Performance Score ---
  // Based on average TTFT: 100 at target, 0 at max
  const avgTtft = ttfts.length > 0
    ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length
    : TTFT_MAX_MS;
  const performanceScore = Math.max(0, Math.min(100,
    100 * (1 - (avgTtft - TTFT_TARGET_MS) / (TTFT_MAX_MS - TTFT_TARGET_MS))
  ));

  // --- Consistency Score ---
  // 1 - coefficient of variation (stddev / mean), clamped to [0, 100]
  let consistencyScore = 100;
  if (ttfts.length > 1) {
    const mean = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;
    if (mean > 0) {
      const variance = ttfts.reduce((sum, t) => sum + (t - mean) ** 2, 0) / ttfts.length;
      const cv = Math.sqrt(variance) / mean;
      consistencyScore = Math.max(0, Math.min(100, (1 - cv) * 100));
    }
  }

  // Calculate p95 TTFT
  const sortedTtfts = [...ttfts].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedTtfts.length * 0.95);
  const p95Ttft = sortedTtfts[p95Index] || 0;

  // Average tokens per receipt
  const avgTokens = tokenCounts.length > 0
    ? tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
    : 0;

  // Weighted overall score
  const overall = Math.round(
    volumeScore * WEIGHT_VOLUME +
    reliabilityScore * WEIGHT_RELIABILITY +
    performanceScore * WEIGHT_PERFORMANCE +
    consistencyScore * WEIGHT_CONSISTENCY
  );

  const score: ReceiptReputationScore = {
    agentId,
    overall: Math.max(0, Math.min(100, overall)),
    components: {
      volume: Math.round(volumeScore * 100) / 100,
      reliability: Math.round(reliabilityScore * 100) / 100,
      performance: Math.round(performanceScore * 100) / 100,
      consistency: Math.round(consistencyScore * 100) / 100,
    },
    receiptCount: totalCount,
    validatedCount,
    avgTtftMs: Math.round(avgTtft),
    p95TtftMs: Math.round(p95Ttft),
    avgTokensPerReceipt: Math.round(avgTokens),
    periodDays,
    computedAt: Math.floor(Date.now() / 1000),
  };

  scoreCache.set(agentId, score);
  return score;
}

/**
 * Get cached receipt reputation score (or compute if not cached).
 */
export function getReceiptReputation(agentId: string): ReceiptReputationScore {
  const cached = scoreCache.get(agentId);
  if (cached && (Math.floor(Date.now() / 1000) - cached.computedAt) < 300) {
    return cached; // Cache valid for 5 minutes
  }
  return computeReceiptReputation(agentId);
}

/**
 * Submit receipt-based reputation score to on-chain Reputation Registry.
 */
export async function submitReceiptReputation(
  chainId: string,
  agentTokenId: string,
): Promise<{ success: boolean; txHash?: string; score?: ReceiptReputationScore; error?: string }> {
  try {
    const score = computeReceiptReputation(agentTokenId);

    if (score.receiptCount === 0) {
      return { success: false, error: 'No receipts found for agent' };
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) {
      return { success: false, error: `No adapter for chain ${chainId}` };
    }

    // Submit the overall score as reputation feedback
    // Score is 0–100, map to uint8 for the contract
    const txReceipt = await adapter.submitReputation({
      agentTokenId,
      score: Math.round(score.overall),
      category: 'receipt-based',
    });

    return {
      success: txReceipt.success,
      txHash: txReceipt.hash,
      score,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reset the score cache (for testing).
 */
export function resetReceiptReputationCache(): void {
  scoreCache.clear();
}
