import { v4 as uuid } from 'uuid';
import type { IMemoryStore, MemoryWriteResult, MemoryStats } from './store/interface';
import type {
  MemoryServiceConfig, RecallRequest, RecallResponse,
  EpisodicMemory, MemoryEntry, MemoryLane,
} from './types';
import { MemoryACLEngine } from './acl';
import { computeMemoryHash, verifyChainIntegrity as verifyChain, ChainVerifyResult } from './commitments';
import { getManager } from './managers';
import { rerankCandidates } from './recall/reranker';
import { emitMemoryEvent, MemoryCreatedEvent } from './events/memoryEvents';

export class MemoryService {
  constructor(
    private store: IMemoryStore,
    private acl: MemoryACLEngine,
    private config: MemoryServiceConfig,
  ) {
    const weightSum = config.recall_similarity_weight + config.recall_recency_weight
      + config.recall_type_weight + config.recall_quality_weight;
    if (Math.abs(weightSum - 1.0) > 0.001) {
      throw new Error(`Recall weights must sum to 1.0, got ${weightSum}`);
    }
  }

  async addEpisodic(callerPassportId: string, input: {
    session_id: string; namespace: string; role: string;
    content: string; tokens: number; metadata?: Record<string, unknown>;
    tool_calls?: any[];
    memory_lane?: MemoryLane;
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
      memory_lane: (input.memory_lane ?? 'self') as MemoryLane,
      embedding_status: this.config.embedding_enabled ? 'pending' as const : 'skipped' as const,
      embedding_attempts: 0,
      embedding_requested_at: Date.now(),
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

    // Outbox for projection (non-blocking, best-effort)
    try {
      await this.store.writeOutboxEvent({
        event_type: 'memory.created',
        memory_id: result.memory_id,
        agent_passport_id: callerPassportId,
        namespace: input.namespace,
        payload_json: JSON.stringify({ ...fullEntry, memory_id: result.memory_id, content_hash: result.content_hash }),
      });
    } catch { /* outbox write failure should not fail memory write */ }

    // In-process event (after durable writes complete)
    emitMemoryEvent({
      type: 'memory.created',
      timestamp: Date.now(),
      agent_passport_id: callerPassportId,
      namespace: input.namespace,
      entry: { ...fullEntry, memory_id: result.memory_id } as any,
    } as MemoryCreatedEvent);

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
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'semantic', {
      ...input, type: 'semantic', agent_passport_id: callerPassportId,
      memory_lane: input.memory_lane ?? 'self',
    });
  }

  async addProcedural(callerPassportId: string, input: {
    namespace: string; content: string; rule: string;
    trigger: string; priority?: number; source_memory_ids: string[];
    metadata?: Record<string, unknown>;
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'procedural', {
      ...input, priority: input.priority ?? 0,
      type: 'procedural', agent_passport_id: callerPassportId,
      memory_lane: input.memory_lane ?? 'self',
    });
  }

  async addEntity(callerPassportId: string, input: {
    namespace: string; content: string; entity_name: string;
    entity_type: string; entity_id?: string;
    attributes: Record<string, unknown>; relationships: any[];
    source_memory_ids?: string[]; metadata?: Record<string, unknown>;
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'entity', {
      ...input, type: 'entity', agent_passport_id: callerPassportId,
      source_memory_ids: input.source_memory_ids ?? [],
      memory_lane: input.memory_lane ?? 'self',
    });
  }

  async addTrustWeighted(callerPassportId: string, input: {
    namespace: string; content: string;
    source_agent_passport_id: string; trust_score: number;
    decay_factor: number; weighted_relevance: number;
    source_memory_ids?: string[]; metadata?: Record<string, unknown>;
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'trust_weighted', {
      ...input, type: 'trust_weighted', agent_passport_id: callerPassportId,
      source_memory_ids: input.source_memory_ids ?? [],
      memory_lane: input.memory_lane ?? 'self',
    });
  }

