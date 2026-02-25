# Dual-Path Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple model identity from access routing — rename `provider_model_id` to `api_model_id`, enable dual-path inference (compute + TrustGate) from a single passport, fix SDK types, and validate API models against TrustGate catalog.

**Architecture:** A model passport represents identity (one passport per model). The `api_model_id` field optionally enables the TrustGate path for any model regardless of format. Downloadable models with `api_model_id` set get both compute and TrustGate paths; format="api" models get TrustGate only. Compute-first, TrustGate-fallback when both paths are available.

**Tech Stack:** TypeScript, Jest, JSON Schema (AJV 2020), Express

---

### Task 1: Rename `provider_model_id` to `api_model_id` in schema

**Files:**
- Modify: `schemas/ModelMeta.schema.json:63-67`

**Step 1: Write the change**

Replace the `provider_model_id` property in the JSON schema with `api_model_id`:

```json
"api_model_id": {
  "type": "string",
  "minLength": 1,
  "description": "The model identifier string for TrustGate API routing (e.g., gpt-4o, meta-llama/llama-3-70b). If set, the model can be accessed via TrustGate regardless of format."
}
```

Also update the `provider` field description on line 15 — change `"Provider name (e.g., llm-proxy, openai)"` to `"Provider name (e.g., openai, anthropic)"`.

**Step 2: Verify schema is valid JSON**

Run: `cd /c/Lucid-L2 && node -e "JSON.parse(require('fs').readFileSync('schemas/ModelMeta.schema.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add schemas/ModelMeta.schema.json
git commit -m "refactor: rename provider_model_id to api_model_id in ModelMeta schema"
```

---

### Task 2: Update passportManager.ts validation — rename field and relax format="api" requirement

**Files:**
- Modify: `offchain/src/services/passportManager.ts:169-178` (createPassport validation)
- Modify: `offchain/src/services/passportManager.ts:293-300` (updatePassport validation)

**Step 1: Update the existing passportService tests**

In `offchain/src/__tests__/passportService.test.ts`, rename all `provider_model_id` references to `api_model_id`:
- Line 385: test name "should reject format=api model passport without provider_model_id" → "should reject format=api model passport without api_model_id"
- Line 400: `expect(result.error).toContain('provider_model_id')` → `expect(result.error).toContain('api_model_id')`
- Line 403: test name with `provider_model_id` → `api_model_id`
- Line 409: `provider_model_id: 'gpt-4o'` → `api_model_id: 'gpt-4o'`
- Line 420: `expect(result.data!.metadata.provider_model_id)` → `expect(result.data!.metadata.api_model_id)`
- Line 490: test name with `provider_model_id` → `api_model_id`
- Lines 499, 511, 516: all `provider_model_id` → `api_model_id`

**Step 2: Run the tests to verify they fail (field name mismatch)**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage`
Expected: Tests that reference `api_model_id` should FAIL because the code still checks `provider_model_id`.

**Step 3: Update passportManager.ts createPassport (lines 169-178)**

Replace:
```typescript
    // Validate provider_model_id for API-based models
    if (input.type === 'model' && input.metadata?.format === 'api') {
      if (!input.metadata.provider_model_id || typeof input.metadata.provider_model_id !== 'string' || input.metadata.provider_model_id.trim() === '') {
        return {
          ok: false,
          error: 'Model passports with format "api" require a non-empty provider_model_id field',
          details: 'provider_model_id should be the exact model string for the provider API (e.g., "gpt-4o", "claude-3-sonnet-20240229")',
        };
      }
    }
```

With:
```typescript
    // Validate api_model_id for API-based models
    if (input.type === 'model' && input.metadata?.format === 'api') {
      const apiModelId = input.metadata.api_model_id || input.metadata.provider_model_id; // backward compat
      if (!apiModelId || typeof apiModelId !== 'string' || apiModelId.trim() === '') {
        return {
          ok: false,
          error: 'Model passports with format "api" require a non-empty api_model_id field',
          details: 'api_model_id is the model string TrustGate uses for routing (e.g., "gpt-4o", "claude-3-sonnet-20240229")',
        };
      }
    }
```

**Step 4: Update passportManager.ts updatePassport (lines 293-300)**

Apply the same rename — replace `provider_model_id` with `api_model_id` in the update validation block. Include the same backward compat fallback: `input.metadata.api_model_id || input.metadata.provider_model_id`.

**Step 5: Run the tests to verify they pass**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage`
Expected: All passport tests PASS.

**Step 6: Commit**

```bash
git add offchain/src/services/passportManager.ts offchain/src/__tests__/passportService.test.ts
git commit -m "refactor: rename provider_model_id to api_model_id in passport validation"
```

---

### Task 3: Update executionGateway.ts — rename field and implement dual-path routing

