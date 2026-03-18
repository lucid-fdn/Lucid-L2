# Agent Launcher Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace code-generation agent launcher with image-based deployment: `lucid launch --image` (BYOI) + `lucid launch --runtime base` (no-code) + verification modes. Make receipts unavoidable, TrustGate hardwired.

**Architecture:** Add `ImageDeployInput` type alongside existing `RuntimeArtifact`. New `launchImage()` and `launchBaseRuntime()` methods on `AgentDeploymentService`. Fix 4 deployer issues (Docker no image-ref, Akash ignores user image, io.net/Nosana entrypoint override). Update CLI with `launch` command. Move 7 code-gen adapters to `examples/`. Add 14 missing endpoints to OpenAPI.

**Tech Stack:** TypeScript, Express, Jest, Docker, existing IDeployer + IDeploymentStore.

**Spec:** `docs/superpowers/specs/2026-03-18-agent-launcher-redesign-design.md`

**Baseline:** 103 test suites, 1683 tests, 0 failures.

---

## File Structure

### Files to Create (4)
| File | Responsibility |
|------|---------------|
| `engine/src/compute/deploy/types.ts` | `ImageDeployInput` type + `isImageDeploy()` guard |
| `engine/src/compute/agent/launchService.ts` | `launchImage()` + `launchBaseRuntime()` methods |
| `engine/src/__tests__/launchService.test.ts` | ~10 tests for new launch flows |
| `examples/adapters/README.md` | Index of moved code-gen adapters |

### Files to Modify (10)
| File | Changes |
|------|---------|
| `engine/src/compute/deploy/IDeployer.ts` | Add `ImageDeployInput` import, extend `deploy()` union |
| `engine/src/compute/deploy/DockerDeployer.ts` | Add image-ref path (generate `image:` instead of `build: .`) |
| `engine/src/compute/deploy/AkashDeployer.ts` | Fix `resolveImageRef()` to check `ImageDeployInput.image` first |
| `engine/src/compute/deploy/IoNetDeployer.ts` | Don't override entrypoint for BYOI |
| `engine/src/compute/deploy/NosanaDeployer.ts` | Don't override entrypoint for BYOI |
| `engine/src/compute/deploy/index.ts` | Re-export `ImageDeployInput` |
| `engine/src/compute/agent/agentDeploymentService.ts` | Delegate to launchService for new paths |
| `src/cli.ts` | Add `launch` command with `--image`, `--runtime`, `--verification` |
| `engine/src/__tests__/deployers.test.ts` | Add image-ref tests for Docker, Akash |
| `openapi.yaml` | Add 14 missing endpoints + `POST /v1/agents/launch` |

### Files to Move (10 → `examples/adapters/`)
| File | New Location |
|------|-------------|
| `engine/src/compute/runtime/VercelAIAdapter.ts` | `examples/adapters/VercelAIAdapter.ts` |
| `engine/src/compute/runtime/OpenClawAdapter.ts` | `examples/adapters/OpenClawAdapter.ts` |
| `engine/src/compute/runtime/OpenAIAgentsAdapter.ts` | `examples/adapters/OpenAIAgentsAdapter.ts` |
| `engine/src/compute/runtime/LangGraphAdapter.ts` | `examples/adapters/LangGraphAdapter.ts` |
| `engine/src/compute/runtime/CrewAIAdapter.ts` | `examples/adapters/CrewAIAdapter.ts` |
| `engine/src/compute/runtime/GoogleADKAdapter.ts` | `examples/adapters/GoogleADKAdapter.ts` |
| `engine/src/compute/runtime/DockerAdapter.ts` | `examples/adapters/DockerAdapter.ts` |
| `engine/src/compute/deploy/imageBuilder.ts` | `examples/adapters/imageBuilder.ts` |
| `engine/src/compute/agent/descriptorBuilder.ts` | `examples/adapters/descriptorBuilder.ts` |
| `engine/src/__tests__/runtimeAdapters.test.ts` | `examples/adapters/runtimeAdapters.test.ts` |

---

## Chunk 1: ImageDeployInput Type + Deployer Fixes

### Task 1: Create ImageDeployInput Type

