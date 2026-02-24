/**
 * Stake-Weighted Algorithm
 *
 * Weights reputation by $LUCID held or staked by the agent.
 * Agents with more $LUCID at stake have more skin in the game.
 */

import type { IReputationAlgorithm, AlgorithmScore, ReputationContext } from '../IReputationAlgorithm';
import { computeReceiptReputation } from '../../receiptReputationService';

// Staking tiers (in LUCID tokens, 9 decimals)
const TIERS = [
  { min: 0, max: 100, multiplier: 0.5, label: 'none' },
  { min: 100, max: 1_000, multiplier: 0.75, label: 'bronze' },
  { min: 1_000, max: 10_000, multiplier: 1.0, label: 'silver' },
  { min: 10_000, max: 100_000, multiplier: 1.15, label: 'gold' },
  { min: 100_000, max: Infinity, multiplier: 1.25, label: 'diamond' },
];

export class StakeWeightedAlgorithm implements IReputationAlgorithm {
  readonly id = 'stake-weighted-v1';
  readonly name = 'Stake Weighted';
  readonly version = '1.0.0';
  readonly description = 'Reputation weighted by $LUCID stake. Higher stake = higher multiplier (up to 1.25x).';

  async compute(agentId: string, context: ReputationContext): Promise<AlgorithmScore> {
    // Get base reputation from receipts
    const receiptScore = computeReceiptReputation(agentId);

    // Get staked amount from context (provided by caller)
    const stakedAmount = context.params?.stakedLucid ?? 0;

    // Determine tier
    const tier = TIERS.find(t => stakedAmount >= t.min && stakedAmount < t.max) || TIERS[0];

    // Apply multiplier (capped at 100)
    const adjustedScore = Math.min(100, Math.round(receiptScore.overall * tier.multiplier));

    return {
      overall: adjustedScore,
      components: {
        baseScore: receiptScore.overall,
        stakeMultiplier: tier.multiplier,
        ...receiptScore.components,
      },
      metadata: {
        stakeTier: tier.label,
        stakedLucid: stakedAmount,
        receiptCount: receiptScore.receiptCount,
      },
      computedAt: Math.floor(Date.now() / 1000),
    };
  }
}
