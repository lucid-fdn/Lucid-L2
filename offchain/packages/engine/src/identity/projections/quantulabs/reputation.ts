import type { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../reputation/IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../../../reputation/types';
import type { QuantuLabsConnection } from './connection';
import { logger } from '../../../shared/lib/logger';

export class QuantuLabsReputationSyncer implements IReputationSyncer {
  readonly syncerName = 'quantulabs';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private connection: QuantuLabsConnection) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    const sdk = this.connection.getSDK();
    if (!sdk) return [];
    try {
      const feedbacks = await sdk.readAllFeedback(passportId);
      return (feedbacks ?? []).map((f: any) => ({
        source: this.syncerName,
        externalId: passportId,
        score: f.score,
        category: f.category ?? 'general',
        timestamp: f.timestamp ?? Math.floor(Date.now() / 1000),
        metadata: f.metadata,
      }));
    } catch (err) {
      logger.warn(`[QuantuLabs] pullFeedback(${passportId}) failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    const sdk = this.connection.getSDK();
    if (!sdk) return null;
    try {
      const summary = await sdk.getSummary(passportId);
      if (!summary) return null;
      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: summary.averageScore ?? summary.avgScore ?? 0,
        feedbackCount: summary.totalFeedback ?? summary.feedbackCount ?? 0,
        lastUpdated: summary.lastUpdated ?? Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      logger.warn(`[QuantuLabs] pullSummary(${passportId}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (params.assetType !== 'agent') return null;
    const sdk = this.connection.getSDK();
    if (!sdk) return null;
    try {
      const result = await sdk.giveFeedback(params.passportId, params.score, params.category);
      return { success: true, txHash: result?.txHash ?? result?.signature, id: result?.id };
    } catch (err) {
      logger.warn(`[QuantuLabs] pushFeedback(${params.passportId}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return passportId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.connection.getSDK();
  }
}
