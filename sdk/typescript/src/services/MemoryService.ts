/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemoryRecallResponse } from '../models/MemoryRecallResponse';
import type { MemorySession } from '../models/MemorySession';
import type { MemoryWriteResponse } from '../models/MemoryWriteResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class MemoryService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Store episodic memory
     * Store a conversation turn as episodic memory. Requires session_id, role, and content.
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddEpisodicMemory(
        xAgentPassportId: string,
        requestBody: {
            session_id: string;
            role: 'user' | 'assistant' | 'system' | 'tool';
            content: string;
            tokens?: number;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/episodic',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Store semantic memory (extracted fact)
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddSemanticMemory(
        xAgentPassportId: string,
        requestBody: {
            fact: string;
            confidence: number;
            content?: string;
            source_memory_ids?: Array<string>;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/semantic',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Store procedural memory (learned rule)
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddProceduralMemory(
        xAgentPassportId: string,
        requestBody: {
            rule: string;
            trigger: string;
            content?: string;
            priority?: number;
            source_memory_ids?: Array<string>;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/procedural',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Store entity memory (knowledge graph node)
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddEntityMemory(
        xAgentPassportId: string,
        requestBody: {
            entity_name: string;
            entity_type: string;
            entity_id?: string;
            content?: string;
            attributes?: Record<string, any>;
            relationships?: Array<{
                target_entity_id?: string;
                relation_type?: string;
                confidence?: number;
            }>;
            source_memory_ids?: Array<string>;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/entity',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Store trust-weighted memory (cross-agent trust)
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddTrustWeightedMemory(
        xAgentPassportId: string,
        requestBody: {
            source_agent_passport_id: string;
            trust_score?: number;
            decay_factor?: number;
            weighted_relevance?: number;
            content?: string;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/trust-weighted',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Store temporal memory (time-bounded fact)
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryWriteResponse Created
     * @throws ApiError
     */
    public lucidAddTemporalMemory(
        xAgentPassportId: string,
        requestBody: {
            content: string;
            /**
             * Unix ms timestamp
             */
            valid_from: number;
            valid_to?: number | null;
            recorded_at?: number;
            namespace?: string;
            memory_lane?: 'self' | 'user' | 'shared' | 'market';
            metadata?: Record<string, any>;
        },
    ): CancelablePromise<MemoryWriteResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/temporal',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Recall relevant memories via two-stage retrieval
     * Two-stage recall: vector similarity search (if embeddings available) followed by metadata-aware reranking.
     * Scoring: 0.55*similarity + 0.20*recency + 0.15*type_bonus + 0.10*quality.
     *
     * @param xAgentPassportId
     * @param requestBody
     * @returns MemoryRecallResponse OK
     * @throws ApiError
     */
    public lucidRecallMemory(
        xAgentPassportId: string,
        requestBody: {
            query: string;
            types?: Array<'episodic' | 'semantic' | 'procedural' | 'entity' | 'trust_weighted' | 'temporal'>;
            lanes?: Array<'self' | 'user' | 'shared' | 'market'>;
            limit?: number;
            namespace?: string;
            min_similarity?: number;
            include_archived?: boolean;
        },
    ): CancelablePromise<MemoryRecallResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/recall',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Trigger memory compaction
     * Tiered compaction: warm (archive old episodics), cold (hard-prune archived past retention).
     * Self-healing: auto-compacts before rejecting writes when limits are exceeded.
     *
     * @param xAgentPassportId
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidCompactMemory(
        xAgentPassportId: string,
        requestBody: {
            namespace?: string;
            session_id?: string;
            mode?: 'warm' | 'cold' | 'full';
        },
    ): CancelablePromise<{
        success?: boolean;
        data?: {
            sessions_compacted?: number;
            episodic_archived?: number;
            extraction_triggered?: boolean;
            cold_pruned?: number;
            snapshot_cid?: string | null;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/compact',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Memory store health and diagnostics
     * Returns store type, entry/vector counts, embedding pipeline status, and store capabilities.
     * @param xAgentPassportId
     * @returns any OK
     * @throws ApiError
     */
    public lucidMemoryHealth(
        xAgentPassportId: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: {
            storeType?: 'sqlite' | 'postgres' | 'memory';
            schemaVersion?: number;
            walMode?: boolean;
            entryCount?: number;
            vectorCount?: number;
            pendingEmbeddings?: number;
            failedEmbeddings?: number;
            sizeMb?: number;
            capabilities?: {
                persistent?: boolean;
                vectorSearch?: boolean;
                crossAgentQuery?: boolean;
                transactions?: boolean;
                localFirst?: boolean;
            };
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/health',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
        });
    }
    /**
     * Start a new conversation session
     * @param xAgentPassportId
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public lucidStartMemorySession(
        xAgentPassportId: string,
        requestBody?: {
            namespace?: string;
        },
    ): CancelablePromise<{
        success?: boolean;
        data?: {
            session_id?: string;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/sessions',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List sessions for an agent
     * @param xAgentPassportId
     * @returns any OK
     * @throws ApiError
     */
    public lucidListMemorySessions(
        xAgentPassportId: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<MemorySession>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/sessions',
            headers: {
                'X-Agent-Passport-Id': xAgentPassportId,
            },
        });
    }
    /**
     * Verify memory hash chain integrity
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidVerifyMemoryChain(
        requestBody: {
            agent_passport_id: string;
            namespace: string;
        },
    ): CancelablePromise<{
        success?: boolean;
        data?: {
            valid?: boolean;
            chain_length?: number;
            broken_links?: Array<string>;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/verify',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Read a single memory entry
     * Retrieve a single memory entry by its unique identifier.
     * @param id Memory entry identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMemoryEntry(
        id: string,
    ): CancelablePromise<{
        entry?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/entries/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * List memory entries with filters
     * List memory entries for an agent, optionally filtered by type and namespace.
     * Supports pagination via page and per_page query parameters.
     *
     * @param agentPassportId Agent passport identifier to filter entries
     * @param type Memory type filter (episodic, semantic, procedural, entity, trust_weighted, temporal)
     * @param namespace Namespace filter
     * @param page Page number for pagination
     * @param perPage Number of results per page
     * @returns any OK
     * @throws ApiError
     */
    public lucidListMemoryEntries(
        agentPassportId?: string,
        type?: string,
        namespace?: string,
        page: number = 1,
        perPage: number = 20,
    ): CancelablePromise<{
        entries?: Array<Record<string, any>>;
        pagination?: {
            page?: number;
            per_page?: number;
            total?: number;
            total_pages?: number;
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/entries',
            query: {
                'agent_passport_id': agentPassportId,
                'type': type,
                'namespace': namespace,
                'page': page,
                'per_page': perPage,
            },
        });
    }
    /**
     * Close a memory session
     * Close an active memory session, preventing further writes.
     * @param id Session identifier to close
     * @returns any OK
     * @throws ApiError
     */
    public lucidCloseMemorySession(
        id: string,
    ): CancelablePromise<{
        success?: boolean;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/memory/sessions/{id}/close',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get session context
     * Retrieve the full context for a memory session, including recent turns,
     * extracted facts, and relevant procedural rules.
     *
     * @param id Session identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMemorySessionContext(
        id: string,
    ): CancelablePromise<{
        context?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/sessions/{id}/context',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get provenance chain
     * Return the full hash-chain provenance for a given agent and namespace,
     * ordered from oldest to newest.
     *
     * @param agentId Agent passport identifier
     * @param namespace Memory namespace
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMemoryProvenanceChain(
        agentId: string,
        namespace: string,
    ): CancelablePromise<{
        chain?: Array<Record<string, any>>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/provenance/{agent_id}/{namespace}',
            path: {
                'agent_id': agentId,
                'namespace': namespace,
            },
        });
    }
    /**
     * Single entry provenance
     * Retrieve the provenance record for a single memory entry.
     * @param id Memory entry identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMemoryEntryProvenance(
        id: string,
    ): CancelablePromise<{
        provenance?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/provenance/entry/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * Memory diagnostics
     * Return memory statistics and diagnostics for a specific agent, including
     * entry counts by type, storage usage, and hash chain integrity status.
     *
     * @param agentId Agent passport identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMemoryStats(
        agentId: string,
    ): CancelablePromise<{
        stats?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/memory/stats/{agent_id}',
            path: {
                'agent_id': agentId,
            },
        });
    }
}
