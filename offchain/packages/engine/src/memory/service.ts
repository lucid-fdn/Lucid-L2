import { v4 as uuid } from 'uuid';
import type { IMemoryStore, MemoryWriteResult, MemoryStats } from './store/interface';
import type {
  MemoryServiceConfig, RecallRequest, RecallResponse,
  EpisodicMemory, MemoryEntry,
} from './types';
import { MemoryACLEngine } from './acl';
import { computeMemoryHash, verifyChainIntegrity as verifyChain, ChainVerifyResult } from './commitments';
import { getManager } from './managers';

export class MemoryService {
  constructor(
    private store: IMemoryStore,
    private acl: MemoryACLEngine,
    private config: MemoryServiceConfig,
  ) {}

  async addEpisodic(callerPassportId: string, input: {
    session_id: string; namespace: string; role: string;
    content: string; tokens: number; metadata?: Record<string, unknown>;
    tool_calls?: any[];
  }): Promise<MemoryWriteResult> {
    this.acl.assertWritePermission(callerPassportId, input.namespace);

    const entryBase = {
      type: 'episodic' as const,
      agent_passport_id: callerPassportId,
      namespace: input.namespace,
      content: input.content,
      metadata: input.metadata || {},
      session_id: input.session_id,
      role: input.role,
      tokens: input.tokens,
      tool_calls: input.tool_calls,
    };

    getManager('episodic')(entryBase as any);

    // Assign turn_index (BEFORE hashing - Pre-flight rule)
    const allSessionEpisodics = await this.store.query({
      agent_passport_id: callerPassportId,
      session_id: input.session_id,
      types: ['episodic'],
      status: ['active', 'superseded', 'archived', 'expired'],
      limit: 10000,
    });
    let maxTurnIndex = -1;
    for (const e of allSessionEpisodics) {
      const ep = e as EpisodicMemory;
      if (ep.turn_index > maxTurnIndex) maxTurnIndex = ep.turn_index;
    }

    const turn_index = maxTurnIndex + 1;

    // Build full payload with turn_index
    const fullEntry = { ...entryBase, turn_index };

    // Compute hash (includes turn_index)
    const content_hash = computeMemoryHash(fullEntry as any);

    // Prev hash
    const prev_hash = await this.store.getLatestHash(callerPassportId, input.namespace);

    // Write
    const result = await this.store.write({ ...fullEntry, content_hash, prev_hash } as any);

    // Provenance
    if (this.config.provenance_enabled) {
      await this.store.writeProvenance({
        agent_passport_id: callerPassportId,
        namespace: input.namespace,
        memory_id: result.memory_id,
        operation: 'create',
        content_hash: result.content_hash,
        prev_hash: result.prev_hash,
        created_at: Date.now(),
      });
    }

    // Session stats
    await this.store.updateSessionStats(input.session_id, 1, input.tokens);

    return result;
  }

  async addSemantic(callerPassportId: string, input: {
    namespace: string; content: string; fact: string;
    confidence: number; source_memory_ids: string[];
    supersedes?: string[]; metadata?: Record<string, unknown>;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'semantic', {
      ...input, type: 'semantic', agent_passport_id: callerPassportId,
    });
  }

  async addProcedural(callerPassportId: string, input: {
    namespace: string; content: string; rule: string;
    trigger: string; priority?: number; source_memory_ids: string[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'procedural', {
      ...input, priority: input.priority ?? 0,
      type: 'procedural', agent_passport_id: callerPassportId,
    });
  }

  private async writeGeneric(callerPassportId: string, type: string, entry: Record<string, any>): Promise<MemoryWriteResult> {
    this.acl.assertWritePermission(callerPassportId, entry.namespace);

    getManager(type as any)(entry);

    const content_hash = computeMemoryHash(entry as any);
    const prev_hash = await this.store.getLatestHash(callerPassportId, entry.namespace);

    const result = await this.store.write({
      ...entry,
      metadata: entry.metadata || {},
      content_hash,
      prev_hash,
    } as any);

    if (this.config.provenance_enabled) {
      await this.store.writeProvenance({
        agent_passport_id: callerPassportId,
        namespace: entry.namespace,
        memory_id: result.memory_id,
        operation: 'create',
        content_hash: result.content_hash,
        prev_hash: result.prev_hash,
        created_at: Date.now(),
      });
    }

    if (this.config.receipts_enabled) {
      const { createMemoryReceipt } = require('../receipt/receiptService');
      createMemoryReceipt({
        agent_passport_id: callerPassportId,
        memory_id: result.memory_id,
        memory_type: type,
        content_hash: result.content_hash,
        prev_hash: result.prev_hash,
        namespace: entry.namespace,
      });
    }

    return result;
  }

  async startSession(callerPassportId: string, namespace: string): Promise<string> {
    this.acl.assertWritePermission(callerPassportId, namespace);
    const session_id = uuid();
    await this.store.createSession({
      session_id,
      agent_passport_id: callerPassportId,
      namespace,
      status: 'active',
      last_receipted_turn_index: -1,
    });
    return session_id;
  }

  async closeSession(callerPassportId: string, sessionId: string, summary?: string): Promise<void> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    this.acl.assertWritePermission(callerPassportId, session.namespace);
    await this.store.closeSession(sessionId, summary);
  }

  async recall(callerPassportId: string, request: RecallRequest): Promise<RecallResponse> {
    const namespace = request.namespace || `agent:${callerPassportId}`;
    this.acl.assertReadPermission(callerPassportId, namespace);

    const entries = await this.store.query({
      agent_passport_id: request.agent_passport_id,
      namespace: request.namespace,
      types: request.types,
      session_id: request.session_id,
      status: request.include_archived ? ['active', 'archived'] : ['active'],
      limit: request.limit || 20,
      order_by: 'created_at',
      order_dir: 'desc',
    });

    // Without embeddings, score by recency (basic fallback)
    const now = Date.now();
    const scored = entries.map(e => ({
      ...e,
      score: Math.max(0, 1 - (now - e.created_at) / (30 * 24 * 60 * 60 * 1000)), // decay over 30 days
    }));

    return {
      memories: scored,
      query_embedding_model: this.config.embedding_model,
      total_candidates: scored.length,
    };
  }

  async verifyChainIntegrity(agentPassportId: string, namespace: string): Promise<ChainVerifyResult> {
    return verifyChain(this.store, agentPassportId, namespace);
  }

  async getStats(agentPassportId: string): Promise<MemoryStats> {
    return this.store.getStats(agentPassportId);
  }
}
