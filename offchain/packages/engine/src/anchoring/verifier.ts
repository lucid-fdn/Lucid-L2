// offchain/packages/engine/src/anchoring/verifier.ts
// Verifies that anchored artifacts still exist on DePIN storage

import type { IDepinStorage } from '../shared/depin/IDepinStorage';
import type { IAnchorRegistry } from './registry';

export class AnchorVerifier {
  constructor(
    private permanentStorage: IDepinStorage,
    private evolvingStorage: IDepinStorage,
    private registry: IAnchorRegistry,
  ) {}

  async verify(anchor_id: string): Promise<{ valid: boolean; checked_at: number }> {
    const record = await this.registry.getById(anchor_id);
    if (!record) throw new Error(`Anchor ${anchor_id} not found`);

    const storage = record.storage_tier === 'permanent'
      ? this.permanentStorage
      : this.evolvingStorage;

    const exists = await storage.exists(record.cid);
    const now = Date.now();

    await this.registry.updateStatus(anchor_id, exists ? 'verified' : 'unreachable');

    return { valid: exists, checked_at: now };
  }

  async verifyBatch(anchor_ids: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const id of anchor_ids) {
      try {
        const { valid } = await this.verify(id);
        results.set(id, valid);
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }
}
