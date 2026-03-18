<!-- generated: commit 505ae77, 2026-03-18T19:46:46.349Z -->
# identity — Interface Reference

## Interfaces

### AgentWallet
> `wallet/IAgentWalletProvider.ts`

Agent Wallet Provider Interface

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `address` | `string` | no | Wallet address (Solana base58 or EVM 0x) |
| `agent_passport_id` | `string` | no | Associated agent passport ID |
| `chain` | `string` | no | Which blockchain |
| `created_at` | `number` | no | Creation timestamp |
| `provider` | `string` | no | Which provider created it |

**Extends:** —

### CreatePassportInput
> `passport/passportManager.ts`

Input for creating a passport

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `"solana" | "evm"` | yes | Target chain. Auto-detected from owner address format if omitted. Defaults to 'solana'. |
| `description` | `string` | yes |  |
| `metadata` | `any` | no |  |
| `mintNFT` | `boolean` | yes | Mint an NFT for this passport. Defaults to env NFT_MINT_ON_CREATE (true). |
| `name` | `string` | yes |  |
| `owner` | `string` | no |  |
| `tags` | `string[]` | yes |  |
| `type` | `PassportType` | no |  |
| `version` | `string` | yes |  |

**Extends:** —

### ERC8004AgentMetadata
> `registries/types.ts`

ERC-8004 Registry Types

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `capabilities` | `string[]` | yes |  |
| `description` | `string` | no |  |
| `endpoints` | `string[]` | yes |  |
| `image` | `string` | yes |  |
| `name` | `string` | no |  |
| `trust_models` | `string[]` | yes |  |
| `wallets` | `Record<string, string>` | yes |  |

**Extends:** —

### IAgentWalletProvider
> `wallet/IAgentWalletProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `string` | no | Target chain |
| `providerName` | `string` | no | Provider name |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `createWallet` | `agentPassportId`: `string`, `chain`?: `string` | `Promise<AgentWallet>` | Create a new wallet for an agent |
| `executeTransaction` | `walletAddress`: `string`, `tx`: `TransactionRequest` | `Promise<TransactionResult>` | Execute a transaction from the agent wallet |
| `getBalance` | `walletAddress`: `string` | `Promise<WalletBalance>` | Get wallet balance |
| `getWallet` | `agentPassportId`: `string` | `Promise<AgentWallet>` | Get existing wallet for an agent |
| `isHealthy` |  | `Promise<boolean>` | Health check |
| `setSpendingLimits` | `walletAddress`: `string`, `limits`: `SpendingLimits` | `Promise<void>` | Set spending limits |

**Extends:** —

### INFTProvider
> `nft/INFTProvider.ts`

Chain-agnostic NFT provider.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `string` | no | Which chain this provider targets |
| `providerName` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `burn` | `mint`: `string` | `Promise<string>` | Burn an NFT (for passport revocation) |
| `getAsset` | `mint`: `string` | `Promise<any>` | Get on-chain asset data for an NFT |
| `isHealthy` |  | `Promise<boolean>` | Health check |
| `mint` | `owner`: `string`, `metadata`: `NFTMetadata` | `Promise<MintResult>` | Mint a new NFT for a passport |
| `updateMetadata` | `mint`: `string`, `newMetadata`: `Partial<NFTMetadata>` | `Promise<string>` | Update NFT metadata URI |

**Extends:** —

### ITokenLauncher
> `shares/ITokenLauncher.ts`

Token launcher interface — swappable between direct SPL mint and Genesis TGE.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `providerName` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `getTokenInfo` | `passportId`: `string` | `Promise<TokenInfo>` | Get token info for a passport |
| `isHealthy` |  | `Promise<boolean>` | Health check |
| `launchToken` | `params`: `TokenLaunchParams` | `Promise<TokenLaunchResult>` | Create + launch a share token for a passport |

**Extends:** —

### MintResult
> `nft/INFTProvider.ts`

Result of an NFT mint operation

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `string` | no | Chain where the NFT was minted |
| `mint` | `string` | no | Mint address (Solana base58 or EVM 0x...) |
| `provider` | `string` | no | Provider used |
| `tbaAddress` | `string` | yes | ERC-6551 TBA address (EVM only, if auto-created) |
| `tokenAccount` | `string` | yes | Token account holding the NFT (ATA on Solana, owner on EVM) |
| `txSignature` | `string` | no | Transaction signature / hash |

**Extends:** —

### NFTMetadata
> `nft/INFTProvider.ts`

NFT metadata (follows Metaplex / OpenSea standard)

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attributes` | `{ trait_type: string; value: string | number; }[]` | yes |  |
| `description` | `string` | yes |  |
| `image` | `string` | yes |  |
| `name` | `string` | no |  |
| `passportId` | `string` | no | Passport this NFT represents |
| `passportType` | `string` | no | Passport type (model, compute, tool, agent, dataset) |
| `symbol` | `string` | no |  |
| `uri` | `string` | no | DePIN-stored JSON URI (from Phase 1) |

**Extends:** —

### OnChainSyncHandler
> `passport/passportManager.ts`

On-chain sync handler interface

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `syncToChain` | `passport`: `Passport`, `options`?: `{ forceReupload?: boolean; }` | `Promise<{ pda: string; tx: string; }>` |  |

**Extends:** —

### OperationResult
> `passport/passportManager.ts`

Result type for operations

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `data` | `T` | yes |  |
| `details` | `any` | yes |  |
| `error` | `string` | yes |  |
| `ok` | `boolean` | no |  |

**Extends:** —

### ReputationRecord
> `registries/types.ts`