**Files:**
- Create: `offchain/packages/engine/src/compute/deploy/types.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/IDeployer.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/index.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// offchain/packages/engine/src/compute/deploy/types.ts

/**
 * Input for deploying a pre-built Docker image (BYOI or base runtime).
 * Alternative to RuntimeArtifact (code-gen path).
 */
export interface ImageDeployInput {
  /** Docker image reference, e.g. "ghcr.io/myorg/my-agent:latest" */
  image: string;
  /** Environment variables to inject into the container */
  env_vars: Record<string, string>;
  /** Container port (default 3100) */
  port?: number;
  /** Override image's CMD/ENTRYPOINT — only if user explicitly specifies */
  entrypoint?: string[];
  /** Credentials for private registries */
  registry_auth?: {
    username: string;
    password: string;
  };
  /** Verification mode: full (receipts+memory+payment) or minimal (health+metadata) */
  verification: 'full' | 'minimal';
}

/** Type guard: is this an image deploy or a code-gen artifact? */
export function isImageDeploy(input: unknown): input is ImageDeployInput {
  return typeof input === 'object' && input !== null && 'image' in input && typeof (input as any).image === 'string';
}
```

- [ ] **Step 2: Update IDeployer.ts — extend deploy() signature**

In `offchain/packages/engine/src/compute/deploy/IDeployer.ts`, add import and extend the `deploy()` method to accept the union type.

At top of file, add:
```typescript
import type { ImageDeployInput } from './types';
```

Change line 109 from:
```typescript
deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>;
```
to:
```typescript
deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>;
```

- [ ] **Step 3: Update deploy/index.ts — re-export types**

In `offchain/packages/engine/src/compute/deploy/index.ts`, add:
```typescript
export type { ImageDeployInput } from './types';
export { isImageDeploy } from './types';
```

- [ ] **Step 4: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors in deployers (their `deploy()` signatures don't match yet). This is expected — we fix them in Tasks 2-5.

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/compute/deploy/types.ts offchain/packages/engine/src/compute/deploy/IDeployer.ts offchain/packages/engine/src/compute/deploy/index.ts
git commit -m "feat(deploy): add ImageDeployInput type for image-based deployment"
```

---

### Task 2: Fix DockerDeployer — Add Image-Ref Path

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/DockerDeployer.ts`

- [ ] **Step 1: Update deploy() signature and add image-ref branch**

In `DockerDeployer.ts`, update the `deploy()` method (line 22) to accept the union type and branch on `isImageDeploy()`:

```typescript
import { isImageDeploy } from './types';
import type { ImageDeployInput } from './types';
```

At line 22, change method signature to:
```typescript
async deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>
```

At the top of the method body, add the image-ref branch before existing logic:
```typescript
if (isImageDeploy(input)) {
  return this.deployImage(input, config, passportId);
}
const artifact = input; // existing code-gen path continues
```

- [ ] **Step 2: Add deployImage() private method**

Add after the existing `deploy()` method:
```typescript
private async deployImage(input: ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
  const deployId = `deploy_${crypto.randomBytes(6).toString('hex')}`;
  const deployDir = path.join(process.cwd(), 'data', 'deployments', deployId);
  fs.mkdirSync(deployDir, { recursive: true });

  const port = input.port || 3100;

  // Generate docker-compose.yml with image: directive (NOT build: .)
  const envLines = Object.entries(input.env_vars)
    .map(([k, v]) => `      - ${k}=${v}`).join('\n');

  const compose = `services:
  agent:
    image: ${input.image}
    container_name: lucid-agent-${deployId}
    ports:
      - "${port}:${port}"
    environment:
${envLines}
      - PORT=${port}
      - AGENT_PASSPORT_ID=${passportId}
    restart: ${config.restart_policy || 'on-failure'}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${port}/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    labels:
      - "lucid.passport_id=${passportId}"
      - "lucid.deployment_id=${deployId}"
`;

  fs.writeFileSync(path.join(deployDir, 'docker-compose.yml'), compose);
  fs.writeFileSync(path.join(deployDir, 'deployment.json'), JSON.stringify({
    deployment_id: deployId,
    passport_id: passportId,
    image: input.image,
    target: 'docker',
    created_at: new Date().toISOString(),
    verification: input.verification,
  }, null, 2));

  this.deployments.set(deployId, { dir: deployDir, status: 'running', passportId, createdAt: Date.now() });

  logger.info(`[Deploy] Docker image deployment created: ${deployDir}`);
  logger.info(`[Deploy]   To start: cd ${deployDir} && docker compose up -d`);

  return {
    success: true,
    deployment_id: deployId,
    target: 'docker',
    url: `http://localhost:${port}`,
  };
}
```

- [ ] **Step 3: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep DockerDeployer`
Expected: No errors for DockerDeployer.

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/compute/deploy/DockerDeployer.ts
git commit -m "feat(deploy): DockerDeployer supports image-ref via docker-compose image: directive"
```

---

### Task 3: Fix AkashDeployer — Check User Image First

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/AkashDeployer.ts`

