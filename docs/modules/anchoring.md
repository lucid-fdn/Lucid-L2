<!-- generated: commit d2cfd9e, 2026-03-18T17:01:44.682Z -->
<!-- WARNING: unverified identifiers: AnchorDispatcher, AnchorVerifier, IDepinStorage, InMemoryAnchorRegistry, PostgresAnchorRegistry, dispatch, evolving, false, permanent, verify -->
# Anchoring

## Purpose
The anchoring module in the Lucid L2 platform is designed to manage the lifecycle of digital artifacts by anchoring them to decentralized storage solutions. This module ensures that artifacts are reliably stored, retrievable, and verifiable over time. It addresses the problem of maintaining data integrity and availability in decentralized environments by providing mechanisms for uploading, recording, and verifying artifacts.

### Architecture

The module is structured around three main components: `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry`. These components are instantiated as singletons through factory functions in `index.ts`, ensuring consistent access across the application.

- **`AnchorDispatcher`**: Handles the uploading of artifacts to storage and the creation of corresponding records in the registry. It uses `IDepinStorage` interfaces for storage operations, supporting both permanent and evolving storage tiers.
  
- **`AnchorVerifier`**: Responsible for verifying the existence of artifacts in storage. It updates the status of artifacts in the registry based on their availability.

- **`IAnchorRegistry`**: An interface with two implementations (`InMemoryAnchorRegistry` and `PostgresAnchorRegistry`) that manage the persistence of artifact records. The choice between in-memory and Postgres storage is determined by the `ANCHOR_REGISTRY_STORE` environment variable.

### Data Flow

1. **Artifact Upload**:
   - `index.ts` → `getAnchorDispatcher()` → `dispatcher.ts` → `AnchorDispatcher.dispatch()`
   - The `dispatch` function selects the appropriate storage tier (`permanent` or `evolving`) and uploads the artifact using `IDepinStorage`. It computes a content hash for deduplication and creates a registry record via `IAnchorRegistry.create()`.

2. **Artifact Verification**:
   - `index.ts` → `getAnchorVerifier()` → `verifier.ts` → `AnchorVerifier.verify()`
   - The `verify` function retrieves the artifact record from `IAnchorRegistry.getById()`, checks its existence in storage, and updates its status using `IAnchorRegistry.updateStatus()`.

3. **Registry Operations**:
   - `registry.ts` → `IAnchorRegistry` methods
   - Methods like `create`, `getById`, `getByArtifact`, and `updateStatus` manage the lifecycle and retrieval of artifact records. The `PostgresAnchorRegistry` uses SQL queries for persistence, while `InMemoryAnchorRegistry` uses a Map for temporary storage.

### Patterns & Gotchas

- **Singleton Pattern**: The use of singleton instances for `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry` ensures that state is shared across the application, but it requires careful handling of state resets via `resetAnchoring()`.

- **Environment Configuration**: The choice between in-memory and Postgres registry implementations is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Developers must ensure this is correctly set in different environments.

- **Deduplication Logic**: In `InMemoryAnchorRegistry.create()`, deduplication is based on `artifact_type`, `artifact_id`, and `content_hash`. This logic prevents duplicate records but requires consistent hashing of payloads.

- **Kill Switch**: The `dispatch` function includes a kill switch (`DEPIN_UPLOAD_ENABLED` environment variable) that silently skips uploads if set to `false`. This can lead to unexpected behavior if not properly documented or understood.

- **Recursive Lineage Retrieval**: The `getLineage` method in `PostgresAnchorRegistry` uses a recursive SQL query, which may have performance implications for deep lineage chains. Understanding the recursive nature is crucial for debugging lineage-related issues.

## Architecture
The module is structured around three main components: `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry`. These components are instantiated as singletons through factory functions in `index.ts`, ensuring consistent access across the application.

- **`AnchorDispatcher`**: Handles the uploading of artifacts to storage and the creation of corresponding records in the registry. It uses `IDepinStorage` interfaces for storage operations, supporting both permanent and evolving storage tiers.
  
- **`AnchorVerifier`**: Responsible for verifying the existence of artifacts in storage. It updates the status of artifacts in the registry based on their availability.

- **`IAnchorRegistry`**: An interface with two implementations (`InMemoryAnchorRegistry` and `PostgresAnchorRegistry`) that manage the persistence of artifact records. The choice between in-memory and Postgres storage is determined by the `ANCHOR_REGISTRY_STORE` environment variable.

### Data Flow

1. **Artifact Upload**:
   - `index.ts` → `getAnchorDispatcher()` → `dispatcher.ts` → `AnchorDispatcher.dispatch()`
   - The `dispatch` function selects the appropriate storage tier (`permanent` or `evolving`) and uploads the artifact using `IDepinStorage`. It computes a content hash for deduplication and creates a registry record via `IAnchorRegistry.create()`.

