<!-- generated: commit c7113a7, 2026-03-20T11:04:15.767Z -->
# receipt — Interface Reference

## Interfaces

### AgentReceipt
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `anchor` | `{ chain?: string; tx?: string; root?: string; epoch_id?: string; }` | yes |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"agent"` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `SignerType` | no |  |

**Extends:** `AgentReceiptBody`

### AgentReceiptBody
> `receiptService.ts`

Agent receipt body — the data that gets hashed.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `duration_ms` | `number` | no |  |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `run_id` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `steps_count` | `number` | no |  |
| `sub_receipt_ids` | `string[]` | no |  |
| `success` | `boolean` | no |  |
| `task_hash` | `string` | no |  |
| `timestamp` | `number` | no |  |
| `total_cost_usd` | `number` | yes |  |
| `total_tokens` | `number` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### AgentReceiptInput
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `duration_ms` | `number` | no |  |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `run_id` | `string` | yes |  |
| `steps_count` | `number` | no |  |
| `sub_receipt_ids` | `string[]` | no |  |
| `success` | `boolean` | no |  |
| `task_hash` | `string` | no |  |
| `total_cost_usd` | `number` | yes |  |
| `total_tokens` | `number` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### BatchedEpisodicReceiptBody
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `entry_count` | `number` | no |  |
| `entry_hashes` | `string[]` | no |  |
| `namespace` | `string` | no |  |
| `run_id` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `session_id` | `string` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### ComputeReceipt
> `receiptService.ts`

Extended Signed Receipt for Fluid Compute v0.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `anchor` | `{ chain?: "solana"; tx?: string; root?: string; epoch_id?: string; }` | yes |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"compute"` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `SignerType` | no |  |

**Extends:** `ComputeReceiptBody`

### ComputeReceiptBody
> `receiptService.ts`

Extended Receipt Body for Fluid Compute v0.2.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attestation` | `object` | yes |  |
| `billing` | `ReceiptBilling` | yes | Billing details for cost transparency |
| `capacity_bucket` | `string` | yes | Capacity bucket name (runpod_serverless mode) |
| `compute_passport_id` | `string` | no |  |
| `end_ts` | `number` | yes |  |
| `endpoint_id` | `string` | yes | RunPod endpoint ID (runpod_serverless mode) |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `execution_mode` | `ExecutionMode` | yes |  |
| `gpu_fingerprint` | `string` | yes |  |
| `image_hash` | `string` | yes |  |
| `input_ref` | `string` | yes |  |
| `job_hash` | `string` | yes |  |
| `metrics` | `ReceiptMetrics` | no |  |
| `model_hash` | `string` | yes |  |
| `model_passport_id` | `string` | no |  |
| `model_revision` | `string` | yes | Model revision (commit SHA or tag) for auditability |
| `node_id` | `string` | yes |  |
| `output_ref` | `string` | yes |  |
| `outputs_hash` | `string` | yes |  |
| `policy_hash` | `string` | no |  |
| `quote_hash` | `string` | yes |  |
| `run_id` | `string` | no |  |
| `runtime` | `string` | no |  |
| `runtime_hash` | `string` | yes |  |
| `schema_version` | `"1.0"` | no |  |
| `start_ts` | `number` | yes |  |
| `timestamp` | `number` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### ComputeReceiptInput
> `../shared/types/fluidCompute.ts`

Input for creating a receipt with extended fields.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attestation` | `Record<string, unknown>` | yes |  |
| `billing` | `ReceiptBilling` | yes | Billing details |
| `cache_hit` | `boolean` | yes |  |
| `capacity_bucket` | `string` | yes | Capacity bucket name |
| `cold_start_ms` | `number` | yes | Cold start time (runpod_serverless) |
| `compute_offer_passport_id` | `string` | yes | On-chain ComputeOfferPassport ID (Solana PDA) - optional, links to specific offer |
| `compute_passport_id` | `string` | no |  |
| `end_ts` | `number` | yes |  |
| `endpoint_id` | `string` | yes | RunPod endpoint ID |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `execution_mode` | `ExecutionMode` | yes |  |
| `gpu_fingerprint` | `string` | yes |  |
| `image_hash` | `string` | yes |  |
| `input_ref` | `string` | yes |  |
| `job_hash` | `string` | yes |  |
| `model_hash` | `string` | yes |  |
| `model_load_ms` | `number` | yes |  |
| `model_passport_id` | `string` | no |  |
| `model_revision` | `string` | yes | Model revision (commit SHA or tag) for auditability |
| `node_id` | `string` | yes |  |
| `output_ref` | `string` | yes |  |
| `outputs_hash` | `string` | yes |  |
| `p95_ms` | `number` | yes |  |
| `policy_hash` | `string` | no |  |
| `queue_time_ms` | `number` | yes | Time spent in queue (runpod_serverless) |
| `queue_wait_ms` | `number` | yes |  |
| `quote_hash` | `string` | yes |  |
| `run_id` | `string` | yes |  |
| `runtime` | `string` | no |  |
| `runtime_hash` | `string` | yes |  |
| `start_ts` | `number` | yes |  |
| `tokens_in` | `number` | no |  |
| `tokens_out` | `number` | no |  |
| `total_latency_ms` | `number` | yes |  |
| `trace_id` | `string` | yes |  |
| `ttft_ms` | `number` | no |  |

