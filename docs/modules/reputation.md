<!-- generated: commit 8a415ae, 2026-03-18T17:37:15.492Z -->
<!-- WARNING: unverified identifiers: EVM8004Syncer, LucidDBProvider, ReputationRegistryClient, reputation -->
# Reputation

## Purpose
The `reputation` module in the Lucid L2 platform is designed to manage and synchronize reputation data across different systems. It serves as a bridge between on-chain and off-chain reputation data, allowing for the submission, retrieval, and synchronization of feedback and validation information. This module addresses the need for a unified interface to handle reputation data from various sources, ensuring consistency and reliability in reputation management.

### Architecture

The architecture of the `reputation` module is centered around two main interfaces: `IReputationProvider` and `IReputationSyncer`. The `IReputationProvider` interface defines methods for interacting with the primary reputation data store, which can be either a database or an on-chain provider. The `IReputationSyncer` interface is implemented by various syncers that handle the synchronization of reputation data with external systems.

- **Singleton Pattern**: The module uses a singleton pattern for managing instances of reputation providers and syncers. This ensures that only one instance of each is used throughout the application, which is crucial for maintaining state consistency.

- **Environment Configuration**: The selection of the reputation provider and syncers is driven by environment variables (`REPUTATION_PROVIDER` and `REPUTATION_SYNCERS`), allowing for flexible configuration without code changes.

### Data Flow

1. **Provider Initialization**:
   - `index.ts` → `getReputationProvider()` initializes the reputation provider based on the `REPUTATION_PROVIDER` environment variable. If set to 'db', it defaults to using `LucidDBProvider` from `providers/LucidDBProvider.ts`.

2. **Feedback Submission**:
   - `providers/LucidDBProvider.ts` → `submitFeedback()` inserts feedback data into the `reputation_feedback` table using a database connection from `shared/db/pool`.

3. **Feedback Retrieval**:
   - `providers/LucidDBProvider.ts` → `readFeedback()` queries the `reputation_feedback` table to retrieve feedback data based on the provided `passportId` and optional `ReadOptions`.

4. **Syncer Initialization**:
   - `index.ts` → `getReputationSyncers()` initializes syncers based on the `REPUTATION_SYNCERS` environment variable, dynamically requiring and instantiating syncer classes like `EVM8004Syncer` from `syncers/EVM8004Syncer.ts`.

5. **External Feedback Synchronization**:
   - `syncers/EVM8004Syncer.ts` → `pullFeedback()` retrieves feedback from an external EVM-based reputation registry using the `ReputationRegistryClient`.

### Patterns & Gotchas

- **Explicit Provider Initialization**: The on-chain provider requires explicit initialization via `setReputationProvider()`. This is a critical step that must not be overlooked, as failing to do so will result in an error when attempting to use the on-chain provider.

- **Dynamic Syncer Loading**: Syncers are loaded dynamically based on the environment configuration. If a required SDK is unavailable, the syncer will be skipped, and a warning will be logged. This can lead to unexpected behavior if not properly configured.

- **Data Consistency**: The module relies on consistent state management through singletons. Developers must ensure that `resetReputationFactory()` is called in test environments to avoid state leakage between tests.

- **Error Handling**: The module employs extensive error logging, especially in syncer operations, to aid in diagnosing issues with external systems. Developers should monitor logs for warnings and errors to troubleshoot synchronization problems effectively.

## Architecture
The architecture of the `reputation` module is centered around two main interfaces: `IReputationProvider` and `IReputationSyncer`. The `IReputationProvider` interface defines methods for interacting with the primary reputation data store, which can be either a database or an on-chain provider. The `IReputationSyncer` interface is implemented by various syncers that handle the synchronization of reputation data with external systems.

- **Singleton Pattern**: The module uses a singleton pattern for managing instances of reputation providers and syncers. This ensures that only one instance of each is used throughout the application, which is crucial for maintaining state consistency.

- **Environment Configuration**: The selection of the reputation provider and syncers is driven by environment variables (`REPUTATION_PROVIDER` and `REPUTATION_SYNCERS`), allowing for flexible configuration without code changes.

### Data Flow

1. **Provider Initialization**:
   - `index.ts` → `getReputationProvider()` initializes the reputation provider based on the `REPUTATION_PROVIDER` environment variable. If set to 'db', it defaults to using `LucidDBProvider` from `providers/LucidDBProvider.ts`.

2. **Feedback Submission**:
   - `providers/LucidDBProvider.ts` → `submitFeedback()` inserts feedback data into the `reputation_feedback` table using a database connection from `shared/db/pool`.

3. **Feedback Retrieval**:
   - `providers/LucidDBProvider.ts` → `readFeedback()` queries the `reputation_feedback` table to retrieve feedback data based on the provided `passportId` and optional `ReadOptions`.

