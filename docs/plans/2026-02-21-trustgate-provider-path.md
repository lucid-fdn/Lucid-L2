# TrustGate Provider Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deprecated llm-proxy system with a TrustGate provider path so API-based models (OpenAI, Anthropic, etc.) route directly to TrustGate instead of failing on compute passport matching.

**Architecture:** Two execution paths in `executeInferenceRequest()`. When `model_meta.format === "api"`, skip compute matching and call TrustGate directly. When format is `gguf`/`safetensors`, use existing compute passport matching. TrustGate handles receipts via `receipt_events` table.

**Tech Stack:** TypeScript, Express, Jest, JSON Schema (AJV)

---

### Task 1: Update ModelMeta Schema — add `provider_model_id`

**Files:**
- Modify: `C:\Lucid-L2\schemas\ModelMeta.schema.json`

**Step 1: Add `provider_model_id` property to schema**

In `ModelMeta.schema.json`, add `provider_model_id` to the `properties` object and add `trustgate` to `runtime_recommended` enum:

```json
{
  "properties": {
    ...existing properties...
    "provider_model_id": {
      "type": "string",
      "minLength": 1,
      "description": "The exact model identifier string for the provider API (e.g., gpt-4o, claude-3-sonnet-20240229)"
    }
  }
}
```

Also update `runtime_recommended` enum — replace `"llmproxy"` with `"trustgate"`:

```json
"runtime_recommended": { "type": "string", "enum": ["vllm", "tgi", "tensorrt", "trustgate", "openai"] }
```

