<!-- generated: commit 505ae77, 2026-03-18T19:46:46.361Z -->
# epoch — Interface Reference

## Interfaces

### AgentEpochData
> `services/mmrService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agentId` | `string` | no |  |
| `epochNumber` | `number` | no |  |
| `vectors` | `string[]` | no |  |

**Extends:** —

### AnchoringConfig
> `services/anchoringService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `authority_keypair` | `Keypair` | yes |  |
| `commitment` | `Commitment` | yes |  |
| `max_retries` | `number` | yes |  |
| `mock_mode` | `boolean` | yes |  |
| `network` | `"devnet" | "testnet" | "mainnet" | "localnet" | "custom"` | no |  |
| `retry_delay_ms` | `number` | yes |  |
| `rpc_url` | `string` | yes |  |

**Extends:** —

### AnchoringHealth
> `services/anchoringService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `authority_balance_sol` | `number` | yes |  |
| `authority_configured` | `boolean` | no |  |
| `authority_pubkey` | `string` | yes |  |
| `connected` | `boolean` | no |  |
| `error` | `string` | yes |  |
| `mock_mode` | `boolean` | no |  |
| `network` | `string` | no |  |
| `rpc_url` | `string` | no |  |

**Extends:** —

### AnchorResult
> `services/anchoringService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain_errors` | `string[]` | yes | Chains that failed during multi-chain anchoring |
| `chain_txs` | `Record<string, string>` | yes | Per-chain transaction hashes (only present for multi-chain anchoring) |
| `epoch_id` | `string` | no |  |
| `error` | `string` | yes |  |
| `root` | `string` | no |  |
| `signature` | `string` | yes |  |
| `success` | `boolean` | no |  |

**Extends:** —

### Epoch
> `services/epochService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | yes | Agent passport ID — set when epoch belongs to a specific agent (BYOR Phase 1) |
| `chain_tx` | `Record<string, string>` | yes |  |
| `created_at` | `number` | no |  |
| `end_leaf_index` | `number` | yes |  |
| `epoch_id` | `string` | no |  |
| `epoch_index` | `number` | no |  |
| `error` | `string` | yes |  |
| `finalized_at` | `number` | yes |  |
| `leaf_count` | `number` | no |  |
| `mmr_root` | `string` | no |  |
| `project_id` | `string` | yes |  |
| `receipt_run_ids` | `string[]` | no |  |
| `retry_count` | `number` | no |  |
| `start_leaf_index` | `number` | no |  |
| `status` | `EpochStatus` | no |  |

**Extends:** —

### EpochConfig
> `services/epochService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `max_epoch_duration_ms` | `number` | no |  |
| `max_receipts_per_epoch` | `number` | no |  |

**Extends:** —

### EpochFilters
> `services/epochService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `page` | `number` | yes |  |
| `per_page` | `number` | yes |  |
| `project_id` | `string` | yes |  |
| `status` | `EpochStatus` | yes |  |

**Extends:** —

### EpochSummary
> `services/epochService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain_tx` | `Record<string, string>` | yes |  |
| `created_at` | `number` | no |  |
| `epoch_id` | `string` | no |  |
| `finalized_at` | `number` | yes |  |
| `leaf_count` | `number` | no |  |
| `project_id` | `string` | yes |  |
| `status` | `EpochStatus` | no |  |

**Extends:** —

### MMRCommitResult
> `services/mmrService.ts`

MMR Service for Lucid L2

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `depinCid` | `string` | no |  |
| `epochNumber` | `number` | no |  |
| `gasCost` | `{ iGas: number; mGas: number; total: number; }` | no |  |
| `mmrRoot` | `Buffer` | no |  |
| `transactionSignature` | `string` | no |  |

**Extends:** —

### PaginatedEpochs
> `services/epochService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `epochs` | `EpochSummary[]` | no |  |
| `page` | `number` | no |  |
| `per_page` | `number` | no |  |
| `total` | `number` | no |  |
| `total_pages` | `number` | no |  |

**Extends:** —

### VerifyAnchorResult
> `services/anchoringService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain_txs` | `Record<string, string>` | yes |  |
| `error` | `string` | yes |  |
| `expected_root` | `string` | no |  |
| `on_chain_root` | `string` | yes |  |
| `tx_signature` | `string` | yes |  |
| `valid` | `boolean` | no |  |

