<!-- generated: commit 0dd79c5, 2026-03-18T16:39:09.012Z -->
# Epoch

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AgentEpochData` | `services/mmrService.ts` | — |
| `AnchoringConfig` | `services/anchoringService.ts` | — |
| `AnchoringHealth` | `services/anchoringService.ts` | — |
| `AnchorResult` | `services/anchoringService.ts` | — |
| `Epoch` | `services/epochService.ts` | — |
| `EpochConfig` | `services/epochService.ts` | — |
| `EpochFilters` | `services/epochService.ts` | — |
| `EpochSummary` | `services/epochService.ts` | — |
| `MMRCommitResult` | `services/mmrService.ts` | MMR Service for Lucid L2 |
| `PaginatedEpochs` | `services/epochService.ts` | — |
| `VerifyAnchorResult` | `services/anchoringService.ts` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | chain | `calculateGasCost`, `getKeypair`, `initSolana` | — |
| imports | receipt | `InferenceReceipt`, `getInferenceReceipt`, `getMmrLeafCount`, `getMmrRoot`, `listInferenceReceipts` | — |
| imports | shared | `AgentMMR`, `AgentMMRRegistry`, `logger`, `pool` | — |

## Patterns & Gotchas
*AI enrichment pending.*