**Extends:** —

### DatasetReceipt
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `anchor` | `{ chain?: string; tx?: string; root?: string; epoch_id?: string; }` | yes |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"dataset"` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `SignerType` | no |  |

**Extends:** `DatasetReceiptBody`

### DatasetReceiptBody
> `receiptService.ts`

Dataset receipt body — the data that gets hashed.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `access_type` | `"download" | "query" | "stream"` | no |  |
| `bytes_transferred` | `number` | no |  |
| `consumer_passport_id` | `string` | yes |  |
| `data_hash` | `string` | no |  |
| `dataset_passport_id` | `string` | no |  |
| `query_hash` | `string` | yes |  |
| `rows_returned` | `number` | yes |  |
| `run_id` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `timestamp` | `number` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### DatasetReceiptInput
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `access_type` | `"download" | "query" | "stream"` | no |  |
| `bytes_transferred` | `number` | no |  |
| `consumer_passport_id` | `string` | yes |  |
| `data_hash` | `string` | no |  |
| `dataset_passport_id` | `string` | no |  |
| `query_hash` | `string` | yes |  |
| `rows_returned` | `number` | yes |  |
| `run_id` | `string` | yes |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### InferenceReceipt
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `anchor` | `{ chain?: "solana"; tx?: string; root?: string; epoch_id?: string; }` | yes |  |
| `attestation` | `object` | yes |  |
| `compute_passport_id` | `string` | no |  |
| `image_hash` | `string` | yes |  |
| `metrics` | `{ ttft_ms: number; p95_ms?: number; tokens_in: number; tokens_out: number; }` | no |  |
| `model_hash` | `string` | yes |  |
| `model_passport_id` | `string` | no |  |
| `policy_hash` | `string` | no |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"inference"` | no |  |
| `run_id` | `string` | no |  |
| `runtime` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `"orchestrator" | "compute"` | no |  |
| `timestamp` | `number` | no |  |
| `trace_id` | `string` | yes |  |
| `zkml_proof` | `{ proof: string; public_inputs: string[]; model_circuit_hash: string; verified_onchain?: boolean; verification_tx?: string; }` | yes |  |

**Extends:** —

### InferenceReceiptBody
> `receiptService.ts`

Receipt body - the data that gets hashed for receipt_hash.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attestation` | `object` | yes |  |
| `compute_passport_id` | `string` | no |  |
| `image_hash` | `string` | yes |  |
| `metrics` | `{ ttft_ms: number; p95_ms?: number; tokens_in: number; tokens_out: number; }` | no |  |
| `model_hash` | `string` | yes |  |
| `model_passport_id` | `string` | no |  |
| `policy_hash` | `string` | no |  |
| `run_id` | `string` | no |  |
| `runtime` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `timestamp` | `number` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### InferenceReceiptInput
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attestation` | `object` | yes |  |
| `compute_passport_id` | `string` | no |  |
| `image_hash` | `string` | yes |  |
| `model_hash` | `string` | yes |  |
| `model_passport_id` | `string` | no |  |
| `p95_ms` | `number` | yes |  |
| `policy_hash` | `string` | no |  |
| `run_id` | `string` | yes |  |
| `runtime` | `string` | no |  |
| `tokens_in` | `number` | no |  |
| `tokens_out` | `number` | no |  |
| `trace_id` | `string` | yes |  |
| `ttft_ms` | `number` | no |  |

