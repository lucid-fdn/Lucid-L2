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
