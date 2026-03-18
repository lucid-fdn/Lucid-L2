<!-- generated: commit d2cfd9e, 2026-03-18T16:59:42.954Z -->
<!-- WARNING: unverified identifiers: BoundedMap, createReceiptGeneric, idempotencyStore, persistReceiptToDb, receipt, receiptStore -->
# Receipt

## Purpose
The `receipt` module in the Lucid L2 platform is designed to manage the creation, storage, and verification of various types of receipts related to computational tasks. These receipts serve as verifiable records of task execution, ensuring integrity, authenticity, and traceability. The module supports multiple receipt types, including inference, compute, tool, agent, dataset, and memory receipts, each tailored to specific use cases within the platform. By providing a unified interface for receipt management, the module addresses the need for consistent and secure tracking of computational activities.

## Architecture
The module is structured around a central service (`receiptService.ts`) that handles the core functionalities of receipt creation, storage, and verification. Key design choices include:

- **Receipt Types**: The module supports a variety of receipt types, each with its own interface and creation function. This allows for flexibility in handling different computational scenarios.
- **Hashing and Signing**: Receipts are secured using SHA256 hashing and ed25519 signing, ensuring data integrity and authenticity.
- **Merkle Tree Integration**: A Merkle tree is used for inclusion proofs, enhancing the verifiability of receipts.
- **Unified Receipt Functions**: The module provides a single entry point for creating and managing receipts, simplifying the interface for developers.

## Data Flow
1. **Receipt Creation**: 
   - File: `receiptService.ts` → Function: `createReceipt` → Store: `receiptStore`
   - The `createReceipt` function serves as the entry point for creating any type of receipt. It delegates to specific creation functions based on the receipt type, such as `createInferenceReceipt` or `createComputeReceipt`.

2. **Receipt Storage**:
   - File: `receiptService.ts` → Function: `createReceiptGeneric` → Store: `receiptStore`
   - Receipts are stored in an in-memory `BoundedMap` called `receiptStore`, which supports LRU eviction to manage memory usage.

3. **Receipt Verification**:
   - File: `receiptService.ts` → Function: `verifyReceipt` → Store: `receiptStore`
   - The `verifyReceipt` function retrieves a receipt from `receiptStore`, recomputes its hash, and verifies its signature and Merkle tree inclusion.

4. **Database Persistence**:
   - File: `receiptService.ts` → Function: `persistReceiptToDb`
   - Receipts are asynchronously persisted to a database for durability, with a fallback mechanism to load receipts from the database if not found in memory.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `AgentReceipt` | `receiptService.ts` | — |
| `AgentReceiptBody` | `receiptService.ts` | Agent receipt body — the data that gets hashed. |
| `AgentReceiptInput` | `receiptService.ts` | — |
| `BatchedEpisodicReceiptBody` | `receiptService.ts` | — |
| `ComputeReceipt` | `receiptService.ts` | Extended Signed Receipt for Fluid Compute v0. |
| `ComputeReceiptBody` | `receiptService.ts` | Extended Receipt Body for Fluid Compute v0.2. |
| `ComputeReceiptInput` | `../shared/types/fluidCompute.ts` | Input for creating a receipt with extended fields. |
| `DatasetReceipt` | `receiptService.ts` | — |
| `DatasetReceiptBody` | `receiptService.ts` | Dataset receipt body — the data that gets hashed. |
| `DatasetReceiptInput` | `receiptService.ts` | — |
| `InferenceReceipt` | `receiptService.ts` | — |
| `InferenceReceiptBody` | `receiptService.ts` | Receipt body - the data that gets hashed for receipt_hash. |
| `InferenceReceiptInput` | `receiptService.ts` | — |
| `MemoryReceipt` | `receiptService.ts` | — |
| `MemoryReceiptBody` | `receiptService.ts` | — |
| `ReceiptCreateOptions` | `receiptService.ts` | Options for the unified createReceipt function |
| `ReceiptVerifyResult` | `receiptService.ts` | — |
| `SerializedMMRProof` | `../shared/crypto/receiptMMR.ts` | — |
| `ToolReceipt` | `receiptService.ts` | — |
| `ToolReceiptBody` | `receiptService.ts` | Tool receipt body — the data that gets hashed. |
| `ToolReceiptInput` | `receiptService.ts` | — |

### Key Types

| Type | File | Kind | Description |
|------|------|------|-------------|
| `Receipt` | `receiptService.ts` | alias | Discriminated union of all receipt types |
| `ReceiptType` | `receiptService.ts` | alias | All supported receipt types in the Lucid execution layer |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | `ComputeReceiptInput`, `ExecutionMode`, `JobRequest`, `OfferQuote`, `ReceiptBilling`, `ReceiptMMR`, `ReceiptMetrics`, `SerializedMMRProof`, `SignerType`, `canonicalSha256Hex`, `getOrchestratorPublicKey`, `getReceiptMMR`, `logger`, `pool`, `signMessage`, `validateWithSchema`, `verifySignature` | — |
| exports to | epoch | `InferenceReceipt`, `getInferenceReceipt`, `getMmrLeafCount`, `getMmrRoot`, `listInferenceReceipts` | — |

## Patterns & Gotchas
- **Idempotency Handling**: The module uses an `idempotencyStore` to ensure that receipt creation is idempotent. Developers must be cautious about race conditions when using idempotency keys.
- **Optional Fields**: Receipt bodies include optional fields that must be handled carefully to ensure deterministic hashing. Changes to these fields can break existing receipts.
- **Validation Gates**: The `validateComputeReceiptInput` function enforces strict validation rules for compute receipts. Developers should be aware of these rules to avoid validation errors.
- **Merkle Tree Management**: The Merkle tree is crucial for receipt verification. Developers must ensure that receipts are correctly added to the tree and that proofs are accurately generated and verified.
- **Environment-Specific Features**: Some features, like zkML proof attachment, are environment-dependent and may not be available in all deployments. Developers should account for these variations.