**Extends:** —

### MemoryReceipt
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `body` | `MemoryReceiptBody | BatchedEpisodicReceiptBody` | no |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"memory"` | no |  |
| `run_id` | `string` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `SignerType` | no |  |

**Extends:** —

### MemoryReceiptBody
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `content_hash` | `string` | no |  |
| `memory_id` | `string` | no |  |
| `memory_type` | `string` | no |  |
| `namespace` | `string` | no |  |
| `prev_hash` | `string` | no |  |
| `run_id` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### ReceiptCreateOptions
> `receiptService.ts`

Options for the unified createReceipt function

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `idempotencyKey` | `string` | yes |  |
| `signerType` | `SignerType` | yes |  |
| `skipValidation` | `boolean` | yes |  |

**Extends:** —

### ReceiptVerifyResult
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `computed_hash` | `string` | yes |  |
| `expected_hash` | `string` | yes |  |
| `hash_valid` | `boolean` | no |  |
| `inclusion_valid` | `boolean` | yes |  |
| `merkle_root` | `string` | yes |  |
| `signature_valid` | `boolean` | no |  |

**Extends:** —

### SerializedMMRProof
> `../shared/crypto/receiptMMR.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `leafHash` | `string` | no |  |
| `leafIndex` | `number` | no |  |
| `mmrSize` | `number` | no |  |
| `peaks` | `string[]` | no |  |
| `root` | `string` | no |  |
| `siblings` | `string[]` | no |  |

**Extends:** —

### ToolReceipt
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `_mmr_leaf_index` | `number` | yes |  |
| `anchor` | `{ chain?: string; tx?: string; root?: string; epoch_id?: string; }` | yes |  |
| `receipt_hash` | `string` | no |  |
| `receipt_signature` | `string` | no |  |
| `receipt_type` | `"tool"` | no |  |
| `signer_pubkey` | `string` | no |  |
| `signer_type` | `SignerType` | no |  |

**Extends:** `ToolReceiptBody`

### ToolReceiptBody
> `receiptService.ts`

Tool receipt body — the data that gets hashed.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | yes |  |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `input_hash` | `string` | no |  |
| `latency_ms` | `number` | no |  |
| `output_hash` | `string` | no |  |
| `run_id` | `string` | no |  |
| `schema_version` | `"1.0"` | no |  |
| `success` | `boolean` | no |  |
| `timestamp` | `number` | no |  |
| `tool_passport_id` | `string` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

### ToolReceiptInput
> `receiptService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | yes |  |
| `error_code` | `string` | yes |  |
| `error_message` | `string` | yes |  |
| `input_hash` | `string` | no |  |
| `latency_ms` | `number` | no |  |
| `output_hash` | `string` | no |  |
| `run_id` | `string` | yes |  |
| `success` | `boolean` | no |  |
| `tool_passport_id` | `string` | no |  |
| `trace_id` | `string` | yes |  |

**Extends:** —

## Functions

### assertValidComputeReceiptInput
> `receiptService.ts`

Validate an extended receipt input and throw if invalid.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `ComputeReceiptInput` | no | — |

**Returns:** `void`

**Async:** no

### computeInputHash
> `receiptService.ts`

Compute the input hash for a job.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `object` | no | — |

**Returns:** `string`

**Async:** no

### computeJobHash
> `receiptService.ts`

Compute a job hash for binding job to quote.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `job_id` | `string` | no | — |
| `model_id` | `string` | no | — |
| `offer_id` | `string` | no | — |
| `quote_hash` | `string` | no | — |
| `input` | `object` | no | — |

**Returns:** `string`

**Async:** no

### computeOutputsHash
> `receiptService.ts`

Compute the outputs hash for verification.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `output` | `object` | no | — |

**Returns:** `string`

**Async:** no

### computeQuoteHash
> `receiptService.ts`

Compute a quote hash for replay protection.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `quote` | `Omit<OfferQuote, "quote_hash" | "quote_signature">` | no | — |

**Returns:** `string`

**Async:** no

### createAgentReceipt
> `receiptService.ts`

Create an agent receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `AgentReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | `{}` |

