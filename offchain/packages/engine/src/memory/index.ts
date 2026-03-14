export type {
  MemoryType, MemoryStatus, MemoryEntry, EpisodicMemory, SemanticMemory,
  ProceduralMemory, EntityMemory, TrustWeightedMemory, TemporalMemory,
  ProvenanceRecord, MemorySession, MemorySnapshot, ToolCallRecord,
  WritableMemoryEntry, WritableEpisodicMemory, WritableSemanticMemory, WritableProceduralMemory,
  RestoreMode, RestoreRequest, RestoreResult,
  RecallRequest, RecallResponse, MemoryServiceConfig,
  PermissionLevel, LucidMemoryFile,
  MemoryLane, CompactionConfig, CompactionResult, ExtractionOutputSchema, ValidatedExtractionResult,
  OutboxEvent, MemoryStoreCapabilities, MemoryStoreHealth,
} from './types';
export { MEMORY_TYPES, MEMORY_STATUSES, MAX_CONTENT_SIZE, MAX_METADATA_SIZE, getDefaultConfig } from './types';
export { MEMORY_LANES, getDefaultCompactionConfig } from './types';
export { isEpisodicMemory, isSemanticMemory, isProceduralMemory } from './types';

export type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './store';
export { getMemoryStore, resetMemoryStore, InMemoryMemoryStore } from './store';
export { SQLiteMemoryStore } from './store/sqlite/store';
export { getSQLiteStoreForAgent, getStoreForAgent } from './store';

export { computeMemoryHash, buildHashPreimage, verifyChainIntegrity } from './commitments';
export type { ChainVerifyResult } from './commitments';

export { MemoryService } from './service';
export { MemoryACLEngine } from './acl';
export { ArchivePipeline } from './archivePipeline';
export { ExtractionPipeline } from './extraction';
export { getManager, validateEpisodic, validateSemantic, validateProcedural } from './managers';
export { CompactionPipeline } from './compactionPipeline';
export { validateExtractionResponse } from './extraction';
export { validateEntity } from './managers/entity';
export { validateTrustWeighted } from './managers/trustWeighted';
export { validateTemporal } from './managers/temporal';
export { classifyQueryIntent, rerankCandidates } from './recall';

// Embedding
export type { IEmbeddingProvider, EmbeddingResult } from './embedding/interface';
export { MockEmbeddingProvider } from './embedding/mock';
export { OpenAIEmbeddingProvider } from './embedding/openai';
export { EmbeddingWorker } from './embedding/worker';
export { getEmbeddingProvider } from './embedding';

// Events
export { emitMemoryEvent, getMemoryEventBus, resetMemoryEventBus } from './events/memoryEvents';
export type { MemoryEventType, MemoryEvent, MemoryCreatedEvent } from './events/memoryEvents';

// Projection
export { MemoryProjectionService } from './projection/service';
export { shouldProject, getDefaultProjectionPolicy } from './projection/policies';
export type { ProjectionPolicy } from './projection/policies';
export type { IProjectionSink, ProjectableEntry } from './projection/sinks/interface';
export { PostgresSink } from './projection/sinks/postgres';

// Boot
export { startMemorySystem, stopMemorySystem, isMemorySystemRunning } from './boot';

// Types (v3 additions)
export type { EntityRelation } from './types';
