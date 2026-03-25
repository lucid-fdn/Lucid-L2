<!-- generated: commit 8a415ae, 2026-03-18T17:33:06.811Z -->
<!-- WARNING: unverified identifiers: IDs, PassportStore, attemptNFTMint, attemptOnChainSync, create, createPassport, validateWithSchema -->
# Identity

## Purpose
The identity module in the Lucid L2 platform is designed to manage digital identities through the use of passports, NFTs, and wallets. It provides a comprehensive system for creating, updating, and managing these identities across different blockchain networks, primarily Solana and EVM. This module addresses the need for a unified identity management system that can handle multi-chain operations, ensuring that digital assets and identities are securely managed and synchronized on-chain.

## Architecture
The identity module is structured around several key components:

- **Passport Management**: The `passportManager.ts` file provides the core logic for managing passports, including creation, updating, and deletion. It integrates schema validation and on-chain synchronization through the `OnChainSyncHandler` interface.

- **Wallet Management**: The `IAgentWalletProvider.ts` interface defines methods for wallet operations such as creating wallets, executing transactions, and setting spending limits. The `getAgentWalletProvider` function in `wallet/index.ts` provides access to the wallet provider.

- **NFT Management**: The `INFTProvider.ts` interface supports chain-agnostic NFT operations like minting and burning. The `getNFTProvider` and `getAllNFTProviders` functions in `nft/index.ts` facilitate access to NFT providers.

- **Token Launching**: The `ITokenLauncher.ts` interface allows for token launching operations, supporting both SPL mint and Genesis TGE.

- **CAIP-10 Utilities**: The `caip10.ts` file provides utilities for parsing and validating CAIP-10 account IDs, which are crucial for cross-chain identity management.

- **Identity Projection**: The `projections/` module handles async projection of Lucid passport identity to external Solana agent registries (Metaplex `mpl-agent-registry`, QuantuLabs `8004-solana`). Lucid passports are canonical; external registries are derived projections for discoverability. Uses `ISolanaIdentityRegistry` interface with a capability model, centralized ERC-8004 doc builder, and parallel projection with exponential backoff.

Key design choices include the use of interfaces to abstract blockchain-specific operations, allowing the module to be easily extended to support additional chains or identity types.

## Data Flow
Data flow within the identity module follows these paths:

1. **Passport Creation**: 
   - `passport/passportManager.ts` → `createPassport` function → `stores/passportStore.ts` → `create` method.
   - This flow validates input, creates a passport, and stores it in the `PassportStore`.

2. **Wallet Operations**:
   - `wallet/index.ts` → `getAgentWalletProvider` function → `IAgentWalletProvider` interface methods.
   - Wallet operations such as `createWallet` and `executeTransaction` are executed through the wallet provider.

3. **NFT Minting**:
   - `nft/index.ts` → `getNFTProvider` function → `INFTProvider` interface methods.
   - The `mint` method is used to create NFTs, with metadata stored and managed through the NFT provider.

4. **On-Chain Sync**:
   - `passport/passportManager.ts` → `attemptOnChainSync` method → `OnChainSyncHandler` interface.
   - This flow handles the synchronization of passport data to the blockchain, ensuring consistency between off-chain and on-chain states.

