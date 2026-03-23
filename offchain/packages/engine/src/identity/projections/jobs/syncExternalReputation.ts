import type { FeedbackParams } from '../../../reputation/types';
import { logger } from '../../../shared/lib/logger';

/**
 * Push a reputation feedback event to all external registries that have reputation syncers.
 * Called after local reputation is written (e.g., new feedback, score recalculation).
 */
export async function syncExternalReputation(params: FeedbackParams): Promise<void> {
  try {
    const { getReputationSyncers } = await import('../../../reputation');
    const syncers = getReputationSyncers();
    if (syncers.length === 0) return;

    const pushPromises = syncers
      .filter(s => s.supportedAssetTypes.includes(params.assetType as any))
      .map(async (syncer) => {
        try {
          await syncer.pushFeedback(params);
          logger.info(`[Reputation] Pushed feedback to ${syncer.syncerName} for ${params.passportId}`);
        } catch (err) {
          logger.warn(`[Reputation] Push to ${syncer.syncerName} failed:`, err instanceof Error ? err.message : err);
        }
      });

    await Promise.allSettled(pushPromises);
  } catch (err) {
    logger.warn('[Reputation] syncExternalReputation failed:', err instanceof Error ? err.message : err);
  }
}
