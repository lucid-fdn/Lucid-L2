<!-- generated: commit d2cfd9e, 2026-03-18T17:02:24.998Z -->
<!-- WARNING: unverified identifiers: EVM8004Syncer, LucidDBProvider, ReputationRegistryClient, reputation -->
# Reputation

## Purpose
The `reputation` module in the Lucid L2 platform manages the collection, synchronization, and validation of reputation data across different systems. It provides a unified interface for handling reputation feedback and summaries, allowing for both on-chain and off-chain data integration. This module is crucial for maintaining a consistent and reliable reputation system that can be extended to various asset types and external systems.

## Architecture
The module is structured around two main interfaces: `IReputationProvider` and `IReputationSyncer`. The `IReputationProvider` interface is responsible for managing reputation data within the system, including submitting feedback and validations, reading feedback, and generating summaries. The `IReputationSyncer` interface handles the synchronization of reputation data with external systems, allowing for pulling and pushing feedback and summaries.

Key design choices include:
- **Singleton Pattern**: The module uses a singleton pattern for managing reputation providers and syncers, ensuring that only one instance of each is active at any time. This is managed through the `getReputationProvider` and `getReputationSyncers` functions in `index.ts`.
- **Environment Configuration**: The selection of reputation providers and syncers is driven by environment variables (`REPUTATION_PROVIDER` and `REPUTATION_SYNCERS`), allowing for flexible configuration without code changes.
- **Modular Syncers**: Each syncer, such as `EVM8004Syncer`, is implemented in its own file and adheres to the `IReputationSyncer` interface, facilitating easy addition of new syncers.

## Data Flow
1. **Provider Initialization**: 
   - `index.ts` → `getReputationProvider()` → Initializes the provider based on the `REPUTATION_PROVIDER` environment variable. Defaults to `LucidDBProvider` if not explicitly set.
   - `index.ts` → `setReputationProvider()` → Allows explicit setting of the provider, necessary for on-chain providers.

2. **Syncer Initialization**:
   - `index.ts` → `getReputationSyncers()` → Initializes syncers based on the `REPUTATION_SYNCERS` environment variable, loading each syncer module dynamically.

3. **Feedback Submission**:
   - `providers/LucidDBProvider.ts` → `submitFeedback()` → Inserts feedback into the `reputation_feedback` table in the database.

4. **Feedback Reading**:
   - `providers/LucidDBProvider.ts` → `readFeedback()` → Queries the `reputation_feedback` table with optional filters and returns `ReputationData`.

5. **Summary Generation**:
   - `providers/LucidDBProvider.ts` → `getSummary()` → Aggregates data from `reputation_feedback` and `reputation_validations` tables to produce a `ReputationSummary`.

6. **Syncer Operations**:
   - `syncers/EVM8004Syncer.ts` → `pullFeedback()` and `pullSummary()` → Fetches data from external systems via `ReputationRegistryClient`.
   - `syncers/EVM8004Syncer.ts` → `pushFeedback()` → Submits feedback to external systems.

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
- **Provider Initialization**: The `getReputationProvider()` function defaults to a database provider unless explicitly set to an on-chain provider using `setReputationProvider()`. This can lead to unexpected behavior if the environment variable is not correctly configured.
- **Dynamic Syncer Loading**: Syncers are loaded dynamically based on environment variables. If a syncer module is unavailable, it will be skipped with a warning, which can lead to incomplete synchronization if not monitored.
- **Feedback and Validation Separation**: Feedback and validation data are stored and managed separately, which requires careful coordination when aggregating summaries.
- **Error Handling**: The module relies heavily on logging for error handling. Errors in syncer operations, especially network-related issues, are logged but do not halt execution, which can obscure operational issues if logs are not regularly reviewed.
- **Asset Type Mapping**: The `AssetType` mapping is crucial for ensuring correct data categorization. Any changes to asset types must be reflected in both `ASSET_TYPE_MAP` and `ASSET_TYPE_REVERSE` to maintain consistency.