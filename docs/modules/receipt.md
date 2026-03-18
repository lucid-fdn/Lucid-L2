<!-- generated: commit 8a415ae, 2026-03-18T17:33:53.844Z -->
<!-- WARNING: unverified identifiers: BoundedMap, idempotencyStore, persistReceiptToDb, receipt, receiptStore -->
# Receipt

## Purpose
The `receipt` module in the Lucid L2 platform is designed to handle the creation, storage, and verification of various types of receipts related to computational tasks and data access events. It ensures that each receipt is cryptographically signed, hashed, and stored in a verifiable manner, providing a reliable audit trail for operations such as inference, compute tasks, tool invocations, agent executions, dataset accesses, and memory writes. This module addresses the need for secure, traceable, and verifiable records of computational activities, which are crucial for accountability, billing, and compliance in distributed systems.

## Architecture
The module is structured around a set of interfaces and functions defined primarily in `receiptService.ts`. Key design choices include:

- **Unified Receipt Model**: A type alias `Receipt` encompasses all receipt types, allowing for a unified handling approach.
- **Receipt Creation Functions**: Functions like `createInferenceReceipt`, `createComputeReceipt`, and `createToolReceipt` are responsible for generating receipts, each tailored to specific receipt types with their own validation and signing processes.
- **Merkle Mountain Range (MMR)**: Receipts are added to an MMR for inclusion proofs, enhancing the verifiability of the receipts.
- **Hash and Signature Verification**: Functions such as `verifyReceipt` ensure the integrity and authenticity of receipts by checking hashes and signatures.
- **In-Memory and Database Storage**: Receipts are initially stored in a bounded in-memory cache (`BoundedMap`) and are asynchronously persisted to a database for durability.

## Data Flow
1. **Receipt Creation**: When a receipt is created (e.g., `createInferenceReceipt` in `receiptService.ts`), the input data is validated, a hash is computed, and the receipt is signed.
2. **Storage**: The signed receipt is stored in an in-memory cache (`receiptStore` in `receiptService.ts`) and optionally associated with an idempotency key in `idempotencyStore`.
3. **Persistence**: The receipt is asynchronously persisted to the database via `persistReceiptToDb` in `receiptService.ts`.
4. **Verification**: Verification functions (e.g., `verifyInferenceReceipt`) recompute hashes and verify signatures using the stored receipt data.
5. **MMR Inclusion**: Receipts are added to the MMR using `getReceiptMMR` and can be verified for inclusion using `getReceiptProof`.

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
- **Idempotency Handling**: The use of `idempotencyStore` ensures that duplicate receipt creation requests with the same idempotency key return the same receipt, preventing unnecessary duplications.
- **Canonical JSON Serialization**: The module uses JSON Canonicalization Scheme (JCS) for deterministic hashing, which is crucial for ensuring consistent hash values across different environments.
- **Non-blocking Persistence**: Database persistence is non-blocking, meaning that failures in persisting receipts do not affect the immediate availability of receipts in memory, but care must be taken to handle potential inconsistencies.
- **MMR Initialization**: The MMR must be initialized at startup using `initReceiptMMR` to ensure that inclusion proofs can be generated and verified.
- **Optional Fields**: Many receipt fields are optional and only included in hashes if present, which can lead to subtle bugs if not handled consistently across different parts of the codebase.