/**
 * Cross-Chain Weighted Algorithm
 *
 * Refactored from reputationAggregator.ts weighted average.
 * Weight = feedbackCount per chain.
 */

import type { IReputationAlgorithm, AlgorithmScore, ReputationContext } from '../IReputationAlgorithm';
import { getReputationAggregator } from '../reputationAggregator';

export class CrossChainWeightedAlgorithm implements IReputationAlgorithm {
  readonly id = 'cross-chain-weighted-v1';
  readonly name = 'Cross-Chain Weighted';
  readonly version = '1.0.0';
  readonly description = 'Weighted average reputation across all chains. Weight = feedback count per chain.';

  async compute(agentId: string, _context: ReputationContext): Promise<AlgorithmScore> {
    const aggregator = getReputationAggregator();
    const unified = aggregator.getUnifiedScore(agentId);

    if (!unified || unified.totalFeedbackCount === 0) {
      return {
        overall: 0,
        components: {},
        metadata: { chainCount: 0, totalFeedbackCount: 0 },
        computedAt: Math.floor(Date.now() / 1000),
      };
    }

    // Build per-chain component scores
    const components: Record<string, number> = {};
    for (const chain of unified.chains) {
      components[chain.chainId] = Math.round(chain.averageScore * 100) / 100;
    }

    return {
      overall: unified.unifiedScore,
      components,
      metadata: {
        chainCount: unified.chainCount,
        totalFeedbackCount: unified.totalFeedbackCount,
        chains: unified.chains.map(c => ({
          chainId: c.chainId,
          averageScore: c.averageScore,
          feedbackCount: c.feedbackCount,
        })),
      },
      computedAt: unified.computedAt,
    };
  }
}