**Step 2: Verify schema loads correctly**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern schemaValidator --no-coverage 2>&1 | tail -20`

If no schema validator test exists, run: `cd /c/Lucid-L2/offchain && npx ts-node -e "const { validateWithSchema } = require('./src/utils/schemaValidator'); const r = validateWithSchema('ModelMeta', { schema_version: '1.0', model_passport_id: 'test_passport_12345', format: 'api', runtime_recommended: 'trustgate', provider_model_id: 'gpt-4o' }); console.log(JSON.stringify(r));"`

Expected: `{ "ok": true, ... }`

**Step 3: Commit**

```bash
git add schemas/ModelMeta.schema.json
git commit -m "feat: add provider_model_id to ModelMeta schema, replace llmproxy with trustgate runtime"
```

---

### Task 2: Add passport creation validation for `provider_model_id`

**Files:**
- Modify: `C:\Lucid-L2\offchain\src\services\passportManager.ts` (lines 143-219, `createPassport` method)
- Test: `C:\Lucid-L2\offchain\src\__tests__\passportService.test.ts`

**Step 1: Write the failing test**

Add to `passportService.test.ts`:

```typescript
it('should reject model passport with format "api" but missing provider_model_id', async () => {
  const result = await manager.createPassport({
    type: 'model',
    owner: validOwnerAddress,
    metadata: {
      schema_version: '1.0',
      model_passport_id: 'placeholder_id',
      format: 'api',
      runtime_recommended: 'trustgate',
      // Missing provider_model_id
    },
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('provider_model_id');
});

it('should accept model passport with format "api" and valid provider_model_id', async () => {
  const result = await manager.createPassport({
    type: 'model',
    owner: validOwnerAddress,
    metadata: {
      schema_version: '1.0',
      model_passport_id: 'placeholder_id',
      format: 'api',
      runtime_recommended: 'trustgate',
      provider_model_id: 'gpt-4o',
      base: 'openai',
      context_length: 128000,
    },
  });
  expect(result.ok).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage 2>&1 | tail -20`

Expected: First test FAILS (no validation yet), second test may pass or fail depending on schema.

**Step 3: Add validation in `passportManager.ts`**

In the `createPassport` method, after the existing `validateMetadata` call (around line 182), add:

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

Also add the same check in the `updatePassport` method (around line 290) when metadata is being updated:

```typescript
// Validate provider_model_id for API-based models on update
if (passport.type === 'model' && updatedMetadata?.format === 'api') {
  if (!updatedMetadata.provider_model_id || typeof updatedMetadata.provider_model_id !== 'string' || updatedMetadata.provider_model_id.trim() === '') {
    return {
      ok: false,
      error: 'Model passports with format "api" require a non-empty provider_model_id field',
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern passportService --no-coverage 2>&1 | tail -20`

Expected: PASS

**Step 5: Commit**

```bash
git add offchain/src/services/passportManager.ts offchain/src/__tests__/passportService.test.ts
git commit -m "feat: validate provider_model_id required for format=api model passports"
```

---

### Task 3: Remove llm-proxy from `computeClient.ts`

**Files:**
- Modify: `C:\Lucid-L2\offchain\src\services\computeClient.ts`

**Step 1: Remove `llmproxy` from RuntimeType**

Change line 14:
```typescript
// Before
export type RuntimeType = 'vllm' | 'tgi' | 'tensorrt' | 'openai' | 'generic' | 'llmproxy';
// After
export type RuntimeType = 'vllm' | 'tgi' | 'tensorrt' | 'openai' | 'generic';
```

**Step 2: Remove `toLLMProxyFormat` function**

Delete lines 171-192 (the `toLLMProxyFormat` function).

**Step 3: Remove `parseLLMProxyResponse` function**

Delete lines 197-210 (the `parseLLMProxyResponse` function).

**Step 4: Remove `llmproxy` case from `executeInference` switch**

Delete lines 349-357 (the `case 'llmproxy':` block in the `executeInference` function).

**Step 5: Remove `llmproxy` case from response parsing switch**

Delete lines 429-430 (the `case 'llmproxy':` and `return parseLLMProxyResponse(data);` in the response parsing switch).

**Step 6: Run type check**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -30`

Expected: May show errors in `executionGateway.ts` referencing `llmproxy` (expected — we'll fix that next).

**Step 7: Commit**

```bash
git add offchain/src/services/computeClient.ts
git commit -m "refactor: remove llmproxy runtime type from computeClient"
```

---

### Task 4: Rewrite `executionGateway.ts` — remove llm-proxy, add TrustGate provider path

**Files:**
- Modify: `C:\Lucid-L2\offchain\src\services\executionGateway.ts`

This is the largest change. Work section by section.

**Step 1: Remove all llm-proxy code (lines 22-256)**

Delete these sections entirely:
- `ModelAlias` interface (lines 30-47)
- `MODEL_ALIASES` constant (lines 53-188)
- `LLM_PROXY_COMPUTE_META` constant (lines 194-227)
- `isModelAlias()` function (lines 232-234)
- `getModelAlias()` function (lines 239-241)
- `registerModelAlias()` function (lines 246-249)
- `listModelAliases()` function (lines 254-256)

**Step 2: Add TrustGate config constants**

At the top of the file (after imports), add:

```typescript
// ============================================================================
// TRUSTGATE PROVIDER CONFIGURATION
// ============================================================================

const TRUSTGATE_URL = process.env.TRUSTGATE_URL || 'https://trustgate-api-production.up.railway.app';
const TRUSTGATE_API_KEY = process.env.TRUSTGATE_API_KEY || '';
```

**Step 3: Add `executeProviderRequest()` function**

Add this function before `executeInferenceRequest()`:

```typescript
/**
 * Execute inference via TrustGate provider path (for API-based models).
 * Skips compute matching entirely — TrustGate handles provider routing.
 * TrustGate writes receipt_events; L2's receiptConsumer handles on-chain anchoring.
 */
async function executeProviderRequest(
  request: ExecutionRequest,
  model_passport_id: string,
  model_meta: any,
  run_id: string,
  startTime: number
): Promise<ExecutionResult> {
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;

  // Resolve model name for TrustGate
  const providerModel = model_meta.provider_model_id
    || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');

  // Build OpenAI-compatible request
  const body: any = {
    model: providerModel,
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    stream: false,
  };

  if (request.messages && request.messages.length > 0) {
    body.messages = request.messages;
  } else if (request.prompt) {
    body.messages = [{ role: 'user', content: request.prompt }];
  }

  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.stop) body.stop = request.stop;

  // Headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lucid-Model-Passport': model_passport_id,
  };
  if (TRUSTGATE_API_KEY) {
    headers['Authorization'] = `Bearer ${TRUSTGATE_API_KEY}`;
  }
  if (trace_id) {
    headers['X-Trace-ID'] = trace_id;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch(`${TRUSTGATE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        run_id,
        request_id,
        trace_id,
        tokens_in: 0,
        tokens_out: 0,
        total_latency_ms: Date.now() - startTime,
        model_passport_id,
        compute_passport_id: 'trustgate',
        runtime: 'trustgate',
        policy_hash: '',
        error: `TrustGate error (${response.status}): ${errorText}`,
        error_code: response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
      };
    }

    const data = await response.json();

    // Parse OpenAI-compatible response
    const choice = data.choices?.[0];
    const text = choice?.message?.content || choice?.text || '';
    const finish_reason = choice?.finish_reason || 'stop';
    const tokens_in = data.usage?.prompt_tokens || 0;
    const tokens_out = data.usage?.completion_tokens || 0;

    // Policy hash from request policy (if any)
    const policy = request.policy || DEFAULT_POLICY;
    const { policy_hash } = evaluatePolicy({ policy });

    return {
      success: true,
      run_id,
      request_id,
      trace_id,
      text,
      finish_reason,
      tokens_in,
      tokens_out,
      ttft_ms: Date.now() - startTime,
      total_latency_ms: Date.now() - startTime,
      model_passport_id,
      compute_passport_id: 'trustgate',
      runtime: 'trustgate',
      policy_hash,
      receipt_id: run_id, // TrustGate creates the actual receipt via receipt_events
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = error instanceof Error && error.name === 'AbortError';

    return {
      success: false,
      run_id,
      request_id,
      trace_id,
      tokens_in: 0,
      tokens_out: 0,
      total_latency_ms: Date.now() - startTime,
      model_passport_id,
      compute_passport_id: 'trustgate',
      runtime: 'trustgate',
      policy_hash: '',
      error: isTimeout ? 'TrustGate request timeout' : errorMsg,
      error_code: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
    };
  }
}
```

**Step 4: Add import for `evaluatePolicy`**

Add to the existing imports at the top of the file:

```typescript
import { evaluatePolicy, Policy } from './policyEngine';
```

(Check if `evaluatePolicy` is already imported — it may only import `Policy`.)

**Step 5: Modify `executeInferenceRequest()` — add provider path branch**

After line 427 (`const { model_passport_id, model_meta, is_proxy_model } = await resolveModel(request);`), replace the flow with:

```typescript
    // 1. Resolve model passport and metadata
    const { model_passport_id, model_meta } = await resolveModel(request);

    // 2. Provider path: API-based models route directly to TrustGate
    if (model_meta.format === 'api') {
      return executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
    }

    // 3. Compute path: match to GPU node
    const compute_catalog = await getComputeCatalog(request);
    // ... rest of existing compute matching logic
```

Remove the `is_proxy_model` parameter from `resolveModel()` return and from `getComputeCatalog()` call.

**Step 6: Modify `executeStreamingInferenceRequest()` — add provider path branch**

After `resolveModel()` in the streaming function, add the same branch:

```typescript
    const { model_passport_id, model_meta } = await resolveModel(request);

    // Provider path: streaming via TrustGate
    if (model_meta.format === 'api') {
      return executeProviderStreamingRequest(request, model_passport_id, model_meta, run_id, startTime);
    }

    // Compute path (existing code continues)
```

**Step 7: Add `executeProviderStreamingRequest()` function**

```typescript
/**
 * Execute streaming inference via TrustGate provider path.
 */
async function executeProviderStreamingRequest(
  request: ExecutionRequest,
  model_passport_id: string,
  model_meta: any,
  run_id: string,
  startTime: number
): Promise<StreamingExecutionResult> {
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;

  const providerModel = model_meta.provider_model_id
    || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');

  const body: any = {
    model: providerModel,
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    stream: true,
  };

  if (request.messages && request.messages.length > 0) {
    body.messages = request.messages;
  } else if (request.prompt) {
    body.messages = [{ role: 'user', content: request.prompt }];
  }

  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.stop) body.stop = request.stop;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'X-Lucid-Model-Passport': model_passport_id,
  };
  if (TRUSTGATE_API_KEY) {
    headers['Authorization'] = `Bearer ${TRUSTGATE_API_KEY}`;
  }

  const response = await fetch(`${TRUSTGATE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`TrustGate error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body for streaming from TrustGate');
  }

  const policy = request.policy || DEFAULT_POLICY;
  const { policy_hash } = evaluatePolicy({ policy });

  // Track metrics
  let ttft_ms: number | undefined;
  let tokens_out = 0;
  let fullText = '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const wrappedStream = async function* (): AsyncGenerator<StreamChunk, void, unknown> {
    let buffer = '';
    let isFirst = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { text: '', is_first: false, is_last: true, finish_reason: 'stop', tokens_out };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              const text = choice?.delta?.content || '';

              if (text) {
                if (isFirst && !ttft_ms) {
                  ttft_ms = Date.now() - startTime;
                }
                tokens_out++;
                fullText += text;

                yield { text, is_first: isFirst, is_last: false, tokens_out };
                isFirst = false;
              }

              if (choice?.finish_reason) {
                yield { text: '', is_first: false, is_last: true, finish_reason: choice.finish_reason, tokens_out };
                return;
              }
            } catch { /* skip unparseable chunks */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const finalize = async () => ({
    tokens_in: estimateChatTokens(request.messages || [{ role: 'user', content: request.prompt || '' }]).estimated,
    tokens_out,
    ttft_ms: ttft_ms || 0,
    total_latency_ms: Date.now() - startTime,
    receipt_id: run_id,
    text: fullText,
  });

  return {
    run_id,
    request_id,
    trace_id,
    model_passport_id,
    compute_passport_id: 'trustgate',
    runtime: 'trustgate',
    policy_hash,
    stream: wrappedStream(),
    finalize,
  };
}
```

**Step 8: Simplify `resolveModel()` — remove alias resolution**

Replace the entire `resolveModel()` function (lines ~717-784) with:

```typescript
/**
 * Resolve model passport and metadata.
 * Looks up passport by ID, validates it's a model type.
 */
async function resolveModel(request: ExecutionRequest): Promise<{
  model_passport_id: string;
  model_meta: any;
}> {
  // If model_meta provided directly, use it
  if (request.model_meta) {
    return {
      model_passport_id: request.model_meta.model_passport_id || request.model_passport_id || '',
      model_meta: request.model_meta,
    };
  }

  // Must have model_passport_id
  if (!request.model_passport_id) {
    throw new Error('model_passport_id or model_meta is required');
  }

  // Fetch from passport manager
  const manager = getPassportManager();
  const result = await manager.getPassport(request.model_passport_id);

  if (!result.ok || !result.data) {
    throw new Error(`Model passport not found: ${request.model_passport_id}`);
  }

  if (result.data.type !== 'model') {
    throw new Error(`Passport is not a model: ${request.model_passport_id}`);
  }

  return {
    model_passport_id: request.model_passport_id,
    model_meta: result.data.metadata,
  };
}
```

**Step 9: Simplify `getComputeCatalog()` — remove llm-proxy injection**

Replace the entire `getComputeCatalog()` function with:

```typescript
/**
 * Get compute catalog from request or registry.
 */
async function getComputeCatalog(request: ExecutionRequest): Promise<any[]> {
  // If catalog provided, use it
  if (request.compute_catalog && request.compute_catalog.length > 0) {
    return request.compute_catalog;
  }

  // If specific compute requested, get just that one
  if (request.compute_passport_id) {
    const manager = getPassportManager();
    const result = await manager.getPassport(request.compute_passport_id);
    if (result.ok && result.data && result.data.type === 'compute') {
      return [result.data.metadata];
    }
    throw new Error(`Compute passport not found: ${request.compute_passport_id}`);
  }

  // Get all active compute from passport manager
  const manager = getPassportManager();
  const result = await manager.listPassports({
    type: 'compute',
    status: 'active',
    per_page: 100,
  });

  return result.items.map((p: any) => p.metadata);
}
```

**Step 10: Run type check**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -40`

Expected: Should compile without errors. Fix any remaining references to removed code.

**Step 11: Commit**

```bash
git add offchain/src/services/executionGateway.ts
git commit -m "feat: add TrustGate provider path, remove llm-proxy system"
```

---

### Task 5: Update existing tests for the new provider path

**Files:**
- Modify: `C:\Lucid-L2\offchain\src\__tests__\executionGateway.test.ts`

**Step 1: Add provider path tests**

Add a new `describe` block:

```typescript
describe('Provider Path (TrustGate)', () => {
  const apiModelMeta = {
    schema_version: '1.0',
    model_passport_id: 'model_gpt4o_test',
    format: 'api',
    runtime_recommended: 'trustgate',
    provider_model_id: 'gpt-4o',
    base: 'openai',
    context_length: 128000,
    requirements: { min_vram_gb: 0 },
  };

  it('should route format=api models to TrustGate, skipping compute matching', async () => {
    // Mock TrustGate response (OpenAI-compatible)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello from GPT-4o!' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    } as Response);

    const request: ExecutionRequest = {
      model_meta: apiModelMeta,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    };

    const result = await executeInferenceRequest(request);

    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello from GPT-4o!');
    expect(result.compute_passport_id).toBe('trustgate');
    expect(result.runtime).toBe('trustgate');
    expect(result.tokens_in).toBe(10);
    expect(result.tokens_out).toBe(5);
    // Should NOT call createReceipt (TrustGate handles receipts)
    expect(mockCreateReceipt).not.toHaveBeenCalled();
  });

  it('should use provider_model_id as the model field sent to TrustGate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    } as Response);

    const request: ExecutionRequest = {
      model_meta: apiModelMeta,
      prompt: 'Hello',
    };

    await executeInferenceRequest(request);

    const fetchCall = mockFetch.mock.calls[0] as unknown[];
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o');
  });

  it('should return error when TrustGate returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response);

    const request: ExecutionRequest = {
      model_meta: apiModelMeta,
      prompt: 'Hello',
    };

    const result = await executeInferenceRequest(request);

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('RATE_LIMIT');
  });

  it('should NOT use compute matching for format=api models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    } as Response);

    const request: ExecutionRequest = {
      model_meta: apiModelMeta,
      messages: [{ role: 'user', content: 'Hello' }],
      compute_catalog: [], // Empty catalog — should NOT matter for provider path
    };

    const result = await executeInferenceRequest(request);

    // Should succeed even with empty compute catalog
    expect(result.success).toBe(true);
    expect(result.compute_passport_id).toBe('trustgate');
  });

  it('should still use compute path for format=gguf models', async () => {
    const request: ExecutionRequest = {
      model_meta: sampleModelMeta, // format: 'safetensors'
      prompt: 'Test',
      compute_catalog: [], // Empty — should fail with NO_COMPATIBLE_COMPUTE
    };

    const result = await executeInferenceRequest(request);

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('NO_COMPATIBLE_COMPUTE');
  });

  it('should look up passport and route via provider path when format=api', async () => {
    // Mock passport lookup returning an API model
    mockGetPassport.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'model_gpt4o_test',
        type: 'model',
        metadata: apiModelMeta,
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Via passport lookup' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    } as Response);

    const request: ExecutionRequest = {
      model_passport_id: 'model_gpt4o_test',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const result = await executeInferenceRequest(request);

    expect(result.success).toBe(true);
    expect(result.compute_passport_id).toBe('trustgate');
    expect(mockGetPassport).toHaveBeenCalledWith('model_gpt4o_test');
  });
});
```

**Step 2: Run all tests**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern executionGateway --no-coverage 2>&1 | tail -30`

Expected: All existing tests + new provider path tests PASS.

**Step 3: Commit**

```bash
git add offchain/src/__tests__/executionGateway.test.ts
git commit -m "test: add provider path tests for TrustGate routing"
```

---

### Task 6: Clean up providers directory — remove `llmproxy.ts`

**Files:**
- Delete: `C:\Lucid-L2\offchain\src\providers\llmproxy.ts`
- Modify: `C:\Lucid-L2\offchain\src\providers\router.ts` (remove LLMProxy references)

**Step 1: Remove `llmproxy.ts`**

Delete the file entirely.

**Step 2: Update `router.ts`**

Remove the import of `LLMProxyProvider` and the conditional registration of it in `initializeProviders()`. The LLMProxy provider was registered when `config.provider === 'llmproxy'` (around line 27-30 of router.ts). Remove that block.

**Step 3: Run type check**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

**Step 4: Commit**

```bash
git rm offchain/src/providers/llmproxy.ts
git add offchain/src/providers/router.ts
git commit -m "refactor: remove deprecated llmproxy provider"
```

---

### Task 7: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd /c/Lucid-L2/offchain && npx jest --no-coverage 2>&1 | tail -40`

Expected: All tests pass. Fix any remaining failures.

**Step 2: Run type check**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit 2>&1`

Expected: No errors.

**Step 3: Grep for remaining llm-proxy/llmproxy references**

Run: `grep -ri "llm.proxy\|llmproxy\|LLM_PROXY" /c/Lucid-L2/offchain/src/ --include="*.ts" | grep -v node_modules | grep -v __tests__`

Expected: Zero results (except possibly comments referencing the migration).

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: clean up remaining llm-proxy references"
```

---

### Task 8: Update existing model passports with `provider_model_id`

This is a one-time data migration via API calls.

**Step 1: Update GPT-4o passport**

```bash
curl -X PATCH https://api.lucid.foundation/v1/passports/passport_65a9c40a9e3a47e3acbbe6a3badc4f3c \
  -H "Authorization: Bearer sk-prod-d9c87c987bfb3504606bc0b989b1e2b1643ec2907a88f8b4" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "schema_version": "1.0",
      "model_passport_id": "passport_65a9c40a9e3a47e3acbbe6a3badc4f3c",
      "format": "api",
      "runtime_recommended": "trustgate",
      "name": "GPT-4o",
      "description": "OpenAI GPT-4o via TrustGate",
      "provider_model_id": "gpt-4o",
      "base": "openai",
      "context_length": 128000,
      "requirements": { "min_vram_gb": 0 }
    }
  }'
```

**Step 2: Update GPT-4 passport**

```bash
curl -X PATCH https://api.lucid.foundation/v1/passports/passport_308bd638940b4cad9079bb115a7b0bf0 \
  -H "Authorization: Bearer sk-prod-d9c87c987bfb3504606bc0b989b1e2b1643ec2907a88f8b4" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "schema_version": "1.0",
      "model_passport_id": "passport_308bd638940b4cad9079bb115a7b0bf0",
      "format": "api",
      "runtime_recommended": "trustgate",
      "name": "GPT-4",
      "description": "OpenAI GPT-4 via TrustGate",
      "provider_model_id": "gpt-4",
      "base": "openai",
      "context_length": 128000,
      "requirements": { "min_vram_gb": 0 }
    }
  }'
```

**Step 3: Update Claude 3 Sonnet passport**

```bash
curl -X PATCH https://api.lucid.foundation/v1/passports/passport_b55b5d0407904d42b728a6f0fbdaa6dd \
  -H "Authorization: Bearer sk-prod-d9c87c987bfb3504606bc0b989b1e2b1643ec2907a88f8b4" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "schema_version": "1.0",
      "model_passport_id": "passport_b55b5d0407904d42b728a6f0fbdaa6dd",
      "format": "api",
      "runtime_recommended": "trustgate",
      "name": "Claude 3 Sonnet",
      "description": "Anthropic Claude 3 Sonnet via TrustGate",
      "provider_model_id": "claude-3-sonnet-20240229",
      "base": "anthropic",
      "context_length": 200000,
      "requirements": { "min_vram_gb": 0 }
    }
  }'
```

**Step 4: Verify**

```bash
curl -s https://api.lucid.foundation/v1/passports/passport_65a9c40a9e3a47e3acbbe6a3badc4f3c \
  -H "Authorization: Bearer sk-prod-d9c87c987bfb3504606bc0b989b1e2b1643ec2907a88f8b4" | python -m json.tool
```

Expected: Passport metadata includes `provider_model_id: "gpt-4o"` and `runtime_recommended: "trustgate"`.

---

### Task 9: End-to-end test via SDK

**Step 1: Test inference with GPT-4o passport through L2**

This requires L2 to be running with the new code and `TRUSTGATE_URL`/`TRUSTGATE_API_KEY` env vars set. Create a quick test script:

```bash
curl -X POST https://api.lucid.foundation/v1/run/inference \
  -H "Authorization: Bearer sk-prod-d9c87c987bfb3504606bc0b989b1e2b1643ec2907a88f8b4" \
  -H "Content-Type: application/json" \
  -d '{
    "model_passport_id": "passport_65a9c40a9e3a47e3acbbe6a3badc4f3c",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}],
    "max_tokens": 50,
    "policy": {"policy_version": "1.0"}
  }'
```

Expected: Successful response with `text` from GPT-4o, `compute_passport_id: "trustgate"`, `runtime: "trustgate"`.

**Step 2: Test via SDK**

```typescript
import { LucidAI } from 'raijin-labs-lucid-ai';

const client = new LucidAI({ serverURL: 'https://api.lucid.foundation' });
const result = await client.run.inference({
  modelPassportId: 'passport_65a9c40a9e3a47e3acbbe6a3badc4f3c',
  messages: [{ role: 'user', content: 'Say hello' }],
  maxTokens: 50,
  policy: { policyVersion: '1.0' },
});
console.log(result);
```

Expected: Successful inference result with response from GPT-4o.
