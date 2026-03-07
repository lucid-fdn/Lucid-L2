/**
 * SAID Reputation Syncer (Stub)
 *
 * Placeholder for future SAID integration.
 */

import type {
  IReputationSyncer,
  ExternalFeedback,
  ExternalSummary,
} from '../IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../types';

export class SAIDSyncer implements IReputationSyncer {
  readonly syncerName = 'said';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  async pullFeedback(_passportId: string): Promise<ExternalFeedback[]> {
    return [];
  }

  async pullSummary(_passportId: string): Promise<ExternalSummary | null> {
    return null;
  }

  async pushFeedback(_params: FeedbackParams): Promise<TxReceipt | null> {
    return null;
  }

  async resolveExternalId(_passportId: string): Promise<string | null> {
    return null;
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