**Extends:** —

## Functions

### addReceiptToEpoch
> `services/epochService.ts`

Add a receipt to the current epoch.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |
| `project_id` | `string` | yes | — |

**Returns:** `void`

**Async:** no

### buildCommitEpochInstruction
> `services/anchoringService.ts`

Build a commit_epoch (update) instruction.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `root` | `Buffer` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### buildCommitEpochsInstruction
> `services/anchoringService.ts`

Build a commit_epochs (update) instruction for batch commits.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `roots` | `Buffer[]` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### buildCommitEpochV2Instruction
> `services/anchoringService.ts`

Build a commit_epoch_v2 (update) instruction with metadata.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `root` | `Buffer` | no | — |
| `epoch_id` | `string` | no | — |
| `epoch_index` | `number` | no | — |
| `leaf_count` | `number` | no | — |
| `timestamp` | `number` | no | — |
| `mmr_size` | `number` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### buildInitEpochInstruction
> `services/anchoringService.ts`

Build an init_epoch instruction (creates the PDA — first use only).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `root` | `Buffer` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### buildInitEpochsInstruction
> `services/anchoringService.ts`

Build an init_epochs instruction (creates the batch PDA — first use only).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `roots` | `Buffer[]` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### buildInitEpochV2Instruction
> `services/anchoringService.ts`

Build an init_epoch_v2 instruction (creates the PDA — first use only).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |
| `root` | `Buffer` | no | — |
| `epoch_id` | `string` | no | — |
| `epoch_index` | `number` | no | — |
| `leaf_count` | `number` | no | — |
| `timestamp` | `number` | no | — |
| `mmr_size` | `number` | no | — |

**Returns:** `TransactionInstruction`

**Async:** no

### checkAnchoringHealth
> `services/anchoringService.ts`

Check the health of the anchoring service.

**Returns:** `Promise<AnchoringHealth>`

**Async:** yes

### commitEpochRoot
> `services/anchoringService.ts`

Commit a single epoch root to the chain.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Promise<AnchorResult>`

**Async:** yes

### commitEpochRootsBatch
> `services/anchoringService.ts`

Commit multiple epoch roots in a single transaction.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_ids` | `string[]` | no | — |

**Returns:** `Promise<AnchorResult[]>`

**Async:** yes

### createEpoch
> `services/epochService.ts`

Create a new epoch.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `project_id` | `string` | yes | — |

**Returns:** `Epoch`

**Async:** no

### deriveEpochBatchRecordPDA
> `services/anchoringService.ts`

Derive the PDA for a batch epoch record.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |

**Returns:** `[PublicKey, number]`

**Async:** no

### deriveEpochRecordPDA
> `services/anchoringService.ts`

Derive the PDA for a single epoch record.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |

**Returns:** `[PublicKey, number]`

**Async:** no

### deriveEpochRecordV2PDA
> `services/anchoringService.ts`

Derive the PDA for a v2 epoch record.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `authority` | `PublicKey` | no | — |

**Returns:** `[PublicKey, number]`

**Async:** no

### disableMockMode
> `services/anchoringService.ts`

Disable mock mode.

**Returns:** `void`

**Async:** no

### enableMockMode
> `services/anchoringService.ts`

Enable mock mode for testing without real chain.

**Returns:** `void`

**Async:** no

### failEpoch
> `services/epochService.ts`

Mark an epoch as failed.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |
| `error` | `string` | no | — |

**Returns:** `Epoch`

**Async:** no

### finalizeEpoch
> `services/epochService.ts`

Finalize an epoch - Mark as anchored with transaction signature(s).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |
| `chain_tx` | `string | Record<string, string>` | no | — |
| `final_root` | `string` | no | — |

**Returns:** `Epoch`

**Async:** no

### getAllEpochs
> `services/epochService.ts`

Get all epochs (for testing/debugging).

**Returns:** `Epoch[]`

**Async:** no

### getAnchoringConfig
> `services/anchoringService.ts`

Get current anchoring configuration.

**Returns:** `AnchoringConfig`

**Async:** no

### getAnchorTransaction
> `services/anchoringService.ts`