**Returns:** `AgentReceipt`

**Async:** no

### createBatchedEpisodicReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `{ agent_passport_id: string; session_id: string; entry_hashes: string[]; namespace: string; run_id?: string; }` | no | — |

**Returns:** `MemoryReceipt`

**Async:** no

### createComputeReceipt
> `receiptService.ts`

Create an extended receipt for Fluid Compute v0.2.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `ComputeReceiptInput` | no | — |
| `signerType` | `SignerType` | yes | `'orchestrator'` |
| `idempotencyKey` | `string` | yes | — |
| `skipValidation` | `boolean` | yes | `false` |

**Returns:** `ComputeReceipt`

**Async:** no

### createComputeReceiptFromJob
> `receiptService.ts`

Create receipt from a completed job result.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `job` | `JobRequest` | no | — |
| `result` | `{ output?: object; output_ref?: string; metrics: { ttft_ms: number; tokens_in: number; tokens_out: number; p95_ms?: number; total_latency_ms?: number; queue_wait_ms?: number; model_load_ms?: number; cache_hit?: boolean; }; error_code?: string; error_message?: string; start_ts: number; end_ts: number; }` | no | — |
| `workerId` | `string` | no | — |
| `executionMode` | `ExecutionMode` | no | — |
| `runtimeHash` | `string` | no | — |
| `gpuFingerprint` | `string` | no | — |

**Returns:** `ComputeReceipt`

**Async:** no

### createDatasetReceipt
> `receiptService.ts`

Create a dataset receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `DatasetReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | `{}` |

**Returns:** `DatasetReceipt`

**Async:** no

### createInferenceReceipt
> `receiptService.ts`

Create a new run receipt with real signing.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `InferenceReceiptInput` | no | — |
| `idempotencyKey` | `string` | yes | — |

**Returns:** `InferenceReceipt`

**Async:** no

### createMemoryReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `{ agent_passport_id: string; memory_id: string; memory_type: string; content_hash: string; prev_hash: string | null; namespace: string; run_id?: string; }` | no | — |

**Returns:** `MemoryReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

Create a receipt of any type — single entry point.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"inference"` | no | — |
| `input` | `InferenceReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | — |

**Returns:** `InferenceReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"compute"` | no | — |
| `input` | `ComputeReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | — |

**Returns:** `ComputeReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"tool"` | no | — |
| `input` | `ToolReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | — |

**Returns:** `ToolReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"agent"` | no | — |
| `input` | `AgentReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | — |

**Returns:** `AgentReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"dataset"` | no | — |
| `input` | `DatasetReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | — |

**Returns:** `DatasetReceipt`

**Async:** no

### createReceipt
> `receiptService.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `ReceiptType` | no | — |
| `input` | `InferenceReceiptInput | ComputeReceiptInput | ToolReceiptInput | AgentReceiptInput | DatasetReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | `{}` |

**Returns:** `Receipt`

**Async:** no

### createToolReceipt
> `receiptService.ts`

Create a tool receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `ToolReceiptInput` | no | — |
| `opts` | `ReceiptCreateOptions` | yes | `{}` |

**Returns:** `ToolReceipt`

**Async:** no

### getComputeReceipt
> `receiptService.ts`

Get an extended receipt by run_id.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `ComputeReceipt`

**Async:** no

### getInferenceReceipt
> `receiptService.ts`

Get a receipt by run_id.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `InferenceReceipt`

**Async:** no

### getInferenceReceiptAsync
> `receiptService.ts`

Get a receipt by run_id with DB fallback (async).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `Promise<InferenceReceipt>`

**Async:** yes

