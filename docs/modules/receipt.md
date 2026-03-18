<!-- generated: commit 0dd79c5, 2026-03-18T16:39:03.027Z -->
# Receipt

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

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
*AI enrichment pending.*