Get transaction details for an anchored epoch.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Promise<{ found: boolean; tx_signature?: string; chain_txs?: Record<string, string>; slot?: number; block_time?: number; error?: string; }>`

**Async:** yes

### getConnection
> `services/anchoringService.ts`

Get or create Solana connection.

**Returns:** `Connection`

**Async:** no

### getCurrentEpoch
> `services/epochService.ts`

Get the current active epoch, creating one if needed.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `project_id` | `string` | yes | — |

**Returns:** `Epoch`

**Async:** no

### getEpoch
> `services/epochService.ts`

Get an epoch by ID.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Epoch`

**Async:** no

### getEpochConfig
> `services/epochService.ts`

Get current epoch configuration.

**Returns:** `EpochConfig`

**Async:** no

### getEpochForReceipt
> `services/epochService.ts`

Get the epoch ID for a specific receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `string`

**Async:** no

### getEpochsReadyForFinalization
> `services/epochService.ts`

Get all open epochs that should be finalized.

**Returns:** `Epoch[]`

**Async:** no

### getEpochStats
> `services/epochService.ts`

Get statistics about epochs.

**Returns:** `{ total_epochs: number; open_epochs: number; anchoring_epochs: number; anchored_epochs: number; failed_epochs: number; total_receipts_anchored: number; }`

**Async:** no

### getFailedEpochs
> `services/epochService.ts`

Get all epochs with 'failed' status.

**Returns:** `Epoch[]`

**Async:** no

### getMMRService
> `services/mmrService.ts`

Get the global MMR service instance

**Returns:** `MMRService`

**Async:** no

### isAutoFinalizationRunning
> `services/epochService.ts`

Check if auto-finalization is running.

**Returns:** `boolean`

**Async:** no

### listEpochs
> `services/epochService.ts`

List epochs with optional filtering.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `filters` | `EpochFilters` | yes | `{}` |

**Returns:** `PaginatedEpochs`

**Async:** no

### loadAuthorityFromSecretKey
> `services/anchoringService.ts`

Load authority keypair from secret key bytes.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `secretKey` | `Uint8Array` | no | — |

**Returns:** `Keypair`

**Async:** no

### loadEpochsFromDb
> `services/epochService.ts`

**Returns:** `Promise<number>`

**Async:** yes

### prepareEpochForFinalization
> `services/epochService.ts`

Prepare an epoch for finalization (marks as 'anchoring').

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Promise<Epoch>`

**Async:** yes

### resetAnchoringState
> `services/anchoringService.ts`

Reset anchoring state (for testing).

**Returns:** `void`

**Async:** no

### resetEpochStore
> `services/epochService.ts`

Reset all epoch state (for testing).

**Returns:** `void`

**Async:** no

### retryEpoch
> `services/epochService.ts`

Retry a failed epoch - Reset to open status.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Epoch`

**Async:** no

### setAnchorCallback
> `services/epochService.ts`

Set the anchor callback for auto-finalization.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `callback` | `AnchorCallback` | no | — |

**Returns:** `void`

**Async:** no

### setAnchoringConfig
> `services/anchoringService.ts`

Set anchoring configuration.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `newConfig` | `Partial<AnchoringConfig>` | no | — |

**Returns:** `void`

**Async:** no

### setAuthorityKeypair
> `services/anchoringService.ts`

Set the authority keypair for signing transactions.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `keypair` | `Keypair` | no | — |

**Returns:** `void`

**Async:** no

### setEpochConfig
> `services/epochService.ts`

Update epoch configuration.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `newConfig` | `Partial<EpochConfig>` | no | — |

**Returns:** `void`

**Async:** no

### shouldFinalizeEpoch
> `services/epochService.ts`

Check if an epoch should be finalized based on configuration.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch` | `Epoch` | no | — |

**Returns:** `{ should: boolean; reason?: string; }`

**Async:** no

### startAutoFinalization
> `services/epochService.ts`

Start the auto-finalization scheduler.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `intervalMs` | `number` | yes | `60000` |

**Returns:** `void`

**Async:** no

### stopAutoFinalization
> `services/epochService.ts`

Stop the auto-finalization scheduler.

**Returns:** `void`

**Async:** no

### verifyEpochAnchor
> `services/anchoringService.ts`

Verify that an epoch's root is anchored on-chain.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `epoch_id` | `string` | no | — |

**Returns:** `Promise<VerifyAnchorResult>`

**Async:** yes

## Types

### EpochStatus
> `services/epochService.ts`

```ts
type EpochStatus = "open" | "anchoring" | "anchored" | "failed"
```
