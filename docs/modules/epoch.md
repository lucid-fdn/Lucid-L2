<!-- generated: commit d2cfd9e, 2026-03-18T17:00:11.962Z -->
<!-- WARNING: unverified identifiers: activeEpochs, anchoringService, epoch, epochIndexCounter, epochService, epochStore, mmrService, persistEpochReceiptToDb, persistEpochToDb -->
# Epoch

## Purpose
The `epoch` domain module is designed to manage the lifecycle of epochs within the Lucid L2 platform. An epoch is a batch of receipts that are anchored together on the blockchain, reducing on-chain costs by committing a single Merkle Mountain Range (MMR) root for multiple receipts. This module handles the creation, management, and finalization of epochs, ensuring that receipts are efficiently batched and anchored, thereby providing cryptographic proof of their existence at a specific time.

## Architecture
The module is structured around several key services: `epochService`, `anchoringService`, and `mmrService`. The `epochService` manages the lifecycle of epochs, including creation, finalization, and failure handling. The `anchoringService` is responsible for committing MMR roots to the Solana blockchain, providing the necessary cryptographic proof. The `mmrService` integrates MMR functionality, managing per-agent MMRs and their storage. Key design choices include using in-memory storage for active epochs, with a write-through, non-blocking persistence model to a PostgreSQL database, and leveraging Solana's Program Derived Addresses (PDAs) for secure on-chain operations.

## Data Flow
Data flows through the module as follows:
1. **Epoch Creation**: `services/epochService.ts` → `createEpoch` function initializes a new epoch, storing it in `epochStore` and `activeEpochs`.
2. **Receipt Addition**: `services/epochService.ts` → `addReceiptToEpoch` function adds receipts to the current epoch, updating the MMR root and persisting changes to the database.
3. **Epoch Finalization**: `services/epochService.ts` → `prepareEpochForFinalization` marks epochs as ready for anchoring, removing them from `activeEpochs`.
4. **Anchoring**: `services/anchoringService.ts` → `commitEpochRoot` commits the epoch's MMR root to the blockchain, updating the epoch's status and transaction details in `epochStore`.
5. **Database Persistence**: `services/epochService.ts` → `persistEpochToDb` and `persistEpochReceiptToDb` handle non-blocking persistence of epoch and receipt data to the PostgreSQL database.

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
- **In-Memory State**: The module relies heavily on in-memory state for active epochs, which can lead to inconsistencies in multi-instance deployments. The `epochIndexCounter` is synchronized with the database to prevent drift.
- **Advisory Locks**: `prepareEpochForFinalization` uses PostgreSQL advisory locks to prevent race conditions in multi-instance environments, but falls back to in-memory checks if the database is unavailable.
- **Mock Mode**: The anchoring service supports a mock mode for testing without real blockchain interactions, which can lead to unexpected behavior if not properly disabled in production.
- **Batch Processing Limits**: Functions like `buildCommitEpochsInstruction` enforce limits (e.g., maximum 16 roots per batch) that must be adhered to, or they will throw errors.
- **Configuration Changes**: Changing anchoring or epoch configurations resets certain states, such as the Solana connection, which can affect ongoing operations if not managed carefully.