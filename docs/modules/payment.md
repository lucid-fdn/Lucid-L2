<!-- generated: commit d2cfd9e, 2026-03-18T17:00:47.041Z -->
<!-- WARNING: unverified identifiers: PayAI, createEscrow, facilitators, releaseWithReceipt -->
# Payment

## Purpose
The `payment` module in the Lucid L2 platform is designed to handle various aspects of off-chain payment processing, including revenue distribution, payment facilitation, and escrow management. It addresses the need for a robust system to manage financial transactions, ensuring accurate revenue splits, secure payment processing, and dispute resolution. This module supports multiple payment methods and integrates with blockchain networks to facilitate on-chain transactions, providing a comprehensive solution for managing payments in decentralized applications.

## Architecture
The module is structured around several key components:

- **Payout Services**: Located in `services/payoutService.ts`, this handles the calculation and execution of revenue splits among stakeholders. It uses a default split configuration and allows for custom configurations.
  
- **Facilitators**: Defined in `facilitators`, these interfaces and classes manage different payment methods, such as direct payments, Coinbase, and PayAI, through the `X402Facilitator` interface.

- **Escrow Services**: Found in `escrow/escrowService.ts`, this manages the lifecycle of escrows, including creation, release, and dispute handling. It uses both EVM and Solana paths for transaction management.

- **Revenue and Pricing Services**: These are responsible for recording revenue (`services/revenueService.ts`) and managing asset pricing (`services/pricingService.ts`).

- **Spent Proofs Store**: Implemented in `stores/spentProofsStore.ts`, this provides replay protection for payment proofs using Redis or in-memory storage.

The design choices emphasize modularity and extensibility, allowing for easy integration with different blockchain networks and payment methods.

## Data Flow
1. **Revenue Distribution**:
   - `airdrop/revenueAirdrop.ts` → `runRevenueAirdrop` function calculates and distributes revenue to token holders.
   - `services/payoutService.ts` → `calculatePayoutSplit` and `executePayoutSplit` functions manage the calculation and execution of payouts, storing results in a DB-backed in-memory store.

2. **Payment Processing**:
   - `settlement/paymentGrant.ts` → `createPaymentGrant` and `verifyPaymentGrant` functions handle the creation and verification of payment grants.
   - `facilitators/interface.ts` → `X402Facilitator` interface defines methods for payment verification and instruction generation.

3. **Escrow Management**:
   - `escrow/escrowService.ts` → `createEscrow` and `releaseWithReceipt` functions manage escrow creation and release, with data stored in a database.

4. **Spent Proofs**:
   - `stores/spentProofsStore.ts` → `isSpent` and `markSpent` methods provide replay protection for transaction hashes, using Redis or in-memory storage.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AirdropResult` | `airdrop/revenueAirdrop.ts` | — |
| `AssetPricing` | `services/pricingService.ts` | — |
| `ChainConfig` | `types/index.ts` | — |
| `CoinbaseFacilitatorConfig` | `facilitators/coinbase.ts` | — |
| `DirectFacilitatorConfig` | `facilitators/direct.ts` | — |
| `DisputeInfo` | `escrow/disputeTypes.ts` | — |
| `EscrowInfo` | `escrow/escrowTypes.ts` | — |
| `EscrowParams` | `escrow/escrowTypes.ts` | — |
| `EvidenceSubmission` | `escrow/disputeTypes.ts` | — |
| `PayAIFacilitatorConfig` | `facilitators/payai.ts` | — |
| `PaymentExpectation` | `types/index.ts` | — |
| `PaymentGrant` | `settlement/paymentGrant.ts` | — |
| `PaymentInstructions` | `types/index.ts` | — |
| `PaymentParams` | `types/index.ts` | — |
| `PaymentProof` | `types/index.ts` | — |
| `RecordRevenueParams` | `services/revenueService.ts` | — |
| `ResolveParams` | `services/splitResolver.ts` | — |
| `RevenueInfo` | `services/revenueService.ts` | — |
| `SetPricingParams` | `services/pricingService.ts` | — |
| `SpentProofsStore` | `stores/spentProofsStore.ts` | — |
| `SplitRecipient` | `types/index.ts` | — |
| `SplitResolution` | `types/index.ts` | — |
| `SplitResolverConfig` | `services/splitResolver.ts` | — |
| `TokenConfig` | `types/index.ts` | — |
| `VerificationResult` | `types/index.ts` | — |
| `WithdrawResult` | `services/revenueService.ts` | — |
| `X402Facilitator` | `facilitators/interface.ts` | — |
| `X402ResponseV2` | `types/index.ts` | — |

### Key Types

| Type | File | Kind | Description |
|------|------|------|-------------|
| `DisputeStatus` | `escrow/disputeTypes.ts` | enum | Dispute Types |
| `EscrowStatus` | `escrow/escrowTypes.ts` | enum | Escrow Types |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | chain | `getSolanaKeypair` | — |
| imports | shared | `PATHS`, `canonicalJson`, `getChainConfig`, `getClient`, `logger`, `pool` | — |
| exports to | compute | `SplitConfig` | — |

## Patterns & Gotchas
- **Default Configurations**: The module uses default configurations for split calculations and payment methods, which can be overridden. Ensure custom configurations are validated to sum to 10000 basis points.

- **In-Memory Fallbacks**: Many services use in-memory storage as a fallback for database operations. Be aware of potential data loss on service restarts if the database is unavailable.

- **Lazy Imports**: To avoid circular dependencies, some modules use lazy imports. This can lead to runtime errors if not handled correctly, especially in asynchronous functions.

- **Replay Protection**: The `SpentProofsStore` provides replay protection but requires careful management of TTLs and key prefixes to avoid false positives or negatives.

- **Escrow Status Management**: Escrow operations update statuses in the database. Ensure that status transitions are correctly handled to prevent inconsistent states.

New contributors should pay attention to these patterns to avoid common pitfalls and ensure smooth integration with the existing system.