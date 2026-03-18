<!-- generated: commit 0dd79c5, 2026-03-18T16:38:57.350Z -->
# Memory

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `ChainVerifyResult` | `commitments.ts` | — |
| `CompactionConfig` | `types.ts` | — |
| `CompactionResult` | `types.ts` | — |
| `EmbeddingResult` | `embedding/interface.ts` | — |
| `EntityMemory` | `types.ts` | — |
| `EntityRelation` | `types.ts` | — |
| `EpisodicMemory` | `types.ts` | — |
| `ExtractionOutputSchema` | `types.ts` | — |
| `IEmbeddingProvider` | `embedding/interface.ts` | — |
| `IMemoryStore` | `store/interface.ts` | — |
| `IProjectionSink` | `projection/sinks/interface.ts` | — |
| `LucidMemoryFile` | `types.ts` | — |
| `MemoryCreatedEvent` | `events/memoryEvents.ts` | — |
| `MemoryEntry` | `types.ts` | — |
| `MemoryEvent` | `events/memoryEvents.ts` | — |
| `MemoryQuery` | `store/interface.ts` | — |
| `MemoryServiceConfig` | `types.ts` | — |
| `MemorySession` | `types.ts` | — |
| `MemorySnapshot` | `types.ts` | — |
| `MemoryStats` | `store/interface.ts` | — |
| `MemoryStoreCapabilities` | `types.ts` | — |
| `MemoryStoreHealth` | `types.ts` | — |
| `MemoryWriteResult` | `store/interface.ts` | — |
| `OutboxEvent` | `types.ts` | — |
| `ProceduralMemory` | `types.ts` | — |
| `ProjectableEntry` | `projection/sinks/interface.ts` | — |
| `ProjectionPolicy` | `projection/policies.ts` | — |
| `ProvenanceRecord` | `types.ts` | — |
| `RecallRequest` | `types.ts` | — |
| `RecallResponse` | `types.ts` | — |
| `RestoreRequest` | `types.ts` | — |
| `RestoreResult` | `types.ts` | — |
| `SemanticMemory` | `types.ts` | — |
| `TemporalMemory` | `types.ts` | — |
| `ToolCallRecord` | `types.ts` | — |
| `TrustWeightedMemory` | `types.ts` | — |
| `ValidatedExtractionResult` | `types.ts` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | `MMR`, `canonicalSha256Hex`, `getClient`, `logger`, `pool`, `sha256Hex`, `signMessage`, `verifySignature` | — |

## Patterns & Gotchas
*AI enrichment pending.*