**Files:**
- Modify: `offchain/src/services/executionGateway.ts:189-190` (executeProviderRequest)
- Modify: `offchain/src/services/executionGateway.ts:313-314` (executeProviderStreamingRequest)
- Modify: `offchain/src/services/executionGateway.ts:463-466` (executeInferenceRequest routing)
- Modify: `offchain/src/services/executionGateway.ts:576-579` (executeStreamingInferenceRequest routing)

**Step 1: Update the test fixtures and add dual-path tests**

In `offchain/src/__tests__/executionGateway.test.ts`:

a) Rename `provider_model_id` to `api_model_id` in the `apiModelMeta` fixture (line 628):
```typescript
    const apiModelMeta = {
      schema_version: '1.0',
      model_passport_id: 'model_gpt4o_test',
      format: 'api',
      runtime_recommended: 'trustgate',
      api_model_id: 'gpt-4o',  // was provider_model_id
      base: 'openai',
      context_length: 128000,
      requirements: { min_vram_gb: 0 },
    };
```

b) Rename the test at line 671 from "should use provider_model_id as the model field sent to TrustGate" to "should use api_model_id as the model field sent to TrustGate".

c) Add a new test for dual-path (downloadable model with api_model_id):
```typescript
    it('should use TrustGate as fallback when compute fails for dual-path model', async () => {
      const dualPathMeta = {
        schema_version: '1.0',
        model_passport_id: 'model_llama3_test',
        format: 'safetensors',
        runtime_recommended: 'vllm',
        api_model_id: 'meta-llama/llama-3-70b',
        requirements: { min_vram_gb: 40 },
      };

      // TrustGate response (fallback after no compute)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Hello from TrustGate fallback' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: dualPathMeta,
        messages: [{ role: 'user', content: 'Hello' }],
        compute_catalog: [], // No compute available
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello from TrustGate fallback');
      expect(result.compute_passport_id).toBe('trustgate');
      expect(result.used_fallback).toBe(true);
    });

    it('should prefer compute path over TrustGate for dual-path model when compute available', async () => {
      const dualPathMeta = {
        schema_version: '1.0',
        model_passport_id: 'model_llama3_test',
        format: 'safetensors',
        runtime_recommended: 'vllm',
        api_model_id: 'meta-llama/llama-3-70b',
        requirements: { min_vram_gb: 16 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Hello from compute', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: dualPathMeta,
        prompt: 'Hello',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.compute_passport_id).not.toBe('trustgate');
      expect(result.runtime).not.toBe('trustgate');
    });

    it('should use only compute path for downloadable models without api_model_id', async () => {
      const request: ExecutionRequest = {
        model_meta: sampleModelMeta, // format=safetensors, no api_model_id
        prompt: 'Hello',
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);

      // No compute available and no api_model_id → should fail (no TrustGate fallback)
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_COMPATIBLE_COMPUTE');
    });
```

**Step 2: Run tests to verify they fail**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern executionGateway --no-coverage`
Expected: New dual-path tests FAIL (code still only checks `format === 'api'`), renamed field tests FAIL.

**Step 3: Update executeProviderRequest (line 189)**

Replace:
```typescript
  const providerModel = model_meta.provider_model_id
    || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');
```

With:
```typescript
  const apiModelId = model_meta.api_model_id
    || model_meta.provider_model_id  // backward compat during migration
    || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');
