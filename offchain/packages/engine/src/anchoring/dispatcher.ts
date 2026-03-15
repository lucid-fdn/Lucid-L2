// offchain/packages/engine/src/anchoring/dispatcher.ts
// Uploads artifacts to DePIN storage and writes registry records

import { createHash } from 'crypto';
import { canonicalJson } from '../crypto/canonicalJson';
import type { IDepinStorage, UploadResult } from '../storage/depin/IDepinStorage';
import type { AnchorRecord, AnchorRequest, AnchorResult } from './types';
import type { IAnchorRegistry } from './registry';

export class AnchorDispatcher {
  constructor(
    private permanentStorage: IDepinStorage,
    private evolvingStorage: IDepinStorage,
    private registry: IAnchorRegistry,
  ) {}

  async dispatch(request: AnchorRequest): Promise<AnchorResult | null> {
    // 1. Resolve storage by tier
    const storage = request.storage_tier === 'permanent'
      ? this.permanentStorage
      : this.evolvingStorage;

    // 2. Compute content hash (canonical JSON for determinism)
    const payloadBuf = Buffer.isBuffer(request.payload)
      ? request.payload
      : Buffer.from(canonicalJson(request.payload));
    const contentHash = request.content_hash
      || createHash('sha256').update(payloadBuf).digest('hex');

    // 3. Kill switch — return null (silent skip)
    if (process.env.DEPIN_UPLOAD_ENABLED === 'false') {
      return null;
    }

    // 4. Upload
    let upload: UploadResult;
    if (Buffer.isBuffer(request.payload)) {
      upload = await storage.uploadBytes(request.payload, { tags: request.tags });
    } else {
      upload = await storage.uploadJSON(request.payload, { tags: request.tags });
    }

    // 5. Write registry record (dedup-safe)
    const record: Omit<AnchorRecord, 'anchor_id' | 'status' | 'created_at' | 'verified_at'> = {
      artifact_type: request.artifact_type,
      artifact_id: request.artifact_id,
      agent_passport_id: request.agent_passport_id || null,
      producer: request.producer,
      provider: upload.provider,
      storage_tier: request.storage_tier,
      cid: upload.cid,
      content_hash: contentHash,
      url: upload.url,
      size_bytes: upload.sizeBytes,
      parent_anchor_id: request.parent_anchor_id || null,
      chain_tx: request.chain_tx || null,
      metadata: request.metadata || {},
    };

    const created = await this.registry.create(record);

    return {
      anchor_id: created.anchor_id,
      cid: upload.cid,
      url: upload.url,
      provider: upload.provider,
      size_bytes: upload.sizeBytes,
    };
  }
}
