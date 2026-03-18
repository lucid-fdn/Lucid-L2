<!-- generated: commit 8a415ae, 2026-03-18T17:36:59.936Z -->
<!-- WARNING: unverified identifiers: AnchorDispatcher, AnchorVerifier, IDepinStorage, InMemoryAnchorRegistry, PostgresAnchorRegistry, dispatch, evolving, permanent, verify -->
# Anchoring

## Purpose
The anchoring module in the Lucid L2 platform is designed to manage the lifecycle of digital artifacts by anchoring them to decentralized storage. This module ensures that artifacts are stored reliably and can be verified for existence and integrity over time. It addresses the problem of maintaining a verifiable and persistent record of artifacts, which is crucial for applications requiring auditability and data integrity.

### Architecture

The module is structured around three main components: `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry`. The `AnchorDispatcher` handles the uploading of artifacts to decentralized storage and records their metadata in a registry. The `AnchorVerifier` checks the existence of these artifacts in storage to ensure their continued availability. The `IAnchorRegistry` interface, with implementations for both in-memory and Postgres-backed storage, manages the metadata records of anchored artifacts.

Key design choices include:
- **Storage Tiering**: Artifacts can be stored in either "permanent" or "evolving" storage tiers, determined by the `StorageTier` type. This allows for flexibility in storage cost and persistence requirements.
- **Registry Implementations**: The choice between `InMemoryAnchorRegistry` and `PostgresAnchorRegistry` allows for different persistence strategies, with the latter supporting more robust, production-grade deployments.
- **Singleton Pattern**: The use of singleton factory functions (`getAnchorDispatcher`, `getAnchorVerifier`, `getAnchorRegistry`) ensures that only one instance of each component is used throughout the application, optimizing resource usage.

### Data Flow

1. **Artifact Anchoring**:
   - File: `index.ts` → Function: `getAnchorDispatcher` → Class: `AnchorDispatcher`
   - The `dispatch` method in `dispatcher.ts` uploads the artifact to the appropriate storage tier (`permanent` or `evolving`) using `IDepinStorage`.
   - The artifact's metadata, including its content hash and storage details, is recorded in the registry via `IAnchorRegistry.create`.

2. **Artifact Verification**:
   - File: `index.ts` → Function: `getAnchorVerifier` → Class: `AnchorVerifier`
   - The `verify` method in `verifier.ts` checks the existence of the artifact in storage using its CID.
   - The artifact's status is updated in the registry to either "verified" or "unreachable" using `IAnchorRegistry.updateStatus`.

3. **Registry Management**:
   - File: `index.ts` → Function: `getAnchorRegistry` → Interface: `IAnchorRegistry`
   - The registry methods (`create`, `getById`, `getByArtifact`, etc.) in `registry.ts` manage the lifecycle and retrieval of artifact metadata.

### Patterns & Gotchas

- **Deduplication Logic**: In both registry implementations, deduplication is performed based on `artifact_type`, `artifact_id`, and `content_hash`. This ensures that identical artifacts are not redundantly stored.
- **Environment Configuration**: The choice between in-memory and Postgres registry is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Ensure this is correctly set in production environments.
- **Kill Switch**: The `dispatch` method includes a kill switch controlled by the `DEPIN_UPLOAD_ENABLED` environment variable. If set to 'false', uploads are silently skipped, which can be useful for testing or maintenance.
- **Recursive Lineage Retrieval**: The `getLineage` method in `registry.ts` uses recursion to trace the ancestry of an artifact. Be cautious of potential infinite loops if the lineage data is malformed.
- **Timestamp Handling**: Timestamps are stored as Unix milliseconds, and care should be taken when converting between different time formats, especially in the `PostgresAnchorRegistry` implementation.

## Architecture
The module is structured around three main components: `AnchorDispatcher`, `AnchorVerifier`, and `IAnchorRegistry`. The `AnchorDispatcher` handles the uploading of artifacts to decentralized storage and records their metadata in a registry. The `AnchorVerifier` checks the existence of these artifacts in storage to ensure their continued availability. The `IAnchorRegistry` interface, with implementations for both in-memory and Postgres-backed storage, manages the metadata records of anchored artifacts.

Key design choices include:
- **Storage Tiering**: Artifacts can be stored in either "permanent" or "evolving" storage tiers, determined by the `StorageTier` type. This allows for flexibility in storage cost and persistence requirements.
- **Registry Implementations**: The choice between `InMemoryAnchorRegistry` and `PostgresAnchorRegistry` allows for different persistence strategies, with the latter supporting more robust, production-grade deployments.
- **Singleton Pattern**: The use of singleton factory functions (`getAnchorDispatcher`, `getAnchorVerifier`, `getAnchorRegistry`) ensures that only one instance of each component is used throughout the application, optimizing resource usage.

### Data Flow