```

And update the body to use `apiModelId`:
```typescript
  const body: any = {
    model: apiModelId,
    ...
```

**Step 4: Same change in executeProviderStreamingRequest (line 313)**

Apply identical rename from `providerModel` to `apiModelId` with backward compat fallback.

**Step 5: Update routing in executeInferenceRequest (lines 463-466)**

Replace:
```typescript
    // Provider path: API-based models route directly to TrustGate
    if (model_meta.format === 'api') {
      return executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
    }
```

With:
```typescript
    // Determine available paths
    const hasApiPath = Boolean(model_meta.api_model_id || model_meta.provider_model_id || model_meta.format === 'api');
    const hasComputePath = model_meta.format === 'safetensors' || model_meta.format === 'gguf';

    // API-only models: TrustGate directly
    if (hasApiPath && !hasComputePath) {
      return executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
    }
```

Then, after the compute matching section (after the `if (!match)` block at line 480), change the "no match" return to try TrustGate fallback:

Replace the no-match return block:
```typescript
    if (!match) {
      return {
        success: false,
        run_id,
        ...
        error: 'NO_COMPATIBLE_COMPUTE',
        error_code: 'NO_COMPATIBLE_COMPUTE',
      };
    }
```

With:
```typescript
    if (!match) {
      // Dual-path: if TrustGate path is available, fall back to it
      if (hasApiPath) {
        const result = await executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
        return { ...result, used_fallback: true, fallback_reason: 'No compatible compute found, routed to TrustGate' };
      }
      return {
        success: false,
        run_id,
        request_id,
        trace_id,
        tokens_in: 0,
        tokens_out: 0,
        total_latency_ms: Date.now() - startTime,
        model_passport_id,
        compute_passport_id: '',
        runtime: '',
        policy_hash: explain.policy_hash,
        error: 'NO_COMPATIBLE_COMPUTE',
        error_code: 'NO_COMPATIBLE_COMPUTE',
      };
    }
```

Also add TrustGate fallback after compute execution failure. In `executeWithFallback`, when all computes fail (line 922), before throwing, check if TrustGate is available. This is more complex, so instead wrap the compute execution in a try/catch in `executeInferenceRequest`:

After `const result = await executeWithFallback(...)` block, wrap it:
```typescript
    // 4. Execute inference
    let result;
    try {
      result = await executeWithFallback(request, match, compute_catalog, model_meta, run_id, startTime);
    } catch (computeError) {
      // All compute endpoints failed — try TrustGate fallback if available
      if (hasApiPath) {
        const providerResult = await executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
        return { ...providerResult, used_fallback: true, fallback_reason: `All compute endpoints failed, routed to TrustGate` };
      }
      throw computeError;
    }
```

**Step 6: Same routing update in executeStreamingInferenceRequest (lines 576-579)**

Apply identical dual-path logic:
```typescript
    const hasApiPath = Boolean(model_meta.api_model_id || model_meta.provider_model_id || model_meta.format === 'api');
    const hasComputePath = model_meta.format === 'safetensors' || model_meta.format === 'gguf';

    if (hasApiPath && !hasComputePath) {
      return executeProviderStreamingRequest(request, model_passport_id, model_meta, run_id, startTime);
    }
```

And add TrustGate fallback for streaming when no compute matched (same pattern as non-streaming).

**Step 7: Run tests to verify they pass**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern executionGateway --no-coverage`
Expected: All tests PASS including the 3 new dual-path tests.

**Step 8: Commit**

```bash
git add offchain/src/services/executionGateway.ts offchain/src/__tests__/executionGateway.test.ts
git commit -m "feat: implement dual-path routing with compute-first TrustGate fallback"
```

---

### Task 4: Update SDK types

**Files:**
- Modify: `packages/sdk-js/src/types/index.ts:67-83`

**Step 1: Update ModelMeta interface**

Replace:
```typescript
export interface ModelMeta {
  name: string;
  format: string; // e.g., 'safetensors', 'gguf'
  runtime_recommended: string; // e.g., 'vllm', 'tgi', 'tensorrt'
  hf_repo?: string;
  model_type?: string;
  architecture?: string;
  license?: string;
  requirements?: {
    min_vram_gb?: number;
    max_context_length?: number;
    recommended_batch_size?: number;
  };
  quantization?: string;
  tensor_parallel_size?: number;
  [key: string]: any;
}
```

With:
```typescript
export interface ModelMeta {
  name: string;
  format: 'safetensors' | 'gguf' | 'api';
  runtime_recommended: string; // e.g., 'vllm', 'tgi', 'tensorrt', 'trustgate', 'openai'
  api_model_id?: string; // TrustGate model ID — enables API path (e.g., 'gpt-4o', 'meta-llama/llama-3-70b')
  hf_repo?: string;
  model_type?: string;
  architecture?: string;
  license?: string;
  requirements?: {
    min_vram_gb?: number;
    max_context_length?: number;
    recommended_batch_size?: number;
  };
  quantization?: string;
  tensor_parallel_size?: number;
  [key: string]: any;
}
```

**Step 2: Verify SDK compiles**

Run: `cd /c/Lucid-L2/packages/sdk-js && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors from our change (existing errors may exist).

**Step 3: Commit**

```bash
git add packages/sdk-js/src/types/index.ts
git commit -m "feat: add api_model_id to SDK ModelMeta type, type format as union"
```

---

### Task 5: Add TrustGate catalog validation to passportManager

**Files:**
- Modify: `offchain/src/services/passportManager.ts`

**Step 1: Write the failing test**

In `offchain/src/__tests__/passportService.test.ts`, add:

```typescript
    it('should validate api_model_id against TrustGate catalog for format=api', async () => {
      // Mock fetch for TrustGate catalog check
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'claude-3-sonnet-20240229', object: 'model' },
          ],
        }),
      });

      const result = await manager.createPassport({
        type: 'model',
        owner: testOwner,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'model_test_invalid',
          format: 'api',
          runtime_recommended: 'trustgate',
          api_model_id: 'nonexistent-model-xyz',
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found in TrustGate');

      global.fetch = originalFetch;
    });

    it('should suggest TrustGate for downloadable models that TrustGate supports', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'meta-llama/llama-3-70b', object: 'model' },
          ],
        }),
      });

      const result = await manager.createPassport({
        type: 'model',
        owner: testOwner,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'model_llama_test',
          format: 'safetensors',
          runtime_recommended: 'vllm',
          name: 'Meta-Llama/Llama-3-70B',
          requirements: { min_vram_gb: 40 },
        },
      });

      // Should succeed (downloadable models aren't blocked)
      expect(result.ok).toBe(true);
      // Suggestion is informational — check if it's in the response
      if (result.data) {
        // The suggestion would be in a warnings or suggestions field
        // Implementation decides the exact shape
      }

      global.fetch = originalFetch;
    });
