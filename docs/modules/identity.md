<!-- generated: commit d2cfd9e, 2026-03-18T16:59:12.163Z -->
<!-- WARNING: unverified identifiers: PassportManager, PassportStore, createPassport, updateOnChainInfo, validateWithSchema -->
# Identity

## Purpose
The identity module in the Lucid L2 platform is designed to manage digital identities through passports, NFTs, wallets, and related services. It provides a comprehensive system for creating, managing, and synchronizing digital passports across different blockchain networks, primarily focusing on Solana and EVM-compatible chains. This module addresses the need for a unified identity management system that supports multi-chain operations, on-chain synchronization, and NFT minting, thereby facilitating decentralized identity verification and asset management.

## Architecture
The identity module is structured around several key components:

- **Passport Management**: Centralized in `passport/passportManager.ts`, this component handles the creation, updating, and synchronization of digital passports. It interfaces with the `PassportStore` for data persistence and supports schema validation for metadata.

- **Wallet Management**: Defined in `wallet/IAgentWalletProvider.ts`, this component provides interfaces for wallet operations such as creation, balance retrieval, and transaction execution. It abstracts the underlying blockchain interactions to support multiple chains.

- **NFT Management**: Implemented in `nft/INFTProvider.ts` and `nft/Token2022Provider.ts`, this component manages NFT operations, including minting and metadata updates. It supports chain-agnostic operations and integrates with Solana's Token-2022 standard.

- **On-Chain Synchronization**: The `OnChainSyncHandler` interface in `passport/passportManager.ts` facilitates the synchronization of passport data with blockchain networks, ensuring that digital identities are consistently represented on-chain.

- **CAIP-10 Utilities**: Located in `bridge/caip10.ts`, these utilities handle the parsing and validation of CAIP-10 account identifiers, supporting both Solana and EVM address formats.

## Data Flow
1. **Passport Creation**: 
   - Initiated in `passport/passportManager.ts` via the `createPassport` function.
   - Validates input using `validateWithSchema` from `shared/crypto/schemaValidator`.
   - Stores passport data in `stores/passportStore.ts` using `PassportStore.create`.
   - Optionally mints an NFT through `nft/Token2022Provider.ts` using `mint`.

2. **Wallet Operations**:
   - Accessed via `wallet/index.ts` using `getAgentWalletProvider`.
   - Wallet creation and management are handled by methods in `IAgentWalletProvider`, such as `createWallet` and `getBalance`.

3. **NFT Management**:
   - Primary operations are accessed through `nft/index.ts` using `getNFTProvider`.
   - Minting and metadata updates are executed in `nft/Token2022Provider.ts` using `mint` and `updateMetadata`.

4. **On-Chain Sync**:
   - Managed in `passport/passportManager.ts` using `syncToChain`.
   - Synchronization results are stored in `stores/passportStore.ts` using `updateOnChainInfo`.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AgentWallet` | `wallet/IAgentWalletProvider.ts` | Agent Wallet Provider Interface |
| `CreatePassportInput` | `passport/passportManager.ts` | Input for creating a passport |
| `ERC8004AgentMetadata` | `registries/types.ts` | ERC-8004 Registry Types |
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
- **Schema Validation**: Metadata for passports is rigorously validated against predefined schemas. Ensure that any changes to metadata structures are reflected in the schema definitions to avoid validation errors.

- **Chain Detection**: The module auto-detects the blockchain network from the owner address format (EVM or Solana). Be cautious when handling addresses to ensure correct chain operations.

- **NFT Minting**: The decision to mint an NFT is controlled by both a per-request flag and an environment variable (`NFT_MINT_ON_CREATE`). This dual control can lead to unexpected behavior if not properly configured.

- **On-Chain Sync**: The `syncToChain` function is non-blocking and best-effort, meaning it may not immediately reflect changes on-chain. Developers should handle potential delays in synchronization.

- **CAIP-10 Parsing**: The `fromCaip10` function assumes a specific format and may throw errors if the input is malformed. Always validate CAIP-10 strings using `validateCaip10` before parsing.

- **Singleton Instances**: Many components, such as `PassportManager` and `PassportStore`, are implemented as singletons. Reset functions like `resetPassportManager` are provided for testing but should be used cautiously in production to avoid state inconsistencies.