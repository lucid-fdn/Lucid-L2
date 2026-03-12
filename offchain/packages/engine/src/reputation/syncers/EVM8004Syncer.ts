/**
 * EVM ERC-8004 Reputation Syncer
 *
 * Bridges the ERC-8004 ValidationRegistry and ReputationRegistry
 * contracts into the IReputationSyncer interface.
 */

import type {
  IReputationSyncer,
  ExternalFeedback,
  ExternalSummary,
} from '../IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../types';
import type { ValidationRegistryClient } from '../../identity/registries/evm-validation';
import type { ReputationRegistryClient } from '../../identity/registries/evm-reputation';

export class EVM8004Syncer implements IReputationSyncer {
  readonly syncerName = 'evm-8004';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(
    private validationClient?: ValidationRegistryClient,
    private reputationClient?: ReputationRegistryClient,
  ) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    if (!this.reputationClient) return [];

    try {
      const data = await this.reputationClient.getFeedback(passportId);
      return data.map((d) => ({
        source: this.syncerName,
        externalId: passportId,
        score: d.score,
        category: d.category,
        timestamp: d.timestamp,
        metadata: { from: d.from },
      }));
    } catch (err) {
      console.warn(`[EVM8004Syncer] pullFeedback failed for passportId="${passportId}":`, err);
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    if (!this.reputationClient) return null;

    try {
      const summary = await this.reputationClient.getAverageScore(passportId);
      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: summary.averageScore,
        feedbackCount: summary.totalFeedback,
        lastUpdated: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      console.warn(`[EVM8004Syncer] pullSummary failed for passportId="${passportId}":`, err);
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (!this.reputationClient) return null;

    try {
      const txHash = await this.reputationClient.submitFeedback(
        params.passportId,
        params.score,
        params.category,
      );
      return { success: true, txHash };
    } catch (err) {
      console.warn(`[EVM8004Syncer] pushFeedback failed for passportId="${params.passportId}", score=${params.score}, category="${params.category}":`, err);
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return passportId;
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.validationClient || this.reputationClient);
  }
}
