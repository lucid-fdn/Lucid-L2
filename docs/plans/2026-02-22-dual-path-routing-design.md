# Dual-Path Routing Design: Model Identity vs Access Routing

**Date:** 2026-02-22
**Status:** Approved

## Problem

The previous TrustGate provider path design (2026-02-21) baked routing into model identity via `provider_model_id`. This creates three issues:

1. **One passport per provider** — If GPT-4o is available through OpenAI and Azure, you'd need two passports for the same model. A passport should represent the model itself, not how to access it.
2. **No dual-path** — Downloadable models (Llama-3-70B) that are ALSO available via TrustGate can't use both paths from one passport.
3. **Wrong naming** — `provider_model_id` implies one provider's ID, but TrustGate is a gateway that routes to any provider.

## Key Insight

TrustGate already handles multi-provider routing (cheapest, fastest, failover between OpenAI/Azure/etc). L2 should NOT duplicate this. L2 only needs to know:

- Is this model accessible via API? → Send to TrustGate
- Is this model downloadable? → Compute matching → GPU node
- Is it both? → Try compute first, TrustGate as fallback

## Solution

1. **Rename** `provider_model_id` → `api_model_id` (the model string TrustGate uses)
2. **Decouple** routing from format — `api_model_id` enables TrustGate path on ANY model
3. **Dual-path** — downloadable models can also route via TrustGate if `api_model_id` is set
4. **Validate** against TrustGate catalog at passport creation
5. **Fix SDK** types

## Architecture

```
Model Passport (identity)
  ├── format: "api"           → TrustGate only (closed-source: GPT-4o, Claude)
  ├── format: "safetensors"   → Compute path (downloadable)
  │     └── + api_model_id?   → Also TrustGate (dual-path: Llama-3-70B)
  └── format: "gguf"          → Compute path (quantized, downloadable)
        └── + api_model_id?   → Also TrustGate (dual-path)
```

### Routing Decision at Inference Time

```
hasApiPath  = api_model_id is set  OR  format === "api"
hasComputePath = format === "safetensors" OR format === "gguf"

if (hasComputePath AND hasApiPath):
    try compute matching → execute on GPU
    if no compute or compute fails → executeProviderRequest() via TrustGate
elif (hasApiPath):
    executeProviderRequest() via TrustGate
elif (hasComputePath):
    compute matching → execute on GPU
else:
    error
```

### Examples

| Model | format | api_model_id | Available Paths |
|-------|--------|-------------|-----------------|
| GPT-4o | `"api"` | `"gpt-4o"` | TrustGate only |
| Claude 3 Sonnet | `"api"` | `"claude-3-sonnet-20240229"` | TrustGate only |
| Llama-3-70B (GPU only) | `"safetensors"` | (none) | Compute only |
| Llama-3-70B (hybrid) | `"safetensors"` | `"meta-llama/llama-3-70b"` | Compute + TrustGate fallback |
| Mistral-7B-GGUF | `"gguf"` | `"mistralai/mistral-7b"` | Compute + TrustGate fallback |

## Changes by File

### schemas/ModelMeta.schema.json

- **Rename** `provider_model_id` → `api_model_id`
- Description: "The model identifier string for TrustGate API routing (e.g., gpt-4o, meta-llama/llama-3-70b). If set, the model can be accessed via TrustGate regardless of format."
- Stays optional (not required even for format: "api" — falls back to lowercased name)

### offchain/src/services/executionGateway.ts

- **Rename** all `provider_model_id` → `api_model_id` references
- **Change routing logic** from `format === 'api'` check to dual-path:
  ```typescript
  const hasApiPath = model_meta.api_model_id || model_meta.format === 'api';
  const hasComputePath = model_meta.format === 'safetensors' || model_meta.format === 'gguf';
  ```
- **Add compute-first fallback**: When both paths available, try compute first, fall back to TrustGate
- **Add transition shim**: Read both `api_model_id` and `provider_model_id` during migration
- **executeProviderRequest()**: Read `api_model_id` instead of `provider_model_id`

### offchain/src/services/passportManager.ts

- **Rename** validation field from `provider_model_id` → `api_model_id`
- **Change** validation for `format: "api"`: Instead of hard-requiring `api_model_id`, validate against TrustGate catalog
- **Add** TrustGate catalog check: `GET ${TRUSTGATE_URL}/v1/models`
- **Add** suggestion for downloadable models: If TrustGate has the model, inform the user
- **Cache** TrustGate model list for 5 minutes

### offchain/src/services/passportManager.ts — Validation Flow

```
format === "api":
  - api_model_id optional (derive from name if missing)
  - Call TrustGate /v1/models to verify model exists
  - Reject if not found: "Model 'xxx' not found in TrustGate catalog"
  - If TrustGate unreachable: allow creation with warning

format === "safetensors" or "gguf":
  - api_model_id optional
  - If api_model_id provided: validate against TrustGate
  - If not provided: check TrustGate catalog, suggest if available
  - Never block creation for downloadable models
```

### packages/sdk-js/src/types/index.ts

- **Add** `api_model_id?: string` to `ModelMeta` interface
- **Type** `format` as `'safetensors' | 'gguf' | 'api'` (was `string`)

### offchain/src/__tests__/executionGateway.test.ts

- **Rename** all `provider_model_id` → `api_model_id` in test fixtures
- **Add** dual-path tests: model with both format=safetensors + api_model_id
- **Add** compute-first-then-TrustGate-fallback test

### offchain/src/__tests__/passportService.test.ts

- **Rename** `provider_model_id` → `api_model_id` in validation tests
- **Add** TrustGate catalog validation tests

## Backward Compatibility

| Scenario | Impact | Migration |
|----------|--------|-----------|
| Existing passports with `provider_model_id` | Gateway reads both fields during transition | Rename in DB |
| Existing `format: "api"` without `api_model_id` | Fallback to lowercased name | No action |
| Existing `runtime_recommended: "llmproxy"` | Already broken; change to `"trustgate"` | One-time migration |
| SDK consumers using `[key: string]: any` | No breakage | Update types for DX |
| Compute path passports | Zero impact | None |

### Transition Shim (temporary)

```typescript
const apiModelId = model_meta.api_model_id
  || model_meta.provider_model_id  // ← backward compat, remove after migration
  || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');
```

## What Does NOT Change

- `matchingEngine.ts` — only handles compute path, unchanged
- `policyEngine.ts` — unchanged
- `receiptConsumer.ts` — unchanged
- `computeClient.ts` — unchanged (llmproxy already removed)
- `receiptConsumer.ts` — already handles TrustGate receipts
- Compute path behavior — identical to before
- TrustGate itself — no changes needed

## Environment Variables

Same as before:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRUSTGATE_URL` | Yes | `https://trustgate-api-production.up.railway.app` | TrustGate base URL |
| `TRUSTGATE_API_KEY` | Yes | (none) | API key for L2-to-TrustGate auth |