Reputation feedback record

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agentTokenId` | `bigint` | no |  |
| `category` | `string` | no |  |
| `feedbackId` | `bigint` | no |  |
| `from` | `string` | no |  |
| `score` | `number` | no |  |
| `timestamp` | `bigint` | no |  |

**Extends:** —

### ReputationSummary
> `registries/types.ts`

Average reputation score

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agentTokenId` | `string` | no |  |
| `averageScore` | `number` | no |  |
| `chainId` | `string` | no |  |
| `totalFeedback` | `number` | no |  |

**Extends:** —

### SpendingLimits
> `wallet/IAgentWalletProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `daily_usd` | `number` | no |  |
| `per_tx_usd` | `number` | no |  |

**Extends:** —

### TokenInfo
> `shares/ITokenLauncher.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `decimals` | `number` | no |  |
| `holders` | `number` | yes |  |
| `mint` | `string` | no |  |
| `name` | `string` | no |  |
| `passportId` | `string` | no |  |
| `symbol` | `string` | no |  |
| `totalSupply` | `number` | no |  |

**Extends:** —

### TokenLaunchParams
> `shares/ITokenLauncher.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `decimals` | `number` | yes | Token decimals (default: 6) |
| `name` | `string` | no |  |
| `owner` | `string` | no | Owner address — receives total supply |
| `passportId` | `string` | no |  |
| `symbol` | `string` | no |  |
| `totalSupply` | `number` | no |  |
| `uri` | `string` | no | Arweave metadata URI |

**Extends:** —

### TokenLaunchResult
> `shares/ITokenLauncher.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `mint` | `string` | no | SPL token mint address |
| `provider` | `string` | no | Provider used |
| `totalSupply` | `number` | no | Total supply minted |
| `txSignature` | `string` | no | Transaction signature |

**Extends:** —

### TransactionRequest
> `wallet/IAgentWalletProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `string` | yes |  |
| `data` | `string` | yes |  |
| `to` | `string` | no |  |
| `token_mint` | `string` | yes |  |
| `value` | `string` | yes |  |

**Extends:** —

### TransactionResult
> `wallet/IAgentWalletProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `string` | no |  |
| `error` | `string` | yes |  |
| `success` | `boolean` | no |  |
| `tx_signature` | `string` | no |  |

**Extends:** —

### ValidationRecord
> `registries/types.ts`

Validation record returned from the Validation Registry

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agentTokenId` | `bigint` | no |  |
| `metadata` | `string` | yes |  |
| `receiptHash` | `string` | no |  |
| `timestamp` | `bigint` | no |  |
| `valid` | `boolean` | no |  |
| `validationId` | `bigint` | no |  |
| `validator` | `string` | no |  |

**Extends:** —

### WalletBalance
> `wallet/IAgentWalletProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `address` | `string` | no |  |
| `balances` | `{ token: string; amount: string; decimals: number; usd_value?: number; }[]` | no |  |

**Extends:** —

## Functions

### fromCaip10
> `bridge/caip10.ts`

Parse a CAIP-10 account ID into components.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `caip10` | `string` | no | — |

**Returns:** `ParsedCaip10`

**Async:** no

### getAgentWalletProvider
> `wallet/index.ts`

Get the agent wallet provider.

**Returns:** `IAgentWalletProvider`

**Async:** no

### getAllNFTProviders
> `nft/index.ts`

Get all configured NFT providers for multi-chain minting.

**Returns:** `INFTProvider[]`

**Async:** no

### getERC7579Service
> `erc7579Service.ts`

**Returns:** `ERC7579Service`

**Async:** no

### getIdentityBridgeService
> `bridge/identityBridgeService.ts`

**Returns:** `IdentityBridgeService`

**Async:** no

### getNFTProvider
> `nft/index.ts`

Get the primary NFT provider.

**Returns:** `INFTProvider`

**Async:** no

### getPassportManager
> `passport/passportManager.ts`

**Returns:** `PassportManager`

**Async:** no

### getPassportService
> `passport/passportService.ts`

**Returns:** `PassportService`

**Async:** no

### getPassportSyncService
> `passport/passportSyncService.ts`

Get or create PassportSyncService singleton

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `options` | `{ rpcUrl?: string; commitment?: Commitment; programId?: string; }` | yes | — |

**Returns:** `PassportSyncService`

**Async:** no

### getPaymasterService
> `paymasterService.ts`

**Returns:** `PaymasterService`

**Async:** no

### getTBAService
> `tbaService.ts`

**Returns:** `TBAService`

**Async:** no

### getTokenLauncher
> `shares/index.ts`

Get the token launcher provider.

**Returns:** `ITokenLauncher`

**Async:** no

### isEvmCaip10
> `bridge/caip10.ts`

Check if a CAIP-10 string is an EVM address.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `caip10` | `string` | no | — |

**Returns:** `boolean`

**Async:** no

### isSolanaCaip10
> `bridge/caip10.ts`

Check if a CAIP-10 string is a Solana address.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `caip10` | `string` | no | — |

**Returns:** `boolean`

**Async:** no

### resetPassportManager
> `passport/passportManager.ts`

**Returns:** `void`

**Async:** no

### validateCaip10
> `bridge/caip10.ts`

Validate a CAIP-10 string format.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `caip10` | `string` | no | — |

**Returns:** `boolean`

**Async:** no

## Types

### ComputeAvailabilityChecker
> `passport/passportManager.ts`

Compute availability checker — injected by gateway-lite to avoid circular dependency.

```ts
type ComputeAvailabilityChecker = (modelMeta: any, computeCatalog: any[]) => boolean
```

### ModelCatalogLookup
> `passport/passportManager.ts`

Model catalog lookup — injected by gateway-lite to avoid circular dependency.

```ts
type ModelCatalogLookup = { [x: string]: any; }
```
