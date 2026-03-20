<!-- generated: commit c7113a7, 2026-03-20T11:04:15.768Z -->
# payment — Interface Reference

## Interfaces

### AirdropResult
> `airdrop/revenueAirdrop.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `distributions` | `{ holder: string; balance: number; share: number; amountLamports: number; }[]` | no |  |
| `holders` | `number` | no |  |
| `passportId` | `string` | no |  |
| `tokenMint` | `string` | no |  |
| `totalDistributed` | `number` | no |  |
| `txSignatures` | `string[]` | no |  |

**Extends:** —

### AssetPricing
> `services/pricingService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `accepted_chains` | `string[]` | no |  |
| `accepted_tokens` | `string[]` | no |  |
| `custom_split_bps` | `Record<string, number>` | no |  |
| `passport_id` | `string` | no |  |
| `payout_address` | `string` | no |  |
| `price_per_call` | `bigint` | no |  |
| `price_per_token` | `bigint` | no |  |
| `price_subscription_hour` | `bigint` | no |  |
| `updated_at` | `Date` | yes |  |

**Extends:** —

### ChainConfig
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chainId` | `number` | yes |  |
| `name` | `string` | no |  |
| `rpcUrl` | `string` | no |  |

**Extends:** —

### CoinbaseFacilitatorConfig
> `facilitators/coinbase.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | yes |  |
| `apiUrl` | `string` | no |  |

**Extends:** —

### DirectFacilitatorConfig
> `facilitators/direct.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chains` | `ChainConfig[]` | no |  |
| `maxProofAge` | `number` | yes | Max age in seconds for a payment proof to be accepted (default: 300) |
| `tokens` | `TokenConfig[]` | no |  |

**Extends:** —

### DisputeInfo
> `escrow/disputeTypes.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `appealDeadline` | `number` | no |  |
| `appealed` | `boolean` | no |  |
| `appealedBy` | `string` | no |  |
| `createdAt` | `number` | no |  |
| `disputeId` | `string` | no |  |
| `escrowId` | `string` | no |  |
| `evidenceDeadline` | `number` | no |  |
| `initiator` | `string` | no |  |
| `reason` | `string` | no |  |
| `resolvedInFavorOf` | `string` | no |  |
| `status` | `DisputeStatus` | no |  |

**Extends:** —

### EscrowInfo
> `escrow/escrowTypes.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `string` | no |  |
| `beneficiary` | `string` | no |  |
| `createdAt` | `number` | no |  |
| `depositor` | `string` | no |  |
| `escrowId` | `string` | no |  |
| `expectedReceiptHash` | `string` | no |  |
| `expiresAt` | `number` | no |  |
| `status` | `EscrowStatus` | no |  |
| `token` | `string` | no |  |

**Extends:** —

### EscrowParams
> `escrow/escrowTypes.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `string` | no |  |
| `beneficiary` | `string` | no |  |
| `duration` | `number` | no |  |
| `expectedReceiptHash` | `string` | yes |  |
| `token` | `string` | no |  |

**Extends:** —

### EvidenceSubmission
> `escrow/disputeTypes.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `description` | `string` | no |  |
| `mmrProof` | `string` | no |  |
| `mmrRoot` | `string` | no |  |
| `receiptHash` | `string` | no |  |

**Extends:** —

### PayAIFacilitatorConfig
> `facilitators/payai.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | yes |  |
| `apiUrl` | `string` | no |  |

**Extends:** —

### PaymentExpectation
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `bigint` | no |  |
| `recipient` | `string` | no |  |
| `token` | `TokenConfig` | no |  |

**Extends:** —

### PaymentGrant
> `settlement/paymentGrant.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `attestation` | `PaymentGrantAttestation` | no |  |
| `grant_id` | `string` | no |  |
| `limits` | `PaymentGrantLimits` | no |  |
| `run_id` | `string` | no |  |
| `scope` | `PaymentGrantScope` | no |  |
| `signature` | `string` | no |  |
| `signer_pubkey` | `string` | no |  |
| `tenant_id` | `string` | no |  |

**Extends:** —

### PaymentInstructions
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `string` | no |  |
| `chain` | `string` | no |  |
| `facilitator` | `string` | no |  |
| `facilitatorUrl` | `string` | yes |  |
| `recipient` | `string` | no |  |
| `scheme` | `string` | yes |  |
| `token` | `string` | no |  |
| `tokenAddress` | `string` | no |  |

