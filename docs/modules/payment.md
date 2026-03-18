<!-- generated: commit 0dd79c5, 2026-03-18T16:39:15.124Z -->
# Payment

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

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
*AI enrichment pending.*