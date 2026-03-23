import type { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../reputation/IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../../../reputation/types';
import type { MetaplexConnection } from './connection';

export type MintLookup = (passportId: string) => Promise<string | null>;

export class MetaplexReputationSyncer implements IReputationSyncer {
  readonly syncerName = 'metaplex';
  readonly supportedAssetTypes: AssetType[] = ['agent'];
  constructor(private connection: MetaplexConnection, private mintLookup: MintLookup) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    try {
      const mint = await this.mintLookup(passportId);
      if (!mint) return [];
      const umi = await this.connection.getUmi();
      const { fetchAssetV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      const asset = await fetchAssetV1(umi, publicKey(mint));
      const attrs = (asset as any)?.attributes?.attributeList ?? [];
      const feedbacks: ExternalFeedback[] = [];
      for (const attr of attrs) {
        if (typeof attr.key === 'string' && attr.key.startsWith('reputation:')) {
          feedbacks.push({ source: this.syncerName, externalId: mint, score: parseFloat(attr.value) || 0, category: attr.key.replace('reputation:', ''), timestamp: Math.floor(Date.now() / 1000) });
        }
      }
      return feedbacks;
    } catch { return []; }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    try {
      const feedbacks = await this.pullFeedback(passportId);
      if (feedbacks.length === 0) return null;
      const avgAttr = feedbacks.find(f => f.category === 'avg_score');
      const countAttr = feedbacks.find(f => f.category === 'feedback_count');
      return { source: this.syncerName, externalId: passportId, avgScore: avgAttr?.score ?? 0, feedbackCount: countAttr?.score ?? 0, lastUpdated: Math.floor(Date.now() / 1000) };
    } catch { return null; }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (params.assetType !== 'agent') return null;
    try {
      const mint = await this.mintLookup(params.passportId);
      if (!mint) return null;
      const umi = await this.connection.getUmi();
      const { addPluginV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      await addPluginV1(umi, { asset: publicKey(mint), plugin: { type: 'Attributes', attributeList: [
        { key: 'reputation:avg_score', value: String(params.score) },
        { key: 'reputation:feedback_count', value: '1' },
        { key: 'reputation:last_updated', value: String(Math.floor(Date.now() / 1000)) },
      ] } }).sendAndConfirm(umi);
      return { success: true };
    } catch { return null; }
  }

  async resolveExternalId(passportId: string): Promise<string | null> { return this.mintLookup(passportId); }
  async isAvailable(): Promise<boolean> { try { await this.connection.getUmi(); return true; } catch { return false; } }
}
