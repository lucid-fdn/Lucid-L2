<!-- generated: commit 8a415ae, 2026-03-18T17:33:32.226Z -->
<!-- WARNING: unverified identifiers: PostgresMemoryStore, restoreSnapshot, rowToMemoryEntry, writeWithClient -->
# Memory

## Purpose
The memory module in the Lucid L2 platform is designed to manage and manipulate various types of memory entries, such as episodic, semantic, procedural, entity, trust-weighted, and temporal memories. It provides a comprehensive framework for storing, retrieving, and processing memory data, enabling the platform to maintain a persistent and queryable memory store. This module addresses the need for a robust memory management system that supports complex operations like embedding, provenance tracking, and compaction, which are essential for building intelligent applications.

## Architecture
The memory module is structured around several key interfaces and functions that define its capabilities. The `IMemoryStore` interface in `store/interface.ts` is central, providing methods for writing, reading, querying, and managing memory entries. The module supports different storage backends, including in-memory, SQLite, and Postgres, with the `PostgresMemoryStore` class in `store/postgres.ts` implementing the `IMemoryStore` interface for a persistent database.

Design choices include:
- **Type Safety**: The use of TypeScript interfaces and types ensures that memory entries are handled with strict type safety, reducing runtime errors.
- **Modularity**: The module is divided into components like embedding, events, and projections, each with its own interfaces and implementations.
- **Extensibility**: The architecture supports adding new memory types and storage backends with minimal changes to existing code.

## Data Flow
Data flows through the memory module as follows:
1. **Write Operations**: Memory entries are written using `IMemoryStore.write` or `writeBatch` methods. For example, in `store/postgres.ts`, `writeWithClient` handles the insertion of entries into the Postgres database.
2. **Read Operations**: Entries are retrieved using `IMemoryStore.read` or `query`. The `rowToMemoryEntry` function in `store/postgres.ts` maps database rows to memory entry objects.
3. **Provenance Tracking**: Provenance records are managed using methods like `writeProvenance` and `getProvenanceChain` in `store/postgres.ts`, ensuring a traceable history of memory operations.
4. **Embedding**: The embedding process is managed by `IEmbeddingProvider` methods such as `embed` and `embedBatch`, with pending embeddings queried via `queryPendingEmbeddings`.
5. **Event Handling**: Memory events are emitted using `emitMemoryEvent` in `events/memoryEvents.ts`, allowing for asynchronous processing and integration with other system components.

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
- **Singleton Pattern**: The `getMemoryStore` function in `store/index.ts` uses a singleton pattern for the memory store, which can lead to unexpected behavior if not reset properly using `resetMemoryStore`.
- **Serialization Failures**: The `PostgresMemoryStore` class employs a retry mechanism for serialization failures in transactions, which is crucial for maintaining hash chain integrity but can be a source of confusion if not understood.
- **Type Guards**: Functions like `isEpisodicMemory` in `types.ts` are used to safely determine the type of a memory entry, which is essential for type-specific operations.
- **Environment Configuration**: The module heavily relies on environment variables for configuration, such as `MEMORY_STORE` and `MEMORY_EMBEDDING_MODEL`. Incorrect configurations can lead to runtime errors or suboptimal performance.
- **Cross-Agent Memory Injection**: The `restoreSnapshot` method in `archivePipeline.ts` includes checks to prevent unauthorized memory injection across agents, which is a critical security measure.