5. **Identity Projection** (async, non-blocking):
   - `passport/passportManager.ts` → `triggerIdentityProjection()` → `projections/jobs/syncExternalIdentity.ts`
   - Persists `status: 'pending'` to `external_registrations` (durable intent), then dispatches via `setImmediate`.
   - `syncExternalIdentity()` fans out to all configured registries via `Promise.allSettled`.
   - Each registry: `buildRegistrationDocFromPassport()` → upload to DePIN → call registry SDK (e.g., `registerIdentityV1` for Metaplex).
   - Retry with exponential backoff + jitter (30s cap, configurable max retries).
   - Results persisted to `passport.external_registrations` via per-passport mutex (`updateExternalRegistration`).
   - Triggered on `createPassport` (register mode), `updatePassport` (sync mode), `updateEndpoints` (sync mode).

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AgentWallet` | `wallet/IAgentWalletProvider.ts` | Agent Wallet Provider Interface |
| `CreatePassportInput` | `passport/passportManager.ts` | Input for creating a passport |
| `ERC8004AgentMetadata` | `registries/types.ts` | ERC-8004 Registry Types |
| `ERC8004RegistrationDoc` | `projections/registration-doc/types.ts` | Extended ERC-8004 doc with services, registrations, supportedTrust |
| `ISolanaIdentityRegistry` | `projections/ISolanaIdentityRegistry.ts` | Capability-driven registry adapter interface |
| `RegistryCapabilities` | `projections/ISolanaIdentityRegistry.ts` | Register/resolve/sync/deregister capability flags |
| `IAgentWalletProvider` | `wallet/IAgentWalletProvider.ts` | — |
| `INFTProvider` | `nft/INFTProvider.ts` | Chain-agnostic NFT provider. |
| `ITokenLauncher` | `shares/ITokenLauncher.ts` | Token launcher interface — swappable between direct SPL mint and Genesis TGE. |
| `MintResult` | `nft/INFTProvider.ts` | Result of an NFT mint operation |
| `NFTMetadata` | `nft/INFTProvider.ts` | NFT metadata (follows Metaplex / OpenSea standard) |
| `OnChainSyncHandler` | `passport/passportManager.ts` | On-chain sync handler interface |
| `OperationResult` | `passport/passportManager.ts` | Result type for operations |
| `ReputationRecord` | `registries/types.ts` | Reputation feedback record |
| `ReputationSummary` | `registries/types.ts` | Average reputation score |
| `SpendingLimits` | `wallet/IAgentWalletProvider.ts` | — |
| `TokenInfo` | `shares/ITokenLauncher.ts` | — |
| `TokenLaunchParams` | `shares/ITokenLauncher.ts` | — |
| `TokenLaunchResult` | `shares/ITokenLauncher.ts` | — |
| `TransactionRequest` | `wallet/IAgentWalletProvider.ts` | — |
| `TransactionResult` | `wallet/IAgentWalletProvider.ts` | — |
| `ValidationRecord` | `registries/types.ts` | Validation record returned from the Validation Registry |
| `WalletBalance` | `wallet/IAgentWalletProvider.ts` | — |

### Key Types

| Type | File | Kind | Description |
|------|------|------|-------------|
| `ComputeAvailabilityChecker` | `passport/passportManager.ts` | alias | Compute availability checker — injected by gateway-lite to avoid circular dependency. |
| `ModelCatalogLookup` | `passport/passportManager.ts` | alias | Model catalog lookup — injected by gateway-lite to avoid circular dependency. |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | chain | `CHAIN_CONFIGS`, `EVMAdapter`, `blockchainAdapterFactory`, `getSolanaKeypair`, `initSolana` | — |
| imports | errors.ts | `ChainFeatureUnavailable` | — |
| imports | shared | `AgentIdentity`, `LucidPassports`, `PATHS`, `PassportNFT`, `PassportNFTMetadata`, `ReputationData`, `SchemaId`, `getChainConfig`, `logger`, `validateWithSchema` | — |
| exports to | compute | `CreatePassportInput`, `getAgentWalletProvider`, `getPassportManager` | — |
| exports to | reputation | `ReputationRegistryClient`, `ValidationRegistryClient` | — |

## Patterns & Gotchas
- **Schema Validation**: The `validateWithSchema` function is heavily used to ensure that metadata conforms to predefined schemas. This can be a source of errors if schemas are not correctly defined or updated.

- **Chain Detection**: The system auto-detects the blockchain network (Solana or EVM) based on the format of the owner address. This can lead to issues if addresses are incorrectly formatted.

- **NFT Minting**: The `attemptNFTMint` function is non-blocking and best-effort, meaning NFT minting failures do not halt passport creation. This can lead to inconsistencies if not properly monitored.

- **On-Chain Sync**: The `syncToChain` function relies on an external sync handler. If this handler is not configured, on-chain synchronization will fail silently, which can be problematic for maintaining data integrity.

- **Auto-Save Mechanism**: The `PassportStore` uses an auto-save mechanism to persist data. Developers must ensure that changes are marked as dirty to trigger persistence, or data may be lost.

- **Identity Projection**: External registry projection is async and non-blocking — passport creation never depends on external registry health. Projections use `Promise.allSettled` (parallel), exponential backoff with jitter, and per-passport mutex for safe concurrent writes. `recoverPendingProjections()` should be called on server startup to retry stuck projections.

- **Lucid Passports vs ERC-8004**: Lucid passports and Metaplex/QuantuLabs identity registrations serve different purposes. ERC-8004 is a narrow identity standard ("I exist, here's how to reach me"). Lucid passports are a rich asset record ("I exist, here's my proof, my license, my price, my audit trail, my version history"). Both records exist for the same agent — Metaplex gives discoverability in their ecosystem, Lucid gives everything else (x402 payment gates, attestations, versioning, licensing, content hashes, revenue splits, 5 asset types).

- **Shared Umi**: `LazyUmi` in `shared/chains/solana/umi.ts` is used by both `MetaplexCoreProvider` (NFT minting) and `MetaplexConnection` (identity projection). Adding Umi plugins (e.g., `mplAgentIdentity`) is done via the `plugins` option, not by modifying the shared base. `LazyUmi` supports `rpcUrl` override for per-consumer network targeting.

- **Multi-Network Metaplex**: `METAPLEX_RPC_URL` allows Metaplex identity registration on mainnet while Lucid (passports, epochs, anchoring) runs on devnet. If not set, falls back to `SOLANA_RPC_URL`. This enables production agent discoverability on Metaplex mainnet without requiring all Lucid programs to be deployed on mainnet. The signing wallet (`SOLANA_PRIVATE_KEY`) must have SOL on whichever network Metaplex targets.

- **Metaplex Collection Required**: Agents must be minted as Core assets within a collection (`METAPLEX_COLLECTION_ADDRESS`) for `registerIdentityV1` to accept them. Standalone Core assets (no collection) are rejected by the Metaplex agent registry program.

- **Idempotent Metaplex Operations**: `registerIdentityV1`, `registerExecutiveV1`, and `delegateExecutionV1` all throw "already registered/uninitialized" errors on retry. These are caught and treated as success — the projection system is fully idempotent.

Understanding these patterns and potential pitfalls is crucial for effectively contributing to the identity module.