2. **Artifact Verification**:
   - `index.ts` → `getAnchorVerifier()` → `verifier.ts` → `AnchorVerifier.verify()`
   - The `verify` function retrieves the artifact record from `IAnchorRegistry.getById()`, checks its existence in storage, and updates its status using `IAnchorRegistry.updateStatus()`.

3. **Registry Operations**:
   - `registry.ts` → `IAnchorRegistry` methods
   - Methods like `create`, `getById`, `getByArtifact`, and `updateStatus` manage the lifecycle and retrieval of artifact records. The `PostgresAnchorRegistry` uses SQL queries for persistence, while `InMemoryAnchorRegistry` uses a Map for temporary storage.

### Patterns & Gotchas

- **Singleton Pattern**: The use of singleton instances for `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry` ensures that state is shared across the application, but it requires careful handling of state resets via `resetAnchoring()`.

- **Environment Configuration**: The choice between in-memory and Postgres registry implementations is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Developers must ensure this is correctly set in different environments.

- **Deduplication Logic**: In `InMemoryAnchorRegistry.create()`, deduplication is based on `artifact_type`, `artifact_id`, and `content_hash`. This logic prevents duplicate records but requires consistent hashing of payloads.

- **Kill Switch**: The `dispatch` function includes a kill switch (`DEPIN_UPLOAD_ENABLED` environment variable) that silently skips uploads if set to `false`. This can lead to unexpected behavior if not properly documented or understood.

- **Recursive Lineage Retrieval**: The `getLineage` method in `PostgresAnchorRegistry` uses a recursive SQL query, which may have performance implications for deep lineage chains. Understanding the recursive nature is crucial for debugging lineage-related issues.

## Data Flow
1. **Artifact Upload**:
   - `index.ts` → `getAnchorDispatcher()` → `dispatcher.ts` → `AnchorDispatcher.dispatch()`
   - The `dispatch` function selects the appropriate storage tier (`permanent` or `evolving`) and uploads the artifact using `IDepinStorage`. It computes a content hash for deduplication and creates a registry record via `IAnchorRegistry.create()`.

2. **Artifact Verification**:
   - `index.ts` → `getAnchorVerifier()` → `verifier.ts` → `AnchorVerifier.verify()`
   - The `verify` function retrieves the artifact record from `IAnchorRegistry.getById()`, checks its existence in storage, and updates its status using `IAnchorRegistry.updateStatus()`.

3. **Registry Operations**:
   - `registry.ts` → `IAnchorRegistry` methods
   - Methods like `create`, `getById`, `getByArtifact`, and `updateStatus` manage the lifecycle and retrieval of artifact records. The `PostgresAnchorRegistry` uses SQL queries for persistence, while `InMemoryAnchorRegistry` uses a Map for temporary storage.

### Patterns & Gotchas

- **Singleton Pattern**: The use of singleton instances for `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry` ensures that state is shared across the application, but it requires careful handling of state resets via `resetAnchoring()`.

- **Environment Configuration**: The choice between in-memory and Postgres registry implementations is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Developers must ensure this is correctly set in different environments.

- **Deduplication Logic**: In `InMemoryAnchorRegistry.create()`, deduplication is based on `artifact_type`, `artifact_id`, and `content_hash`. This logic prevents duplicate records but requires consistent hashing of payloads.

- **Kill Switch**: The `dispatch` function includes a kill switch (`DEPIN_UPLOAD_ENABLED` environment variable) that silently skips uploads if set to `false`. This can lead to unexpected behavior if not properly documented or understood.

- **Recursive Lineage Retrieval**: The `getLineage` method in `PostgresAnchorRegistry` uses a recursive SQL query, which may have performance implications for deep lineage chains. Understanding the recursive nature is crucial for debugging lineage-related issues.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AnchorRecord` | `types.ts` | — |
| `AnchorRequest` | `types.ts` | — |
| `AnchorResult` | `types.ts` | — |
| `IAnchorRegistry` | `registry.ts` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | `IDepinStorage`, `UploadResult`, `canonicalJson`, `getEvolvingStorage`, `getPermanentStorage` | — |

## Patterns & Gotchas
- **Singleton Pattern**: The use of singleton instances for `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry` ensures that state is shared across the application, but it requires careful handling of state resets via `resetAnchoring()`.

- **Environment Configuration**: The choice between in-memory and Postgres registry implementations is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Developers must ensure this is correctly set in different environments.

- **Deduplication Logic**: In `InMemoryAnchorRegistry.create()`, deduplication is based on `artifact_type`, `artifact_id`, and `content_hash`. This logic prevents duplicate records but requires consistent hashing of payloads.

- **Kill Switch**: The `dispatch` function includes a kill switch (`DEPIN_UPLOAD_ENABLED` environment variable) that silently skips uploads if set to `false`. This can lead to unexpected behavior if not properly documented or understood.

- **Recursive Lineage Retrieval**: The `getLineage` method in `PostgresAnchorRegistry` uses a recursive SQL query, which may have performance implications for deep lineage chains. Understanding the recursive nature is crucial for debugging lineage-related issues.