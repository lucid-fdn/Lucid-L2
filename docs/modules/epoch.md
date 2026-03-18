<!-- generated: commit 8a415ae, 2026-03-18T17:34:39.769Z -->
<!-- WARNING: unverified identifiers: activeEpochs, anchoringService, connection, epoch, epochService, epochStore, mmrService, persistEpochToDb, receiptToEpoch -->
# Epoch

## Purpose
The `epoch` module in the Lucid L2 platform is designed to manage the lifecycle of epochs, which are batches of receipts that are anchored together on the blockchain. This approach reduces on-chain costs by committing a single Merkle Mountain Range (MMR) root for multiple receipts, providing cryptographic proof of their existence at a specific time. The module handles the creation, management, and finalization of epochs, ensuring efficient and cost-effective anchoring of data.

## Architecture
The module is structured around several key services: `epochService`, `anchoringService`, and `mmrService`. The `epochService` manages the lifecycle of epochs, including creation, tracking, and finalization. The `anchoringService` handles the interaction with the Solana blockchain, committing MMR roots and verifying anchors. The `mmrService` integrates MMR functionality, managing per-agent MMRs and facilitating on-chain commitments. Key design choices include the use of in-memory storage for active epochs, non-blocking database persistence, and a distributed advisory lock mechanism to prevent race conditions in multi-instance deployments.

## Data Flow
Data flows through the module as follows:
1. **Epoch Creation**: `services/epochService.ts` → `createEpoch` → `epochStore` and `activeEpochs`.
2. **Receipt Addition**: `services/epochService.ts` → `addReceiptToEpoch` → `receiptToEpoch` and updates to `epochStore`.
3. **Epoch Finalization**: `services/epochService.ts` → `prepareEpochForFinalization` → `persistEpochToDb` (blocking) → `finalizeEpoch`.
4. **Anchoring**: `services/anchoringService.ts` → `commitEpochRoot` or `commitEpochRootsBatch` → `finalizeEpoch` and updates to `epochStore`.
5. **Verification**: `services/anchoringService.ts` → `verifyEpochAnchor` → uses blockchain adapter factory for multi-chain verification.

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
- **In-Memory vs. Database State**: The module uses in-memory storage for active epochs, which can lead to discrepancies if not synchronized with the database. Ensure that `persistEpochToDb` is called appropriately to maintain consistency.
- **Advisory Locks**: The use of PostgreSQL advisory locks in `prepareEpochForFinalization` is crucial for preventing race conditions in multi-instance environments. If the database is unavailable, the module falls back to in-memory checks, which are only safe for single-instance deployments.
- **Mock Mode**: The `anchoringService` supports a mock mode for testing without real blockchain interactions. This mode can be enabled or disabled via `enableMockMode` and `disableMockMode`, and it affects how anchoring operations are performed.
- **Batch Processing Limits**: The `commitEpochRootsBatch` function enforces a maximum of 16 epochs per batch. Exceeding this limit will result in an error, so ensure batch sizes are managed correctly.
- **Configuration Changes**: Changing the anchoring configuration resets the Solana connection. This is handled by setting `connection` to null in `setAnchoringConfig`, ensuring a new connection is established with the updated settings.