**Extends:** —

### PaymentParams
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `bigint` | no |  |
| `chain` | `string` | no |  |
| `recipient` | `string` | no |  |
| `token` | `TokenConfig` | no |  |

**Extends:** —

### PaymentProof
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `authorization` | `string` | yes |  |
| `chain` | `string` | no |  |
| `facilitatorData` | `Record<string, unknown>` | yes |  |
| `txHash` | `string` | yes |  |

**Extends:** —

### RecordRevenueParams
> `services/revenueService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `bigint` | no |  |
| `chain` | `string` | no |  |
| `passport_id` | `string` | no |  |
| `role` | `"compute" | "model" | "protocol" | "orchestrator"` | no |  |
| `run_id` | `string` | no |  |
| `token` | `string` | no |  |
| `tx_hash` | `string` | yes |  |

**Extends:** —

### ResolveParams
> `services/splitResolver.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `computePassportId` | `string` | yes |  |
| `modelPassportId` | `string` | yes |  |
| `orchestratorPassportId` | `string` | yes |  |

**Extends:** —

### RevenueInfo
> `services/revenueService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `pending` | `bigint` | no |  |
| `token` | `string` | no |  |
| `total` | `bigint` | no |  |
| `withdrawn` | `bigint` | no |  |

**Extends:** —

### SetPricingParams
> `services/pricingService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `accepted_chains` | `string[]` | yes |  |
| `accepted_tokens` | `string[]` | yes |  |
| `custom_split_bps` | `Record<string, number>` | yes |  |
| `passport_id` | `string` | no |  |
| `payout_address` | `string` | no |  |
| `price_per_call` | `bigint` | yes |  |
| `price_per_token` | `bigint` | yes |  |
| `price_subscription_hour` | `bigint` | yes |  |

**Extends:** —

### SpentProofsStore
> `stores/spentProofsStore.ts`

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `close` |  | `Promise<void>` | Graceful shutdown (Redis disconnect, etc.). |
| `count` |  | `Promise<number>` | Return the number of tracked spent proofs. |
| `isSpent` | `txHash`: `string` | `Promise<boolean>` | Returns true if the tx hash has already been spent. |
| `markSpent` | `txHash`: `string`, `ttlSeconds`?: `number` | `Promise<void>` | Mark a tx hash as spent, with an optional TTL in seconds. |

**Extends:** —

### SplitRecipient
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `bps` | `number` | no |  |
| `passportId` | `string` | yes |  |
| `role` | `"compute" | "model" | "protocol" | "orchestrator"` | no |  |
| `walletAddress` | `string` | no |  |

**Extends:** —

### SplitResolution
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain` | `string` | no |  |
| `recipients` | `SplitRecipient[]` | no |  |
| `splitterAddress` | `string` | yes |  |
| `token` | `TokenConfig` | no |  |
| `totalAmount` | `bigint` | no |  |
| `useSplitter` | `boolean` | no |  |

**Extends:** —

### SplitResolverConfig
> `services/splitResolver.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `defaultChain` | `string` | yes |  |
| `defaultSplitterAddress` | `string` | no |  |
| `defaultToken` | `TokenConfig` | yes |  |
| `protocolTreasuryAddress` | `string` | no |  |

**Extends:** —

### TokenConfig
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `address` | `string` | no |  |
| `chain` | `string` | no |  |
| `decimals` | `number` | no |  |
| `symbol` | `string` | no |  |

**Extends:** —

### VerificationResult
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `metadata` | `Record<string, unknown>` | yes |  |
| `reason` | `string` | yes |  |
| `settledAmount` | `bigint` | yes |  |
| `txHash` | `string` | yes |  |
| `valid` | `boolean` | no |  |

**Extends:** —

### WithdrawResult
> `services/revenueService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `amount` | `bigint` | no |  |
| `status` | `"pending_payout" | "no_funds"` | no | Status of the withdrawal — 'pending_payout' means DB records are marked, |
| `token` | `string` | no |  |

**Extends:** —

### X402Facilitator
> `facilitators/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `name` | `string` | no |  |
| `supportedChains` | `ChainConfig[]` | no |  |
| `supportedTokens` | `TokenConfig[]` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `instructions` | `params`: `PaymentParams` | `PaymentInstructions` |  |
| `verify` | `proof`: `PaymentProof`, `expected`: `PaymentExpectation` | `Promise<VerificationResult>` |  |