### getInferenceReceiptProof
> `receiptService.ts`

Get inclusion proof for a receipt (sync, in-memory only).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `SerializedMMRProof`

**Async:** no

### getInferenceReceiptProofAsync
> `receiptService.ts`

Get inclusion proof with DB fallback (for post-restart scenarios).

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `Promise<SerializedMMRProof>`

**Async:** yes

### getMmrLeafCount
> `receiptService.ts`

Get the number of receipts in the MMR.

**Returns:** `number`

**Async:** no

### getMmrRoot
> `receiptService.ts`

Get the current MMR root.

**Returns:** `string`

**Async:** no

### getReceipt
> `receiptService.ts`

Get any receipt by run_id.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `Receipt`

**Async:** no

### getReceiptMMR
> `../shared/crypto/receiptMMR.ts`

Get the global receipt MMR singleton. If not yet initialized, creates a fresh one.

**Returns:** `ReceiptMMR`

**Async:** no

### getReceiptProof
> `receiptService.ts`

Get inclusion proof for any receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `SerializedMMRProof`

**Async:** no

### getSignerPublicKey
> `receiptService.ts`

Get the orchestrator's public key for external verification.

**Returns:** `string`

**Async:** no

### initReceiptMMR
> `../shared/crypto/receiptMMR.ts`

Initialize the receipt MMR from DB (call at startup).

**Returns:** `Promise<ReceiptMMR>`

**Async:** yes

### listComputeReceipts
> `receiptService.ts`

List all extended receipts (for admin/debugging).

**Returns:** `ComputeReceipt[]`

**Async:** no

### listInferenceReceipts
> `receiptService.ts`

List all receipts (for admin/debugging).

**Returns:** `InferenceReceipt[]`

**Async:** no

### listReceipts
> `receiptService.ts`

List receipts, optionally filtered by type.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `ReceiptType` | yes | — |

**Returns:** `Receipt[]`

**Async:** no

### resetReceiptMMR
> `../shared/crypto/receiptMMR.ts`

Reset singleton (for testing).

**Returns:** `void`

**Async:** no

### validateComputeReceiptInput
> `receiptService.ts`

Validate an extended receipt input against Fluid Compute v0 requirements.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `ComputeReceiptInput` | no | — |
| `strict` | `boolean` | yes | `false` |

**Returns:** `ReceiptValidationResult`

**Async:** no

### verifyComputeReceipt
> `receiptService.ts`

Verify an extended receipt's hash and signature.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `ReceiptVerifyResult`

**Async:** no

### verifyInferenceReceipt
> `receiptService.ts`

Full receipt verification: hash + signature + inclusion.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `ReceiptVerifyResult`

**Async:** no

### verifyInferenceReceiptHash
> `receiptService.ts`

Verify a receipt's hash integrity.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `ReceiptVerifyResult`

**Async:** no

### verifyJobHash
> `receiptService.ts`

Verify a job hash matches the job request.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `job` | `JobRequest` | no | — |

**Returns:** `boolean`

**Async:** no

### verifyQuoteHash
> `receiptService.ts`

Verify a quote hash matches the quote body.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `quote` | `OfferQuote` | no | — |

**Returns:** `boolean`

**Async:** no

### verifyReceipt
> `receiptService.ts`

Verify any receipt's hash, signature, and inclusion proof.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `run_id` | `string` | no | — |

**Returns:** `ReceiptVerifyResult`

**Async:** no

### verifyReceiptProof
> `receiptService.ts`

Verify an inclusion proof against the current or specific root.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `proof` | `SerializedMMRProof` | no | — |
| `expectedRoot` | `string` | yes | — |

**Returns:** `boolean`

**Async:** no

## Types

### Receipt
> `receiptService.ts`

Discriminated union of all receipt types

```ts
type Receipt = InferenceReceipt | ComputeReceipt | ToolReceipt | AgentReceipt | DatasetReceipt | MemoryReceipt
```

### ReceiptType
> `receiptService.ts`

All supported receipt types in the Lucid execution layer

```ts
type ReceiptType = "compute" | "inference" | "tool" | "agent" | "dataset" | "memory"
```
