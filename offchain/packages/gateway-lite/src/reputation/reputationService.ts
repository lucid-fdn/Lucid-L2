/**
 * ReputationService — orchestrator that combines a local IReputationProvider
 * with zero or more IReputationSyncers to provide a unified reputation view.
 *
 * Push path:  submitFeedback -> provider + matching syncers (by assetType)
 * Pull path:  readFeedback / getUnifiedSummary -> provider + all syncers
 */

import { IReputationProvider } from '../../../engine/src/reputation/IReputationProvider';
import {
  IReputationSyncer,
  ExternalFeedback,
  ExternalSummary,
} from '../../../engine/src/reputation/IReputationSyncer';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
} from '../../../engine/src/reputation/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UnifiedSummary {
  local: ReputationSummary;
  external: ExternalSummary[];
  merged: { avgScore: number; totalFeedback: number };
}

export interface UnifiedFeedback {
  local: ReputationData[];
  external: ExternalFeedback[];
}

// ---------------------------------------------------------------------------
// ReputationService
// ---------------------------------------------------------------------------

export class ReputationService {
  constructor(
    private readonly provider: IReputationProvider,
    private readonly syncers: IReputationSyncer[],
    private readonly pushEnabled: boolean,
    private readonly pullEnabled: boolean,
  ) {}

  // -----------------------------------------------------------------------
  // Feedback
  // -----------------------------------------------------------------------

  /**
   * Submit feedback to the local provider, then fan-out to syncers whose
   * supportedAssetTypes include the feedback's assetType (push path).
   */
  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    const receipt = await this.provider.submitFeedback(params);

    if (this.pushEnabled) {
      const matching = this.syncers.filter((s) =>
        s.supportedAssetTypes.includes(params.assetType),
      );

      await Promise.allSettled(
        matching.map((s) => s.pushFeedback(params)),
      );
    }

    return receipt;
  }

  /**
   * Read local feedback from provider plus external feedback from syncers.
   */
  async readFeedback(
    passportId: string,
    options?: ReadOptions,
  ): Promise<UnifiedFeedback> {
    const local = await this.provider.readFeedback(passportId, options);

    if (!this.pullEnabled) {
      return { local, external: [] };
    }

    const results = await Promise.allSettled(
      this.syncers.map((s) => s.pullFeedback(passportId)),
    );

    const external: ExternalFeedback[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        external.push(...r.value);
      }
    }

    return { local, external };
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    return this.provider.submitValidation(params);
  }

  async getValidation(
    passportId: string,
    receiptHash: string,
  ): Promise<ValidationResult | null> {
    return this.provider.getValidation(passportId, receiptHash);
  }

  // -----------------------------------------------------------------------
  // Summaries
  // -----------------------------------------------------------------------

  async getSummary(passportId: string): Promise<ReputationSummary> {
    return this.provider.getSummary(passportId);
  }

  /**
   * Build a unified summary by merging the local provider summary with
   * external summaries pulled from all syncers.  The merged avgScore is
   * a weighted average where the weight is the feedbackCount of each source.
   */
  async getUnifiedSummary(passportId: string): Promise<UnifiedSummary> {
    const local = await this.provider.getSummary(passportId);

    if (!this.pullEnabled) {
      return {
        local,
        external: [],
        merged: {
          avgScore: local.avgScore,
          totalFeedback: local.feedbackCount,
        },
      };
    }

    const results = await Promise.allSettled(
      this.syncers.map((s) => s.pullSummary(passportId)),
    );

    const external: ExternalSummary[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        external.push(r.value);
      }
    }

    // Weighted average across local + external sources
    let weightedSum = local.avgScore * local.feedbackCount;
    let totalFeedback = local.feedbackCount;

    for (const ext of external) {
      weightedSum += ext.avgScore * ext.feedbackCount;
      totalFeedback += ext.feedbackCount;
    }

    const avgScore = totalFeedback > 0 ? weightedSum / totalFeedback : 0;

    return {
      local,
      external,
      merged: {
        avgScore: Math.round(avgScore * 100) / 100,
        totalFeedback,
      },
    };
  }
}