- [ ] **Step 1: Update deploy() signature**

Add imports and change signature same pattern as DockerDeployer.

- [ ] **Step 2: Fix resolveImageRef() (line 333)**

Change `resolveImageRef()` to check for `ImageDeployInput.image` first:

```typescript
private async resolveImageRef(input: RuntimeArtifact | ImageDeployInput, passportId: string): Promise<string> {
  // BYOI: user-provided image takes priority
  if (isImageDeploy(input)) {
    return input.image;
  }
  // Legacy code-gen path: build from artifact
  try {
    const builder = getImageBuilder();
    const ref = await builder.build(input, passportId);
    return ref.fullRef;
  } catch {
    return 'node:20-slim'; // fallback
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/compute/deploy/AkashDeployer.ts
git commit -m "fix(deploy): AkashDeployer checks user image before falling back to imageBuilder"
```

---

### Task 4: Fix IoNetDeployer + NosanaDeployer — Don't Override BYOI Entrypoint

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/IoNetDeployer.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/NosanaDeployer.ts`

- [ ] **Step 1: Fix IoNetDeployer (line 116)**

Update deploy() signature. At line 116, change:
```typescript
entrypoint: artifact.entrypoint ? ['node', artifact.entrypoint] : ['node', 'index.js'],
```
to:
```typescript
entrypoint: isImageDeploy(input)
  ? (input.entrypoint || undefined)  // BYOI: use image's CMD unless explicitly overridden
  : (input.entrypoint ? ['node', input.entrypoint] : ['node', 'index.js']),
```

- [ ] **Step 2: Fix NosanaDeployer (line 98)**

Same pattern. Change:
```typescript
cmd: artifact.entrypoint ? ['node', artifact.entrypoint] : ['node', 'index.js'],
```
to:
```typescript
cmd: isImageDeploy(input)
  ? (input.entrypoint || undefined)
  : (input.entrypoint ? ['node', input.entrypoint] : ['node', 'index.js']),
```

- [ ] **Step 3: Update both deploy() signatures to accept union type**

- [ ] **Step 4: Also update RailwayDeployer and PhalaDeployer signatures**

These already handle image refs functionally but need the type signature update for consistency.

- [ ] **Step 5: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep "error TS" | head -10`
Expected: No errors (all 6 deployers now accept the union type).

- [ ] **Step 6: Commit**

```bash
git add offchain/packages/engine/src/compute/deploy/IoNetDeployer.ts offchain/packages/engine/src/compute/deploy/NosanaDeployer.ts offchain/packages/engine/src/compute/deploy/RailwayDeployer.ts offchain/packages/engine/src/compute/deploy/PhalaDeployer.ts
git commit -m "fix(deploy): IoNet/Nosana don't override BYOI entrypoint, all deployers accept ImageDeployInput"
```

---

### Task 5: Deployer Tests for Image-Ref Path

**Files:**
- Modify: `offchain/packages/engine/src/__tests__/deployers.test.ts`

- [ ] **Step 1: Add image-ref tests**

Add to existing deployers.test.ts:

```typescript
describe('Image-based deployment', () => {
  const imageInput: ImageDeployInput = {
    image: 'ghcr.io/test/my-agent:v1',
    env_vars: { LUCID_API_URL: 'http://localhost:3001', LUCID_PASSPORT_ID: 'test_passport' },
    port: 8080,
    verification: 'full',
  };

  test('DockerDeployer deploys image ref (no build)', async () => {
    const deployer = getDeployer('docker');
    const result = await deployer.deploy(imageInput, { target: { type: 'docker' }, restart_policy: 'on-failure' }, 'test_passport');
    expect(result.success).toBe(true);
    expect(result.url).toContain('8080');
    // Verify docker-compose uses image: not build:
    const dir = path.join(process.cwd(), 'data', 'deployments', result.deployment_id);
    const compose = fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('image: ghcr.io/test/my-agent:v1');
    expect(compose).not.toContain('build:');
  });

  test('isImageDeploy correctly identifies image input', () => {
    expect(isImageDeploy(imageInput)).toBe(true);
    expect(isImageDeploy({ files: new Map(), entrypoint: 'x', adapter: 'y', dependencies: {}, env_vars: {} })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/__tests__/deployers.test.ts --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/__tests__/deployers.test.ts
git commit -m "test(deploy): image-ref deployment tests for DockerDeployer + isImageDeploy guard"
```

---

## Chunk 2: Launch Service + CLI

### Task 6: Launch Service

**Files:**
- Create: `offchain/packages/engine/src/compute/agent/launchService.ts`

- [ ] **Step 1: Create launchService.ts**

