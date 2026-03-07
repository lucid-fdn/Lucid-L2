import { FeedbackParams, TxReceipt, AssetType } from './types';

export interface ExternalFeedback {
  source: string;
  externalId: string;
  score: number;
  category?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ExternalSummary {
  source: string;
  externalId: string;
  avgScore: number;
  feedbackCount: number;
  lastUpdated: number;
}

export interface IReputationSyncer {
  readonly syncerName: string;
  readonly supportedAssetTypes: AssetType[];

  pullFeedback(passportId: string): Promise<ExternalFeedback[]>;
  pullSummary(passportId: string): Promise<ExternalSummary | null>;
  pushFeedback(params: FeedbackParams): Promise<TxReceipt | null>;
  resolveExternalId(passportId: string): Promise<string | null>;
  isAvailable(): Promise<boolean>;
}
