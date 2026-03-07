/**
 * Solana 8004 Reputation Syncer
 *
 * Bridges the 8004-solana SDK into the IReputationSyncer interface.
 * Reads/writes reputation feedback using the Solana-native ERC-8004 implementation.
 */

import type {
  IReputationSyncer,
  ExternalFeedback,
  ExternalSummary,
} from '../IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../types';

export class Solana8004Syncer implements IReputationSyncer {
  readonly syncerName = '8004-solana';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private sdk: any) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    try {
      const feedbacks = await this.sdk.readAllFeedback(passportId);
      return (feedbacks ?? []).map((f: any) => ({
        source: this.syncerName,
        externalId: passportId,
        score: f.score,
        category: f.category ?? 'general',
        timestamp: f.timestamp ?? Math.floor(Date.now() / 1000),
        metadata: f.metadata,
      }));
    } catch {
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    try {
      const summary = await this.sdk.getSummary(passportId);
      if (!summary) return null;
      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: summary.averageScore ?? summary.avgScore ?? 0,
        feedbackCount: summary.totalFeedback ?? summary.feedbackCount ?? 0,
        lastUpdated: summary.lastUpdated ?? Math.floor(Date.now() / 1000),
      };
    } catch {
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (params.assetType !== 'agent') return null;

    try {
      const result = await this.sdk.giveFeedback(
        params.passportId,
        params.score,
        params.category,
      );
      return {
        success: true,
        txHash: result?.txHash ?? result?.signature,
        id: result?.id,
      };
    } catch {
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return passportId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.sdk;
  }
}