```

**Step 2: Run tests to verify they fail**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage`
Expected: New tests FAIL.

**Step 3: Implement TrustGate catalog check**

Add to `passportManager.ts` (near the top, after imports):

```typescript
// TrustGate catalog cache
const TRUSTGATE_URL = process.env.TRUSTGATE_URL || 'https://trustgate-api-production.up.railway.app';
let trustgateCatalogCache: { models: Set<string>; expires: number } | null = null;
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTrustGateCatalog(): Promise<Set<string>> {
  if (trustgateCatalogCache && Date.now() < trustgateCatalogCache.expires) {
    return trustgateCatalogCache.models;
  }

  try {
    const response = await fetch(`${TRUSTGATE_URL}/v1/models`);
    if (!response.ok) {
      console.warn('TrustGate catalog check failed:', response.status);
      return new Set(); // Return empty on failure (non-blocking)
    }
    const data = await response.json();
    const models = new Set<string>(
      (data.data || []).map((m: { id: string }) => m.id)
    );
    trustgateCatalogCache = { models, expires: Date.now() + CATALOG_CACHE_TTL };
    return models;
  } catch (error) {
    console.warn('TrustGate catalog unreachable:', error);
    return new Set(); // Non-blocking
  }
}

// Export for testing
export function _resetTrustGateCatalogCache() {
  trustgateCatalogCache = null;
}
```

Then in `createPassport()`, after the `api_model_id` validation block, add:

```typescript
    // Validate api_model_id against TrustGate catalog
    if (input.type === 'model' && (input.metadata?.api_model_id || input.metadata?.format === 'api')) {
      const catalog = await getTrustGateCatalog();
      const modelId = input.metadata.api_model_id
        || input.metadata.provider_model_id  // backward compat
        || (input.metadata.name ? input.metadata.name.toLowerCase().replace(/\s+/g, '-') : '');

      if (catalog.size > 0 && modelId && !catalog.has(modelId)) {
        if (input.metadata.format === 'api') {
          // Hard reject for API-only models
          return {
            ok: false,
            error: `Model '${modelId}' not found in TrustGate catalog. Available models can be checked at ${TRUSTGATE_URL}/v1/models`,
          };
        }
        // Soft suggestion for downloadable models — logged, not blocking
        console.log(`[PassportManager] TrustGate also serves '${modelId}' — consider setting api_model_id for dual-path routing`);
      }
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage`
Expected: All passport tests PASS.

**Step 5: Commit**

```bash
git add offchain/src/services/passportManager.ts offchain/src/__tests__/passportService.test.ts
git commit -m "feat: validate api_model_id against TrustGate catalog at passport creation"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd /c/Lucid-L2/offchain && npx jest --no-coverage`
Expected: All tests PASS (except pre-existing mcpServer.test.ts failure).

**Step 2: Grep for remaining `provider_model_id` references**

Run: `cd /c/Lucid-L2 && grep -rn "provider_model_id" offchain/src/ packages/sdk-js/src/ schemas/`
Expected: Only backward-compat fallback lines (the `|| model_meta.provider_model_id` fallbacks in executionGateway.ts and passportManager.ts). No primary references.

**Step 3: Type check**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | grep -v node_modules | grep -v lucid-plateform-core | head -20`
Expected: No new errors from our changes.

**Step 4: Commit (if any cleanup needed)**

```bash
git commit -m "chore: verify full test suite passes after dual-path routing refactor"
```

---

### Summary of All Changes

| File | Change |
|------|--------|
| `schemas/ModelMeta.schema.json` | `provider_model_id` → `api_model_id`, updated description |
| `offchain/src/services/passportManager.ts` | Renamed validation, added TrustGate catalog check, backward compat |
| `offchain/src/services/executionGateway.ts` | Dual-path routing, compute-first + TrustGate fallback, renamed field |
| `packages/sdk-js/src/types/index.ts` | Added `api_model_id?`, typed `format` as union |
| `offchain/src/__tests__/executionGateway.test.ts` | Renamed field, 3 new dual-path tests |
| `offchain/src/__tests__/passportService.test.ts` | Renamed field, 2 new catalog validation tests |