**Extends:** —

### X402ResponseV2
> `types/index.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `alternatives` | `PaymentInstructions[]` | yes |  |
| `description` | `string` | no |  |
| `expires` | `number` | yes |  |
| `facilitator` | `string` | no |  |
| `payment` | `PaymentInstructions` | no |  |
| `splits` | `{ role: string; passport?: string; bps: number; }[]` | yes |  |
| `version` | `"2"` | no |  |

**Extends:** —

## Functions

### calculatePayoutSplit
> `services/payoutService.ts`

Calculate payout split for a run

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `params` | `{ run_id: string; total_amount_lamports: bigint; compute_wallet: string; model_wallet?: string; orchestrator_wallet?: string; config?: SplitConfig; }` | no | — |

**Returns:** `PayoutSplit`

**Async:** no

### createPaymentGrant
> `settlement/paymentGrant.ts`

Create a signed PaymentGrant.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `PaymentGrantInput` | no | — |
| `secretKey` | `Uint8Array` | no | — |

**Returns:** `Promise<PaymentGrant>`

**Async:** yes

### createPayoutFromReceipt
> `services/payoutService.ts`

Create payout from receipt data

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `params` | `{ run_id: string; tokens_in: number; tokens_out: number; price_per_1k_tokens_lamports: bigint; compute_wallet: string; model_wallet?: string; orchestrator_wallet?: string; config?: SplitConfig; }` | no | — |

**Returns:** `PayoutSplit`

**Async:** no

### executePayoutSplit
> `services/payoutService.ts`

Execute a payout split on-chain via EVM USDC transfers.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `runId` | `string` | no | — |
| `chainId` | `string` | no | — |

**Returns:** `Promise<PayoutExecution>`

**Async:** yes

### getDisputeService
> `escrow/disputeService.ts`

**Returns:** `DisputeService`

**Async:** no

### getEscrowService
> `escrow/escrowService.ts`

**Returns:** `EscrowService`

**Async:** no

### getPaymentGateService
> `stores/paymentGateService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `options` | `{ rpcUrl?: string; commitment?: Commitment; programId?: string; }` | yes | — |

**Returns:** `PaymentGateService`

**Async:** no

### getPayout
> `services/payoutService.ts`

Get a stored payout split (DB-backed with in-memory fallback)

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `Promise<PayoutSplit>`

**Async:** yes

### getPayoutExecution
> `services/payoutService.ts`

Get a payout execution record (DB-backed with in-memory fallback).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `runId` | `string` | no | — |
| `chainId` | `string` | no | — |

**Returns:** `Promise<PayoutExecution>`

**Async:** yes

### runRevenueAirdrop
> `airdrop/revenueAirdrop.ts`

Run revenue airdrop for a passport's share token holders.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `passportId` | `string` | no | — |
| `tokenMint` | `string` | no | — |
| `amountLamports` | `number` | no | — |

**Returns:** `Promise<AirdropResult>`

**Async:** yes

### storePayout
> `services/payoutService.ts`

Store a payout split (DB-backed with in-memory fallback)

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `payout` | `PayoutSplit` | no | — |

**Returns:** `Promise<void>`

**Async:** yes

### verifyPaymentGrant
> `settlement/paymentGrant.ts`

Verify a PaymentGrant signature and expiry.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `grant` | `PaymentGrant` | no | — |
| `trustedSignerPubkey` | `string` | no | — |

**Returns:** `VerifyResult`

**Async:** no

### verifyPayoutSplit
> `services/payoutService.ts`

Verify payout split integrity

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `payout` | `PayoutSplit` | no | — |

**Returns:** `{ valid: boolean; error?: string; }`

**Async:** no

## Enums

### DisputeStatus
> `escrow/disputeTypes.ts`

Dispute Types

| Value | Description |
|-------|-------------|
| `Open` |  |
| `EvidencePhase` |  |
| `Resolved` |  |
| `Appealed` |  |

### EscrowStatus
> `escrow/escrowTypes.ts`

Escrow Types

| Value | Description |
|-------|-------------|
| `Created` |  |
| `Released` |  |
| `Refunded` |  |
| `Disputed` |  |
