import { signMessage, verifySignature } from '../shared/crypto/signing';
import { sha256Hex } from '../shared/crypto/hash';
import { MMR } from '../shared/crypto/mmr';
import type { IMemoryStore } from './store/interface';
import type {
  MemoryEntry, ProvenanceRecord, MemorySession,
  LucidMemoryFile, RestoreRequest, RestoreResult, MemorySnapshot,
} from './types';

export class ArchivePipeline {
  constructor(
    private store: IMemoryStore,
    private getPassportPubkey: (passportId: string) => Promise<string | null>,
  ) {}

  async createSnapshot(
    agent_passport_id: string,
    snapshot_type: MemorySnapshot['snapshot_type'],
    namespace?: string,
  ): Promise<{ cid: string; snapshot_id: string }> {
    // Gather all entries
    let entries = await this.store.getEntriesSince(agent_passport_id, 0);
    if (namespace) {
      entries = entries.filter(e => e.namespace === namespace);
    }
    const provenance = await this.store.getProvenanceChain(
      agent_passport_id,
      namespace || `agent:${agent_passport_id}`,
      10000,
    );
    const sessions = await this.store.listSessions(agent_passport_id);

    // Serialize
    const lmfData = ArchivePipeline.serializeLMF(entries, provenance, sessions, agent_passport_id);

    // Sign
    const contentToSign = sha256Hex(JSON.stringify(lmfData));
    const { signature, publicKey } = signMessage(contentToSign);

    const lmf: LucidMemoryFile = {
      ...lmfData,
      signature,
      signer_pubkey: publicKey,
    };

    // Upload via AnchorDispatcher
    const { getAnchorDispatcher } = await import('../anchoring');
    const snapshot_id_pre = `snap_${Date.now()}_${agent_passport_id.slice(0, 8)}`;
    const anchorResult = await getAnchorDispatcher().dispatch({
      artifact_type: 'memory_snapshot',
      artifact_id: snapshot_id_pre,
      agent_passport_id,
      producer: 'archivePipeline',
      storage_tier: 'evolving',
      payload: lmf,
      tags: { type: 'lucid-memory-file', agent: agent_passport_id, snapshot_type },
      metadata: { entry_count: lmf.entry_count, chain_head_hash: lmf.chain_head_hash },
    });
    const cid = anchorResult?.cid || 'disabled';

    // Record snapshot
    const snapshot_id = await this.store.saveSnapshot({
      agent_passport_id,
      depin_cid: cid,
      entry_count: entries.length,
      chain_head_hash: lmfData.chain_head_hash,
      snapshot_type,
      created_at: Date.now(),
    });

    return { cid, snapshot_id };
  }

  async restoreSnapshot(
    agent_passport_id: string,
    request: RestoreRequest,
  ): Promise<RestoreResult> {
    const { getEvolvingStorage } = await import('../shared/depin');
    const data = await getEvolvingStorage().retrieve(request.cid);
    if (!data) throw new Error(`Snapshot not found: ${request.cid}`);
    const lmf = (typeof data === 'object' && !Buffer.isBuffer(data) ? data : JSON.parse(data.toString('utf-8'))) as LucidMemoryFile;

    // Identity verification: prevent cross-agent memory injection
    if (lmf.agent_passport_id !== agent_passport_id) {
      const isAdmin = agent_passport_id === '__admin__';
      if (!isAdmin) {
        throw new Error(
          `Identity mismatch: snapshot belongs to ${lmf.agent_passport_id}, ` +
          `but restore requested by ${agent_passport_id}`
        );
      }
    }

    // Verify structure
    const verification = ArchivePipeline.verifyLMF(lmf);
    if (!verification.valid) {
      throw new Error(`Invalid LMF: ${verification.errors.join(', ')}`);
    }

    let entries_imported = 0;
    let entries_skipped = 0;
    const target_namespace = request.target_namespace || `agent:${agent_passport_id}`;

    if (request.mode === 'replace') {
      // Archive all existing entries
      const existing = await this.store.query({
        agent_passport_id,
        status: ['active'],
        limit: 10000,
      });
      if (existing.length > 0) {
        await this.store.archiveBatch(existing.map(e => e.memory_id));
      }
    }

    // Import entries
    for (const entry of lmf.entries) {
      if (request.mode === 'merge') {
        // Check for duplicate by content_hash
        const existing = await this.store.query({
          agent_passport_id,
          content_hash: entry.content_hash,
          status: ['active'],
          limit: 1,
        });
        if (existing.length > 0) {
          entries_skipped++;
          continue;
        }
      }

      const namespace = request.mode === 'fork' ? target_namespace : entry.namespace;

      await this.store.write({
        ...entry,
        namespace,
        agent_passport_id,
        content_hash: entry.content_hash,
        prev_hash: entry.prev_hash,
      } as any);
      entries_imported++;
    }

    const latestHash = await this.store.getLatestHash(agent_passport_id, target_namespace);

    return {
      entries_imported,
      entries_skipped,
      chain_head_hash: latestHash || '',
      source_agent_passport_id: lmf.agent_passport_id,
    };
  }

  static serializeLMF(
    entries: MemoryEntry[],
    provenance: ProvenanceRecord[],
    sessions: MemorySession[],
    agent_passport_id: string,
  ): Omit<LucidMemoryFile, 'signature' | 'signer_pubkey'> {
    // Compute content MMR root over entry hashes
    const mmr = new MMR();
    for (const entry of entries) {
      mmr.append(Buffer.from(entry.content_hash, 'hex'));
    }
    const rootBuf = mmr.getRoot();
    const content_mmr_root = rootBuf ? rootBuf.toString('hex') : '';

    // Find chain head
    const sorted = [...entries].sort((a, b) => {
      if (a.created_at !== b.created_at) return b.created_at - a.created_at;
      return b.memory_id.localeCompare(a.memory_id);
    });
    const chain_head_hash = sorted.length > 0 ? sorted[0].content_hash : '';

    return {
      version: '1.0',
      agent_passport_id,
      created_at: Date.now(),
      chain_head_hash,
      entries,
      provenance,
      sessions,
      entry_count: entries.length,
      content_mmr_root,
    };
  }

  static verifyLMF(lmf: LucidMemoryFile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (lmf.version !== '1.0') errors.push(`Invalid version: ${lmf.version}`);
    if (lmf.entry_count !== lmf.entries.length) {
      errors.push(`entry_count mismatch: declared ${lmf.entry_count}, actual ${lmf.entries.length}`);
    }
    if (!lmf.agent_passport_id) errors.push('Missing agent_passport_id');
    if (!lmf.signature) errors.push('Missing signature');
    if (!lmf.signer_pubkey) errors.push('Missing signer_pubkey');

    return { valid: errors.length === 0, errors };
  }
}