1. **Artifact Anchoring**:
   - File: `index.ts` → Function: `getAnchorDispatcher` → Class: `AnchorDispatcher`
   - The `dispatch` method in `dispatcher.ts` uploads the artifact to the appropriate storage tier (`permanent` or `evolving`) using `IDepinStorage`.
   - The artifact's metadata, including its content hash and storage details, is recorded in the registry via `IAnchorRegistry.create`.

2. **Artifact Verification**:
   - File: `index.ts` → Function: `getAnchorVerifier` → Class: `AnchorVerifier`
   - The `verify` method in `verifier.ts` checks the existence of the artifact in storage using its CID.
   - The artifact's status is updated in the registry to either "verified" or "unreachable" using `IAnchorRegistry.updateStatus`.

3. **Registry Management**:
   - File: `index.ts` → Function: `getAnchorRegistry` → Interface: `IAnchorRegistry`
   - The registry methods (`create`, `getById`, `getByArtifact`, etc.) in `registry.ts` manage the lifecycle and retrieval of artifact metadata.

### Patterns & Gotchas

- **Deduplication Logic**: In both registry implementations, deduplication is performed based on `artifact_type`, `artifact_id`, and `content_hash`. This ensures that identical artifacts are not redundantly stored.
- **Environment Configuration**: The choice between in-memory and Postgres registry is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Ensure this is correctly set in production environments.
- **Kill Switch**: The `dispatch` method includes a kill switch controlled by the `DEPIN_UPLOAD_ENABLED` environment variable. If set to 'false', uploads are silently skipped, which can be useful for testing or maintenance.
- **Recursive Lineage Retrieval**: The `getLineage` method in `registry.ts` uses recursion to trace the ancestry of an artifact. Be cautious of potential infinite loops if the lineage data is malformed.
- **Timestamp Handling**: Timestamps are stored as Unix milliseconds, and care should be taken when converting between different time formats, especially in the `PostgresAnchorRegistry` implementation.

## Data Flow
1. **Artifact Anchoring**:
   - File: `index.ts` → Function: `getAnchorDispatcher` → Class: `AnchorDispatcher`
   - The `dispatch` method in `dispatcher.ts` uploads the artifact to the appropriate storage tier (`permanent` or `evolving`) using `IDepinStorage`.
   - The artifact's metadata, including its content hash and storage details, is recorded in the registry via `IAnchorRegistry.create`.

2. **Artifact Verification**:
   - File: `index.ts` → Function: `getAnchorVerifier` → Class: `AnchorVerifier`
   - The `verify` method in `verifier.ts` checks the existence of the artifact in storage using its CID.
   - The artifact's status is updated in the registry to either "verified" or "unreachable" using `IAnchorRegistry.updateStatus`.

3. **Registry Management**:
   - File: `index.ts` → Function: `getAnchorRegistry` → Interface: `IAnchorRegistry`
   - The registry methods (`create`, `getById`, `getByArtifact`, etc.) in `registry.ts` manage the lifecycle and retrieval of artifact metadata.

### Patterns & Gotchas

- **Deduplication Logic**: In both registry implementations, deduplication is performed based on `artifact_type`, `artifact_id`, and `content_hash`. This ensures that identical artifacts are not redundantly stored.
- **Environment Configuration**: The choice between in-memory and Postgres registry is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Ensure this is correctly set in production environments.
- **Kill Switch**: The `dispatch` method includes a kill switch controlled by the `DEPIN_UPLOAD_ENABLED` environment variable. If set to 'false', uploads are silently skipped, which can be useful for testing or maintenance.
- **Recursive Lineage Retrieval**: The `getLineage` method in `registry.ts` uses recursion to trace the ancestry of an artifact. Be cautious of potential infinite loops if the lineage data is malformed.
- **Timestamp Handling**: Timestamps are stored as Unix milliseconds, and care should be taken when converting between different time formats, especially in the `PostgresAnchorRegistry` implementation.

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
- **Deduplication Logic**: In both registry implementations, deduplication is performed based on `artifact_type`, `artifact_id`, and `content_hash`. This ensures that identical artifacts are not redundantly stored.
- **Environment Configuration**: The choice between in-memory and Postgres registry is controlled by the `ANCHOR_REGISTRY_STORE` environment variable. Ensure this is correctly set in production environments.
- **Kill Switch**: The `dispatch` method includes a kill switch controlled by the `DEPIN_UPLOAD_ENABLED` environment variable. If set to 'false', uploads are silently skipped, which can be useful for testing or maintenance.
- **Recursive Lineage Retrieval**: The `getLineage` method in `registry.ts` uses recursion to trace the ancestry of an artifact. Be cautious of potential infinite loops if the lineage data is malformed.
- **Timestamp Handling**: Timestamps are stored as Unix milliseconds, and care should be taken when converting between different time formats, especially in the `PostgresAnchorRegistry` implementation.