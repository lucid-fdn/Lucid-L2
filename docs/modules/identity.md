<!-- generated: commit 0dd79c5, 2026-03-18T16:38:51.513Z -->
# Identity

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

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
*AI enrichment pending.*