  async addTemporal(callerPassportId: string, input: {
    namespace: string; content: string;
    valid_from: number; valid_to: number | null; recorded_at: number;
    source_memory_ids?: string[]; metadata?: Record<string, unknown>;
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult> {
    return this.writeGeneric(callerPassportId, 'temporal', {
      ...input, type: 'temporal', agent_passport_id: callerPassportId,
      source_memory_ids: input.source_memory_ids ?? [],
      memory_lane: input.memory_lane ?? 'self',
    });
  }

  private async writeGeneric(callerPassportId: string, type: string, entry: Record<string, any>): Promise<MemoryWriteResult> {
    this.acl.assertWritePermission(callerPassportId, entry.namespace);

    getManager(type as any)(entry);

    const fullEntry = {
      ...entry,
      metadata: entry.metadata || {},
      embedding_status: this.config.embedding_enabled ? 'pending' : 'skipped',
      embedding_attempts: 0,
      embedding_requested_at: Date.now(),
    };

    const content_hash = computeMemoryHash(fullEntry as any);
    const prev_hash = await this.store.getLatestHash(callerPassportId, entry.namespace);

    const result = await this.store.write({
      ...fullEntry,
      content_hash,
      prev_hash,
    } as any);

    // Outbox for projection (non-blocking, best-effort)
    try {
      await this.store.writeOutboxEvent({
        event_type: 'memory.created',
        memory_id: result.memory_id,
        agent_passport_id: callerPassportId,
        namespace: entry.namespace,
        payload_json: JSON.stringify({ ...fullEntry, memory_id: result.memory_id, content_hash: result.content_hash }),
      });
    } catch { /* outbox write failure should not fail memory write */ }

    // In-process event (after durable writes complete)
    emitMemoryEvent({
      type: 'memory.created',
      timestamp: Date.now(),
      agent_passport_id: callerPassportId,
      namespace: entry.namespace,
      entry: { ...fullEntry, memory_id: result.memory_id } as any,
    } as MemoryCreatedEvent);

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

    const weights = {
      similarity_weight: this.config.recall_similarity_weight,
      recency_weight: this.config.recall_recency_weight,
      type_weight: this.config.recall_type_weight,
      quality_weight: this.config.recall_quality_weight,
    };

    const limit = request.limit || 20;
    const threshold = request.min_similarity ?? this.config.recall_similarity_threshold;

    let candidates: (MemoryEntry & { similarity: number })[];

    // Stage 1: Fast candidate retrieval
    if (request.semantic_query_embedding) {
      candidates = await this.store.nearestByEmbedding(
        request.semantic_query_embedding,
        request.agent_passport_id,
        request.namespace,
        request.types,
        this.config.recall_candidate_pool_size,
        threshold,
        request.lanes,
      );
    } else {
      // Fallback: recency + keyword
      const entries = await this.store.query({
        agent_passport_id: request.agent_passport_id,
        namespace: request.namespace,
        types: request.types,
        session_id: request.session_id,
        status: request.include_archived ? ['active', 'archived', 'expired'] : ['active'],
        limit: this.config.recall_candidate_pool_size,
        order_by: 'created_at',
        order_dir: 'desc',
        memory_lane: request.lanes,
      });
      // Keyword content filter
      const filtered = request.query
        ? entries.filter(e => e.content.toLowerCase().includes(request.query!.toLowerCase()))
        : entries;
      candidates = filtered.map(e => ({ ...e, similarity: 0.0 }));
    }

    // Fallback safety: if semantic search returned too few results, backfill
    if (request.semantic_query_embedding && candidates.length < this.config.recall_min_results) {
      const backfill = await this.store.query({
        agent_passport_id: request.agent_passport_id,
        namespace: request.namespace,
        types: request.types,
        session_id: request.session_id,
        status: request.include_archived ? ['active', 'archived', 'expired'] : ['active'],
        limit: this.config.recall_candidate_pool_size,
        order_by: 'created_at',
        order_dir: 'desc',
        memory_lane: request.lanes,
      });
      const existingIds = new Set(candidates.map(c => c.memory_id));
      for (const entry of backfill) {
        if (!existingIds.has(entry.memory_id)) {
          candidates.push({ ...entry, similarity: 0.0 });
          if (candidates.length >= this.config.recall_candidate_pool_size) break;
        }
      }
    }

    // Stage 2: Rerank
    const scored = rerankCandidates(candidates, request.query || '', weights);
    const result = scored.slice(0, limit);

    return {
      memories: result,
      query_embedding_model: request.semantic_query_embedding ? this.config.embedding_model : null,
      total_candidates: candidates.length,
    };
  }

  async verifyChainIntegrity(agentPassportId: string, namespace: string): Promise<ChainVerifyResult> {
    return verifyChain(this.store, agentPassportId, namespace);
  }

  async getStats(agentPassportId: string): Promise<MemoryStats> {
    return this.store.getStats(agentPassportId);
  }
}
