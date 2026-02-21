# TrustGate Provider Path Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

L2's `/v1/run/inference` endpoint always requires a compute passport to dispatch inference. This works for self-hosted models on GPU nodes but fails for API-based models (OpenAI, Anthropic, Google) because:

1. There are no real compute passports with `runtime: "llmproxy"` registered
2. The synthetic `LLM_PROXY_COMPUTE_META` points to `http://localhost:8001` (unreachable)
3. The compute health registry rejects the synthetic compute (no heartbeat)

The old `llm-proxy` system is deprecated. TrustGate is the production inference gateway.

## Solution

Add a **provider path** to `executeInferenceRequest()`. When a model passport has `format: "api"`, skip compute matching entirely and route directly to TrustGate.

## Architecture

```
Request arrives
  -> resolveModel()
       |
       +-- format: "api"  --> executeProviderRequest()
       |                        -> POST TRUSTGATE_URL/v1/chat/completions
       |                        -> TrustGate writes receipt_events
       |                        -> L2 receiptConsumer anchors on-chain
       |
       +-- format: "gguf"/"safetensors"  --> matchComputeForModel()
                                              -> compute passport matching
                                              -> dispatch to GPU node
                                              -> L2 creates receipt directly
```

## Changes by File

### executionGateway.ts

**Remove:**
- `MODEL_ALIASES` map and all alias-related functions (`isModelAlias`, `getModelAlias`, `registerModelAlias`, `listModelAliases`)
- `LLM_PROXY_COMPUTE_META` synthetic compute
- `is_proxy_model` flag and all references

**Add:**
- `TRUSTGATE_URL` from env (default: `https://trustgate-api-production.up.railway.app`)
- `TRUSTGATE_API_KEY` from env
- `executeProviderRequest()` function:
  - Builds OpenAI-compatible request body
  - Reads `model_meta.provider_model_id` for the `model` field
  - Falls back to lowercased `model_meta.name` if no `provider_model_id`
  - POSTs to `${TRUSTGATE_URL}/v1/chat/completions`
  - Uses `Authorization: Bearer ${TRUSTGATE_API_KEY}`
  - Sends `X-Lucid-Model-Passport: <model_passport_id>` header for receipt tracking
  - Parses OpenAI response, returns `ExecutionResult`
  - Does NOT create receipt (TrustGate handles via `receipt_events`)
- `executeProviderStreamingRequest()` for streaming support:
  - Same as above but returns `StreamingExecutionResult`
  - Proxies SSE chunks from TrustGate back to the caller

**Modify:**
- `executeInferenceRequest()`: After `resolveModel()`, if `model_meta.format === "api"`, call `executeProviderRequest()` instead of compute matching
- `executeStreamingInferenceRequest()`: Same branching for streaming
- `resolveModel()`: Remove alias resolution. Only passport manager lookup remains. Returns `is_provider_model: true` when `format === "api"`
- `getComputeCatalog()`: Remove llm-proxy injection

### computeClient.ts

**Remove:**
- `llmproxy` from `RuntimeType` union
- `toLLMProxyFormat()` function
- `parseLLMProxyResponse()` function
- `llmproxy` case in `executeInference()` switch
- `llmproxy` case in `executeStreamingInference()` switch (if present)

### Passport creation validation

**Where:** Passport creation/update route (likely in passport routes or passportManager)

**Add:** When `metadata.format === "api"`, require `metadata.provider_model_id` to be a non-empty string. Return 400 if missing.

### No changes to:
- `matchingEngine.ts` (only called for compute path)
- `policyEngine.ts` (unchanged)
- `receiptConsumer.ts` (already handles TrustGate receipts)
- `schemaValidator.ts` (`ModelMeta` schema already supports `format: "api"`)
- `lucidLayerRoutes.ts` (routes already delegate to gateway functions)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRUSTGATE_URL` | Yes | `https://trustgate-api-production.up.railway.app` | TrustGate base URL |
| `TRUSTGATE_API_KEY` | Yes | (none) | API key for L2-to-TrustGate auth |

Remove: `LLM_PROXY_URL` (no longer used)

## Receipt Handling

- **Provider path:** L2 does NOT create a receipt. TrustGate writes to `receipt_events` table. L2's `receiptConsumer` polls and creates on-chain receipt. No duplication.
- **Compute path:** Unchanged. L2 creates receipt directly via `createReceiptAsync()`.

## Model Resolution

`provider_model_id` in passport metadata maps to the exact model string TrustGate expects:

| Passport metadata | TrustGate model |
|---|---|
| `provider_model_id: "gpt-4o"` | `gpt-4o` |
| `provider_model_id: "gpt-4"` | `gpt-4` |
| `provider_model_id: "claude-3-sonnet-20240229"` | `claude-3-sonnet-20240229` |
| `provider_model_id: "gemini-pro"` | `gemini-pro` |

Fallback: if `provider_model_id` is missing (legacy passports), use lowercased `model_meta.name`.

## Validation

When creating or updating a model passport with `format: "api"`:
- `provider_model_id` must be a non-empty string
- Returns HTTP 400 if missing

No validation for `format: "gguf"/"safetensors"` — those use the compute path and don't need `provider_model_id`.

## Streaming Support

Provider path supports streaming by proxying TrustGate's SSE stream:
1. L2 sends `stream: true` to TrustGate
2. TrustGate returns SSE chunks in OpenAI format
3. L2 wraps chunks in `StreamChunk` and yields to caller
4. Route handler forwards to client

## Error Handling

| Error | Source | Action |
|---|---|---|
| Model passport not found | L2 | Return 404 |
| Model format is "api" but no `provider_model_id` | L2 | Return 400 at inference time (should be caught at creation) |
| TrustGate unreachable | Network | Return 502 with retry info |
| TrustGate returns error | TrustGate | Forward error to client with TrustGate status code |
| Invalid model string | TrustGate | Forward TrustGate's error (model not found) |
