/**
 * Receipt Volume Algorithm
 *
 * Refactored from receiptReputationService.ts — identical scoring logic.
 * Preserves weights: volume=0.25, reliability=0.35, performance=0.25, consistency=0.15
 */

import type { IReputationAlgorithm, AlgorithmScore, ReputationContext } from '../IReputationAlgorithm';
import { computeReceiptReputation } from '../receiptReputationService';

export class ReceiptVolumeAlgorithm implements IReputationAlgorithm {
  readonly id = 'receipt-volume-v1';
  readonly name = 'Receipt Volume';
  readonly version = '1.0.0';
  readonly description = 'Objective reputation from verified receipts. Scores: volume (0.25), reliability (0.35), performance (0.25), consistency (0.15).';

  async compute(agentId: string, _context: ReputationContext): Promise<AlgorithmScore> {
    const score = computeReceiptReputation(agentId);

    return {
      overall: score.overall,
      components: {
        volume: score.components.volume,
        reliability: score.components.reliability,
        performance: score.components.performance,
        consistency: score.components.consistency,
      },
      metadata: {
        receiptCount: score.receiptCount,
        validatedCount: score.validatedCount,
        avgTtftMs: score.avgTtftMs,
        p95TtftMs: score.p95TtftMs,
        avgTokensPerReceipt: score.avgTokensPerReceipt,
        periodDays: score.periodDays,
      },
      computedAt: score.computedAt,
    };
  }
}