4. **Syncer Initialization**:
   - `index.ts` → `getReputationSyncers()` initializes syncers based on the `REPUTATION_SYNCERS` environment variable, dynamically requiring and instantiating syncer classes like `EVM8004Syncer` from `syncers/EVM8004Syncer.ts`.

5. **External Feedback Synchronization**:
   - `syncers/EVM8004Syncer.ts` → `pullFeedback()` retrieves feedback from an external EVM-based reputation registry using the `ReputationRegistryClient`.

### Patterns & Gotchas

- **Explicit Provider Initialization**: The on-chain provider requires explicit initialization via `setReputationProvider()`. This is a critical step that must not be overlooked, as failing to do so will result in an error when attempting to use the on-chain provider.

- **Dynamic Syncer Loading**: Syncers are loaded dynamically based on the environment configuration. If a required SDK is unavailable, the syncer will be skipped, and a warning will be logged. This can lead to unexpected behavior if not properly configured.

- **Data Consistency**: The module relies on consistent state management through singletons. Developers must ensure that `resetReputationFactory()` is called in test environments to avoid state leakage between tests.

- **Error Handling**: The module employs extensive error logging, especially in syncer operations, to aid in diagnosing issues with external systems. Developers should monitor logs for warnings and errors to troubleshoot synchronization problems effectively.

## Data Flow
1. **Provider Initialization**:
   - `index.ts` → `getReputationProvider()` initializes the reputation provider based on the `REPUTATION_PROVIDER` environment variable. If set to 'db', it defaults to using `LucidDBProvider` from `providers/LucidDBProvider.ts`.

2. **Feedback Submission**:
   - `providers/LucidDBProvider.ts` → `submitFeedback()` inserts feedback data into the `reputation_feedback` table using a database connection from `shared/db/pool`.

3. **Feedback Retrieval**:
   - `providers/LucidDBProvider.ts` → `readFeedback()` queries the `reputation_feedback` table to retrieve feedback data based on the provided `passportId` and optional `ReadOptions`.

4. **Syncer Initialization**:
   - `index.ts` → `getReputationSyncers()` initializes syncers based on the `REPUTATION_SYNCERS` environment variable, dynamically requiring and instantiating syncer classes like `EVM8004Syncer` from `syncers/EVM8004Syncer.ts`.

5. **External Feedback Synchronization**:
   - `syncers/EVM8004Syncer.ts` → `pullFeedback()` retrieves feedback from an external EVM-based reputation registry using the `ReputationRegistryClient`.

### Patterns & Gotchas

- **Explicit Provider Initialization**: The on-chain provider requires explicit initialization via `setReputationProvider()`. This is a critical step that must not be overlooked, as failing to do so will result in an error when attempting to use the on-chain provider.

- **Dynamic Syncer Loading**: Syncers are loaded dynamically based on the environment configuration. If a required SDK is unavailable, the syncer will be skipped, and a warning will be logged. This can lead to unexpected behavior if not properly configured.

- **Data Consistency**: The module relies on consistent state management through singletons. Developers must ensure that `resetReputationFactory()` is called in test environments to avoid state leakage between tests.

- **Error Handling**: The module employs extensive error logging, especially in syncer operations, to aid in diagnosing issues with external systems. Developers should monitor logs for warnings and errors to troubleshoot synchronization problems effectively.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `ExternalFeedback` | `IReputationSyncer.ts` | — |
| `ExternalSummary` | `IReputationSyncer.ts` | — |
| `FeedbackParams` | `types.ts` | — |
| `IReputationProvider` | `IReputationProvider.ts` | — |
| `IReputationSyncer` | `IReputationSyncer.ts` | — |
| `ReadOptions` | `types.ts` | — |
| `ReputationData` | `types.ts` | — |
| `ReputationSummary` | `types.ts` | — |
| `TxReceipt` | `types.ts` | — |
| `ValidationParams` | `types.ts` | — |
| `ValidationResult` | `types.ts` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | identity | `ReputationRegistryClient`, `ValidationRegistryClient` | — |
| imports | shared | `logger`, `pool` | — |

## Patterns & Gotchas
- **Explicit Provider Initialization**: The on-chain provider requires explicit initialization via `setReputationProvider()`. This is a critical step that must not be overlooked, as failing to do so will result in an error when attempting to use the on-chain provider.

- **Dynamic Syncer Loading**: Syncers are loaded dynamically based on the environment configuration. If a required SDK is unavailable, the syncer will be skipped, and a warning will be logged. This can lead to unexpected behavior if not properly configured.

- **Data Consistency**: The module relies on consistent state management through singletons. Developers must ensure that `resetReputationFactory()` is called in test environments to avoid state leakage between tests.

- **Error Handling**: The module employs extensive error logging, especially in syncer operations, to aid in diagnosing issues with external systems. Developers should monitor logs for warnings and errors to troubleshoot synchronization problems effectively.