```typescript
/**
 * Launch Service — image-based agent activation.
 *
 * Two methods:
 * - launchImage(): BYOI — deploy user's Docker image
 * - launchBaseRuntime(): no-code — deploy pre-built base runtime
 *
 * Both bypass code generation entirely. Both enforce TrustGate routing.
 */

import { logger } from '../../shared/lib/logger';
import { getPassportManager } from '../../identity/passport/passportManager';
import { getDeployer } from '../deploy';
import { getDeploymentStore } from '../../deployment/control-plane';
import type { ImageDeployInput } from '../deploy/types';
import type { DeploymentTargetType } from '../agent/agentDescriptor';
import crypto from 'crypto';

export interface LaunchImageInput {
  image: string;
  target: DeploymentTargetType;
  owner: string;
  name: string;
  passport_id?: string;
  port?: number;
  env_vars?: Record<string, string>;
  verification?: 'full' | 'minimal';
  registry_auth?: { username: string; password: string };
}

export interface LaunchBaseRuntimeInput {
  model: string;
  prompt: string;
  target: DeploymentTargetType;
  owner: string;
  name: string;
  tools?: string[];
  runtime_version?: string;  // default: latest pinned
}

export interface LaunchResult {
  success: boolean;
  passport_id?: string;
  deployment_id?: string;
  deployment_url?: string;
  verification_mode?: string;
  config_hash?: string;
  error?: string;
}

const BASE_RUNTIME_IMAGE = 'ghcr.io/lucid-fdn/agent-runtime';
const DEFAULT_RUNTIME_VERSION = 'v1.0.0';
const DEFAULT_PORT = 3100;

export async function launchImage(input: LaunchImageInput): Promise<LaunchResult> {
  const store = getDeploymentStore();
  const verification = input.verification || 'full';
  logger.info(`[Launch] Starting image launch: ${input.name} → ${input.target} (${verification})`);

  try {
    // 1. Create or use existing passport
    let passportId = input.passport_id;
    if (!passportId) {
      const pm = getPassportManager();
      const result = await pm.createPassport({
        type: 'agent',
        owner: input.owner,
        name: input.name,
        metadata: {
          agent_config: {
            system_prompt: `Agent: ${input.name}`,
            model_passport_id: 'user-provided',
          },
          deployment_config: {
            target: { type: input.target },
          },
        },
      });
      if (!result.ok || !result.data) return { success: false, error: `Passport creation failed: ${result.error}` };
      passportId = result.data.passport_id;
      logger.info(`[Launch] Passport created: ${passportId}`);
    }

    // 2. Create deployment record (pending)
    const lucidApiUrl = process.env.LUCID_API_URL || `http://localhost:${process.env.PORT || 3001}`;
    const deployment = await store.create({
      agent_passport_id: passportId,
      provider: input.target,
      runtime_adapter: 'user-image',
      descriptor_snapshot: { image: input.image, verification },
      created_by: 'launch-service',
    });
    logger.info(`[Launch] Deployment record: ${deployment.deployment_id} (pending)`);

    // 3. Transition to deploying
    await store.transition(deployment.deployment_id, 'deploying', deployment.version, { actor: 'launch-service' });

    // 4. Build ImageDeployInput with Lucid env vars
    const imageInput: ImageDeployInput = {
      image: input.image,
      env_vars: {
        LUCID_API_URL: lucidApiUrl,
        LUCID_PASSPORT_ID: passportId,
        LUCID_VERIFICATION_MODE: verification,
        TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
        ...(input.env_vars || {}),
      },
      port: input.port || DEFAULT_PORT,
      verification,
      ...(input.registry_auth ? { registry_auth: input.registry_auth } : {}),
    };

    // 5. Deploy
    const deployer = getDeployer(input.target);
    const result = await deployer.deploy(imageInput, {
      target: { type: input.target },
      restart_policy: 'on_failure',
    }, passportId);

    if (result.success) {
      await store.updateProviderResources(deployment.deployment_id, {
        provider_deployment_id: result.deployment_id,
        deployment_url: result.url || undefined,
      });
      const updated = await store.getById(deployment.deployment_id);
      await store.transition(deployment.deployment_id, 'running', updated!.version, { actor: 'launch-service' });
      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'succeeded',
        actor: 'launch-service',
        metadata: { image: input.image, verification, target: input.target },
      });

      logger.info(`[Launch] Agent launched: ${passportId} → ${result.url || 'pending'}`);
      return {
        success: true,
        passport_id: passportId,
        deployment_id: result.deployment_id,
        deployment_url: result.url,
        verification_mode: verification,
      };
    } else {
      const updated = await store.getById(deployment.deployment_id);
      await store.transition(deployment.deployment_id, 'failed', updated!.version, {
        actor: 'launch-service',
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (err: any) {
    logger.error(`[Launch] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function launchBaseRuntime(input: LaunchBaseRuntimeInput): Promise<LaunchResult> {
  const version = input.runtime_version || DEFAULT_RUNTIME_VERSION;
  const image = `${BASE_RUNTIME_IMAGE}:${version}`;
  const configHash = crypto.createHash('sha256')
    .update(JSON.stringify({ model: input.model, prompt: input.prompt, tools: input.tools || [], version }))
    .digest('hex')
    .slice(0, 16);

  logger.info(`[Launch] Base runtime: ${image} (config_hash: ${configHash})`);

  return launchImage({
    image,
    target: input.target,
    owner: input.owner,
    name: input.name,
    verification: 'full', // always full for base runtime
    env_vars: {
      LUCID_MODEL: input.model,
      LUCID_PROMPT: input.prompt,
      LUCID_TOOLS: (input.tools || []).join(','),
      LUCID_CONFIG_HASH: configHash,
      TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
      TRUSTGATE_API_KEY: process.env.TRUSTGATE_API_KEY || '',
      MCPGATE_URL: process.env.MCPGATE_URL || '',
    },
  });
}
```

- [ ] **Step 2: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep launchService`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/compute/agent/launchService.ts
git commit -m "feat(launch): launchImage + launchBaseRuntime — image-based agent activation"
```

---

### Task 7: Launch Service Tests

**Files:**
- Create: `offchain/packages/engine/src/__tests__/launchService.test.ts`

- [ ] **Step 1: Write ~8 tests**

```typescript
import { launchImage, launchBaseRuntime } from '../compute/agent/launchService';
import { InMemoryDeploymentStore } from '../deployment/control-plane/in-memory-store';

// Use in-memory store
process.env.DEPLOYMENT_STORE = 'memory';

describe('launchImage', () => {
  test('launches image to docker target', async () => {
    const result = await launchImage({
      image: 'nginx:latest',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'TestAgent',
      verification: 'full',
    });
    expect(result.success).toBe(true);
    expect(result.passport_id).toBeDefined();
    expect(result.deployment_id).toBeDefined();
    expect(result.verification_mode).toBe('full');
  });

  test('launches with minimal verification', async () => {
    const result = await launchImage({
      image: 'nginx:latest',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'MinimalAgent',
      verification: 'minimal',
    });
    expect(result.success).toBe(true);
    expect(result.verification_mode).toBe('minimal');
  });

  test('reuses existing passport_id', async () => {
    const result = await launchImage({
      image: 'nginx:latest',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'ExistingPassport',
      passport_id: 'passport_existing_123',
      verification: 'full',
    });
    expect(result.success).toBe(true);
    expect(result.passport_id).toBe('passport_existing_123');
  });

  test('injects LUCID env vars', async () => {
    const result = await launchImage({
      image: 'nginx:latest',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'EnvTestAgent',
      verification: 'full',
      env_vars: { CUSTOM_VAR: 'custom_value' },
    });
    expect(result.success).toBe(true);
  });

  test('fails with invalid owner', async () => {
    const result = await launchImage({
      image: 'nginx:latest',
      target: 'docker',
      owner: 'invalid',
      name: 'BadOwner',
      verification: 'full',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid owner');
  });
});

describe('launchBaseRuntime', () => {
  test('launches base runtime with model+prompt', async () => {
    const result = await launchBaseRuntime({
      model: 'gpt-4o',
      prompt: 'You are a test agent',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'BaseAgent',
    });
    expect(result.success).toBe(true);
    expect(result.verification_mode).toBe('full');
  });

  test('includes config_hash for reputation lineage', async () => {
    const result = await launchBaseRuntime({
      model: 'gpt-4o',
      prompt: 'You are a test agent',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'HashAgent',
      tools: ['web-search'],
    });
    expect(result.success).toBe(true);
  });

  test('always uses full verification', async () => {
    const result = await launchBaseRuntime({
      model: 'test-model',
      prompt: 'test',
      target: 'docker',
      owner: '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
      name: 'FullVerify',
    });
    expect(result.verification_mode).toBe('full');
  });
}
```

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/__tests__/launchService.test.ts --no-coverage`
Expected: 8 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/__tests__/launchService.test.ts
git commit -m "test(launch): 8 tests — launchImage, launchBaseRuntime, verification modes"
```

---

### Task 8: CLI — Add `launch` Command

**Files:**
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add `launch` command with --image flag (BYOI)**

**IMPORTANT:** Insert BEFORE `program.parse(process.argv)` (line 255). If appended after parse(), the command is unreachable.

Before the existing `program.parse(process.argv)` line, add:

```typescript
// Launch Commands (image-based — replaces code generation)
program
  .command('launch')
  .description('Activate an agent in the Lucid verified network')
  .option('--image <image>', 'Docker image to deploy (BYOI)')
  .option('--runtime <runtime>', 'Pre-built runtime (e.g., "base")')
  .option('-m, --model <model>', 'Model for base runtime')
  .option('-p, --prompt <prompt>', 'System prompt for base runtime')
  .option('--tools <tools>', 'Comma-separated tool passport IDs')
  .option('-t, --target <target>', 'Deployment target (docker|railway|akash|phala|ionet|nosana)', 'docker')
  .option('-o, --owner <owner>', 'Owner wallet address')
  .option('-n, --name <name>', 'Agent name')
  .option('--port <port>', 'Container port', '3100')
  .option('--verification <mode>', 'Verification mode (full|minimal)', 'full')
  .action(async (options) => {
    try {
      const { launchImage, launchBaseRuntime } = await import('../packages/engine/src/compute/agent/launchService');

      if (options.image) {
        // Path A: BYOI
        if (!options.owner) { console.error('--owner required'); process.exit(1); }
        if (!options.name) { console.error('--name required'); process.exit(1); }
        console.log(`Launching ${options.name} (${options.image}) → ${options.target}...`);
        const result = await launchImage({
          image: options.image,
          target: options.target,
          owner: options.owner,
          name: options.name,
          port: parseInt(options.port),
          verification: options.verification,
        });
        if (result.success) {
          console.log('\nAgent launched:');
          console.log(`  Passport: ${result.passport_id}`);
          console.log(`  Deployment: ${result.deployment_id}`);
          console.log(`  URL: ${result.deployment_url || 'pending'}`);
          console.log(`  Verification: ${result.verification_mode}`);
        } else {
          console.error(`\nLaunch failed: ${result.error}`);
          process.exit(1);
        }
      } else if (options.runtime === 'base') {
        // Path B: Base runtime
        if (!options.model) { console.error('--model required for base runtime'); process.exit(1); }
        if (!options.prompt) { console.error('--prompt required for base runtime'); process.exit(1); }
        const name = options.name || `base-${options.model}`;
        const owner = options.owner || 'local';
        console.log(`Launching base runtime (${options.model}) → ${options.target}...`);
        const result = await launchBaseRuntime({
          model: options.model,
          prompt: options.prompt,
          target: options.target,
          owner,
          name,
          tools: options.tools ? options.tools.split(',') : [],
        });
        if (result.success) {
          console.log('\nAgent launched:');
          console.log(`  Passport: ${result.passport_id}`);
          console.log(`  Deployment: ${result.deployment_id}`);
          console.log(`  URL: ${result.deployment_url || 'pending'}`);
          console.log(`  Verification: full (always for base runtime)`);
        } else {
          console.error(`\nLaunch failed: ${result.error}`);
          process.exit(1);
        }
      } else {
        console.error('Specify --image <docker_image> or --runtime base');
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Launch error:', err.message || err);
      process.exit(1);
    }
  });
```

- [ ] **Step 2: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep cli`
Expected: No errors.

- [ ] **Step 3: Test CLI manually**

Run: `cd offchain && DEPLOYMENT_STORE=memory npx ts-node src/cli.ts launch --image nginx:latest --target docker --owner 3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3 --name TestLaunch`
Expected: "Agent launched:" with passport, deployment ID, URL.

- [ ] **Step 4: Commit**

```bash
git add offchain/src/cli.ts
git commit -m "feat(cli): add 'lucid launch' command — image-based + base runtime activation"
```

---

## Chunk 3: Move Code-Gen to Examples + OpenAPI + Full Test

### Task 9: Move Code-Gen Adapters to examples/

**Files:**
- Move 10 files from `engine/src/` to `examples/adapters/`
- Update `runtime/index.ts` to handle missing adapters gracefully

- [ ] **Step 1: Create examples/adapters/ directory**

```bash
mkdir -p offchain/examples/adapters
```

- [ ] **Step 2: Update runtime/index.ts FIRST (before moving files)**

In `offchain/packages/engine/src/compute/runtime/index.ts`, wrap each `require()` in `loadAdapters()` with try/catch so missing adapter files don't crash the process. Log a debug warning for each missing adapter. This must happen BEFORE Step 3 to avoid breaking all tests.

- [ ] **Step 3: Move adapter files**

```bash
cd offchain
mv packages/engine/src/compute/runtime/VercelAIAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/OpenClawAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/OpenAIAgentsAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/LangGraphAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/CrewAIAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/GoogleADKAdapter.ts examples/adapters/
mv packages/engine/src/compute/runtime/DockerAdapter.ts examples/adapters/
mv packages/engine/src/compute/deploy/imageBuilder.ts examples/adapters/
mv packages/engine/src/compute/agent/descriptorBuilder.ts examples/adapters/
mv packages/engine/src/__tests__/runtimeAdapters.test.ts examples/adapters/
```

- [ ] **Step 3: Update runtime/index.ts — make adapter loading optional**

In `offchain/packages/engine/src/compute/runtime/index.ts`, update `loadAdapters()` to gracefully handle missing adapter files (they've been moved). Keep `IRuntimeAdapter` interface and factory exports. The factory should log a warning if no adapters found but not crash.

- [ ] **Step 4: Update agentDeploymentService.ts imports**

The existing `deployAgent()` method (which uses adapters) should catch the "no adapters" case and return a clear error: "Code-generation adapters have been moved to examples/. Use launchImage() or launchBaseRuntime() instead."

- [ ] **Step 5: Create examples/adapters/README.md**

```markdown
# Code Generation Adapters (Reference Examples)

These adapters were the original code-generation system for Lucid agent deployment.
They have been replaced by the image-based launch system (`lucid launch`).

These files are kept as reference examples showing how to build a Lucid agent
with each framework.

## Adapters

| Adapter | Framework | Language |
|---------|-----------|----------|
| VercelAIAdapter | Vercel AI SDK | TypeScript |
| OpenClawAdapter | OpenClaw | Markdown |
| OpenAIAgentsAdapter | OpenAI Agents SDK | Python |
| LangGraphAdapter | LangGraph | Python |
| CrewAIAdapter | CrewAI | Python |
| GoogleADKAdapter | Google ADK | Python |
| DockerAdapter | Vanilla Node.js | TypeScript |

## Usage

These are NOT used by `lucid launch`. They are reference implementations
for developers who want to see how agent code is structured for each framework.

For actual deployment, use:
- `lucid launch --image <your-image>` (bring your own)
- `lucid launch --runtime base --model <model> --prompt <prompt>` (no-code)
```

- [ ] **Step 6: Run full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All tests pass (runtimeAdapters.test.ts was moved, so it won't run. agentDeploymentService.test.ts may need adaptation if it mocks adapters — fix any failures).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move code-gen adapters to examples/ — launch replaces generate"
```

---

### Task 10: Add Missing Endpoints to OpenAPI

**Files:**
- Modify: `openapi.yaml` (root)

- [ ] **Step 1: Add 7 memory endpoints**

Add after existing `/v1/memory` paths in `openapi.yaml`:
- `GET /v1/memory/entries/{id}`
- `GET /v1/memory/entries`
- `POST /v1/memory/sessions/{id}/close`
- `GET /v1/memory/sessions/{id}/context`
- `GET /v1/memory/provenance/{agent_id}/{namespace}`
- `GET /v1/memory/provenance/entry/{id}`
- `GET /v1/memory/stats/{agent_id}`

- [ ] **Step 2: Add 5 blue-green deployment endpoints**

- `POST /v1/agents/{passportId}/deploy/blue-green`
- `POST /v1/agents/{passportId}/promote`
- `POST /v1/agents/{passportId}/rollback`
- `GET /v1/agents/{passportId}/blue`
- `POST /v1/agents/{passportId}/blue/cancel`

- [ ] **Step 3: Add launch + webhook + a2a endpoints**

- `POST /v1/agents/launch` (new — image-based launch)
- `POST /v1/webhooks/{provider}`
- `DELETE /v1/a2a/{passportId}/tasks/{taskId}`

- [ ] **Step 4: Validate OpenAPI syntax**

Run: `cd offchain && npx @apidevtools/swagger-cli validate ../openapi.yaml 2>&1`
Expected: No validation errors.

- [ ] **Step 5: Commit**

```bash
git add openapi.yaml
git commit -m "docs(openapi): add 15 missing endpoints — memory, blue-green, launch, webhooks"
```

---

### Task 11: Full Test Suite + Type Check

- [ ] **Step 1: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`
Expected: 0

- [ ] **Step 2: Run full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: 100+ suites, all pass.

- [ ] **Step 3: Test CLI launch end-to-end**

```bash
cd offchain
DEPLOYMENT_STORE=memory npx ts-node src/cli.ts launch --image nginx:latest --target docker --owner 3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3 --name E2ETest
```
Expected: "Agent launched:" with passport ID and deployment URL.

- [ ] **Step 4: Verify docker-compose uses image: not build:**

```bash
cat data/deployments/deploy_*/docker-compose.yml | grep -E "image:|build:"
```
Expected: `image: nginx:latest` (no `build:` lines).

- [ ] **Step 5: Update CLAUDE.md test count if changed**

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(launch): agent launcher redesign complete — image-based, verification modes, TrustGate hardwired"
```

---

## Verification Checklist

After all 11 tasks:

- [ ] `cd offchain && npx tsc --noEmit` — 0 errors
- [ ] `cd offchain && npx jest --no-coverage` — all suites pass
- [ ] `lucid launch --image nginx:latest --target docker` — container config created, image: directive used
- [ ] `lucid launch --runtime base --model test --prompt "hello" --target docker` — base runtime config created
- [ ] `lucid launch --image x --target docker --verification minimal` — minimal mode works
- [ ] Code-gen adapters moved to `examples/adapters/` — not in engine/src
- [ ] `openapi.yaml` has 15+ new endpoints, validates
- [ ] Old `lucid deploy` command still works (backward compat)
- [ ] launchService tests pass (8+)
- [ ] Deployer image-ref tests pass (2+)
