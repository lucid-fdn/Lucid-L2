<!-- generated: commit d2cfd9e, 2026-03-18T16:59:32.021Z -->
<!-- WARNING: unverified identifiers: PostgresMemoryStore, memory, restoreSnapshot -->
# Memory

## Purpose
The `memory` module in the Lucid L2 platform is designed to manage and manipulate various types of memory entries, such as episodic, semantic, procedural, entity, trust-weighted, and temporal memories. It provides a robust framework for storing, querying, and processing these memories, supporting features like embedding, provenance tracking, and session management. This module is crucial for applications that require complex memory operations, such as AI-driven systems that need to recall, infer, and learn from past interactions.

## Architecture
The module is structured around several key interfaces and classes that define the operations and data structures for memory management. The `IMemoryStore` interface is central, providing methods for writing, reading, querying, and managing memory entries. The module supports multiple storage backends, including in-memory, SQLite, and Postgres, with the `PostgresMemoryStore` class implementing the `IMemoryStore` interface for a persistent, scalable solution.

Design choices include the use of type-specific interfaces for different memory types, ensuring that each memory type has its own set of attributes and validation logic. The `getManager` function dynamically retrieves the appropriate validation function for a given memory type, promoting modularity and ease of extension.

## Data Flow
Data flow in the `memory` module typically follows these paths:

1. **Write Operations**: 
   - File: `store/index.ts` → Function: `getMemoryStore` → Store: `PostgresMemoryStore.write`
   - Memory entries are written to the store using the `write` or `writeBatch` methods, which handle serialization and database transactions.

2. **Read Operations**:
   - File: `store/index.ts` → Function: `getMemoryStore` → Store: `PostgresMemoryStore.read`
   - Memory entries are retrieved using the `read` method, which queries the database and maps rows to domain objects.

3. **Embedding Operations**:
   - File: `embedding/index.ts` → Function: `getEmbeddingProvider` → Interface: `IEmbeddingProvider.embed`
   - Embeddings are computed for memory entries, with results stored back in the memory store using `updateEmbedding`.

4. **Provenance Tracking**:
   - File: `store/index.ts` → Function: `getMemoryStore` → Store: `PostgresMemoryStore.writeProvenance`
   - Provenance records are maintained to track changes and operations on memory entries.

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
- **Type-Specific Logic**: Each memory type has specific attributes and validation logic. Use the `getManager` function to obtain the correct validator for a memory type, ensuring that entries are validated according to their type-specific rules.

- **Serializable Transactions**: The `PostgresMemoryStore` uses serializable transactions for write operations to maintain hash chain integrity. This can lead to serialization failures under high concurrency, which are retried up to three times.

- **Embedding Status**: Memory entries have an `embedding_status` field that tracks the state of embedding operations. Be aware of this status when querying or processing entries to avoid acting on incomplete data.

- **Environment Configuration**: The behavior of the memory store can be influenced by environment variables, such as `MEMORY_STORE` for selecting the storage backend. Ensure these are correctly set in your development and production environments.

- **Cross-Agent Operations**: The module supports cross-agent queries and operations, but care must be taken to prevent unauthorized access or data leakage between agents. The `restoreSnapshot` function includes identity verification to prevent cross-agent memory injection.