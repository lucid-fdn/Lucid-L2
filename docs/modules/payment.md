<!-- generated: commit 8a415ae, 2026-03-18T17:35:19.844Z -->
<!-- WARNING: unverified identifiers: DisputeService, EscrowService, PayAI, SplitConfig, claimTimeout, createEscrow, recordRevenue -->
# Payment

## Purpose
The payment module in the Lucid L2 platform is designed to handle complex financial transactions, including revenue distribution, payment facilitation, and escrow management. It addresses the need for secure, efficient, and transparent financial operations across multiple blockchain networks. This module supports various payment scenarios, such as direct payouts, escrowed transactions, and revenue airdrops, ensuring that stakeholders receive their due compensation while maintaining the integrity and traceability of transactions.

## Architecture
The module is structured into several key components, each responsible for a specific aspect of the payment process:

- **Payout Services**: Located in `services/payoutService.ts`, this component handles the calculation and execution of revenue splits among stakeholders. It uses a default split configuration to distribute funds between compute providers, model providers, protocol treasury, and orchestrators.

- **Facilitators**: Defined in `facilitators/`, these classes manage different payment facilitation methods, such as direct payments, Coinbase, and PayAI. They implement the `X402Facilitator` interface to provide a consistent API for payment verification and instruction generation.

- **Escrow Services**: Found in `escrow/`, these services manage escrow contracts, allowing for secure fund holding and conditional release based on receipt verification. The `EscrowService` and `DisputeService` classes handle the lifecycle of escrow transactions and dispute resolution.

- **Revenue and Pricing Services**: In `services/revenueService.ts` and `services/pricingService.ts`, these services manage the recording of revenue and setting of asset pricing, respectively. They ensure accurate financial tracking and flexible pricing configurations.

- **Spent Proofs Store**: Implemented in `stores/spentProofsStore.ts`, this component provides replay protection for payment proofs using Redis or in-memory storage.

## Data Flow
1. **Payout Calculation**: 
   - `services/payoutService.ts` → `calculatePayoutSplit` function calculates the payout distribution based on the provided configuration and total amount.
   - `storePayout` function stores the payout split in both an in-memory map and a database.

2. **Payment Execution**:
   - `executePayoutSplit` function retrieves the payout split using `getPayout`, then executes on-chain transfers using blockchain adapters.

3. **Revenue Recording**:
   - `services/revenueService.ts` → `recordRevenue` function logs revenue data into the database for later retrieval and analysis.

4. **Escrow Management**:
   - `escrow/escrowService.ts` → `createEscrow` function encodes and submits escrow creation transactions, storing escrow details in the database.

5. **Airdrop Execution**:
   - `airdrop/revenueAirdrop.ts` → `runRevenueAirdrop` function calculates and distributes revenue to token holders, logging transaction signatures for traceability.

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
- **In-Memory and DB Fallback**: Many services use an in-memory cache with a database fallback for performance optimization. Be aware of potential inconsistencies between these layers, especially during high-load scenarios or failures.

- **Lazy Imports**: To avoid circular dependencies, some functions use lazy imports for blockchain adapters and configurations. This can obscure dependencies and should be documented clearly to avoid confusion.

- **Basis Points Configuration**: The `SplitConfig` uses basis points for percentage calculations. Ensure that all configurations sum to 10000 basis points to avoid errors in payout calculations.

- **Replay Protection**: The `SpentProofsStore` provides replay protection for payment proofs. Ensure that the correct implementation (Redis or in-memory) is used based on the environment to prevent double-spending.

- **Escrow Expiry Management**: The `claimTimeout` function checks escrow expiry before allowing refunds. Ensure that the system clock is synchronized to avoid premature or delayed refunds.

- **Error Handling**: Many functions log warnings instead of throwing errors for non-critical failures (e.g., database write failures). This can lead to silent failures if not monitored properly.