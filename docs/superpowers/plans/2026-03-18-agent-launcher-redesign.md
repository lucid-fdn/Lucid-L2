# Agent Launcher Redesign Implementation Plan (v2 — architect-reviewed)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace code-generation agent launcher with image-based deployment: `lucid launch --image` (BYOI) + `lucid launch --runtime base` (no-code) + verification modes. Make receipts unavoidable, TrustGate hardwired.

**Architecture:** New `engine/src/launch/` module owns agent activation (separate from compute/deploy). Split into focused units: service orchestration, passport resolution, env building, runtime config, validation. Deployers accept `ImageDeployInput` alongside `RuntimeArtifact`. Adapter deprecation is two-phase (mark optional first, move later).

**Tech Stack:** TypeScript, Express, Jest, Docker, existing IDeployer + IDeploymentStore.

**Spec:** `docs/superpowers/specs/2026-03-18-agent-launcher-redesign-design.md`

**Baseline:** 103 test suites, 1683 tests, 0 failures.

**Architect corrections applied (v2):**
1. Launch module lives in `engine/src/launch/` (not `compute/agent/`)
2. Service split into focused units (passport-resolution, env-builder, runtime-config, validators)
3. `minimal` verification is explicitly non-reputation-bearing
4. Docker deployer returns `prepared` state (not fake `running`)
5. Adapter move delayed to Phase B (after new path is stable)
6. BYOI declares `verification_capabilities` (not assumed)
7. OpenAPI distinguishes BYOI vs base-runtime modes
8. Full deployment metadata stored (image ref, runtime version, config hash, SDK version)

---

## File Structure

### Files to Create (8)
| File | Responsibility |
|------|---------------|
| `engine/src/compute/deploy/types.ts` | `ImageDeployInput` type + `isImageDeploy()` guard |
| `engine/src/launch/types.ts` | `LaunchImageInput`, `LaunchBaseRuntimeInput`, `LaunchResult`, `VerificationCapabilities` |
| `engine/src/launch/service.ts` | `launchImage()` + `launchBaseRuntime()` orchestration |
| `engine/src/launch/passport-resolution.ts` | `resolvePassport()` — create or reuse passport |
| `engine/src/launch/env-builder.ts` | `buildLucidEnvVars()` + `buildBaseRuntimeEnvVars()` |
| `engine/src/launch/validators.ts` | `validateLaunchImageInput()` + `validateBaseRuntimeInput()` |
| `engine/src/launch/index.ts` | Barrel exports |
| `engine/src/__tests__/launch.test.ts` | ~12 tests for launch flows |

### Files to Modify (9)
| File | Changes |
|------|---------|
| `engine/src/compute/deploy/IDeployer.ts` | Add `ImageDeployInput` import, extend `deploy()` union |
| `engine/src/compute/deploy/DockerDeployer.ts` | Add image-ref path, return `prepared` not `running` |
| `engine/src/compute/deploy/AkashDeployer.ts` | Fix `resolveImageRef()` to check user image first |
| `engine/src/compute/deploy/IoNetDeployer.ts` | Don't override entrypoint for BYOI |
| `engine/src/compute/deploy/NosanaDeployer.ts` | Don't override entrypoint for BYOI |
| `engine/src/compute/deploy/index.ts` | Re-export `ImageDeployInput` |
| `engine/src/compute/runtime/index.ts` | Make adapter loading optional (try/catch, graceful) |
| `src/cli.ts` | Add `launch` command with `--image`, `--runtime`, `--verification` |
| `openapi.yaml` | Add 15 missing endpoints + `POST /v1/agents/launch` |

### Files to Move (Phase B — AFTER new path is stable)
| File | Future Location |
|------|----------------|
| 7 adapter classes + imageBuilder + descriptorBuilder | `examples/adapters/` |
| `runtimeAdapters.test.ts` | `examples/adapters/` |

**Phase A (this plan):** Mark adapters deprecated in runtime/index.ts, make loading optional. Do NOT move yet.
**Phase B (separate PR after stabilization):** Move to examples/ once launch path is proven stable.

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
  /** Verification mode */
  verification: 'full' | 'minimal';
}

/** Type guard: is this an image deploy or a code-gen artifact? */
export function isImageDeploy(input: unknown): input is ImageDeployInput {
  return typeof input === 'object' && input !== null && 'image' in input && typeof (input as any).image === 'string';
}
```

- [ ] **Step 2: Update IDeployer.ts — extend deploy() signature**

In `offchain/packages/engine/src/compute/deploy/IDeployer.ts`, add import at top:
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

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deploy): add ImageDeployInput type for image-based deployment"
```

---

### Task 2: Fix DockerDeployer — Add Image-Ref Path

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/DockerDeployer.ts`

- [ ] **Step 1: Update deploy() signature and add image-ref branch**

Add imports:
```typescript
import { isImageDeploy } from './types';
import type { ImageDeployInput } from './types';
```

Change method signature (line 22) to accept union type. At top of method body, add:
```typescript
if (isImageDeploy(input)) {
  return this.deployImage(input, config, passportId);
}
const artifact = input; // existing code-gen path continues
```

- [ ] **Step 2: Add deployImage() private method**

**IMPORTANT:** Return status `prepared`, NOT `running`. Docker deployer generates config but does not start containers. Returning `running` would poison the control plane.

```typescript
private async deployImage(input: ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
  const deployId = `deploy_${crypto.randomBytes(6).toString('hex')}`;
  const deployDir = path.join(this.outputDir, deployId);
  fs.mkdirSync(deployDir, { recursive: true });

  const port = input.port || 3100;
  const envLines = Object.entries(input.env_vars)
    .map(([k, v]) => `      - ${k}=${v}`).join('\n');

  // docker-compose with image: directive (NOT build: .)
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
    verification: input.verification,
    created_at: new Date().toISOString(),
  }, null, 2));

  this.deployments.set(deployId, { dir: deployDir, status: 'prepared', passportId, createdAt: Date.now() });

  logger.info(`[Deploy] Docker image deployment prepared: ${deployDir}`);
  logger.info(`[Deploy]   To start: cd ${deployDir} && docker compose up -d`);

  return {
    success: true,
    deployment_id: deployId,
    target: 'docker',
    url: `http://localhost:${port}`,
    metadata: { status: 'prepared', requires_manual_start: true },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deploy): DockerDeployer image-ref path — returns prepared, not running"
```

---

### Task 3: Fix AkashDeployer — Check User Image First

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/AkashDeployer.ts`

- [ ] **Step 1: Update deploy() signature and fix resolveImageRef() (line 333)**

Add imports. Change `resolveImageRef()` to check `ImageDeployInput.image` first:

```typescript
private async resolveImageRef(input: RuntimeArtifact | ImageDeployInput, passportId: string): Promise<string> {
  if (isImageDeploy(input)) {
    return input.image;
  }
  try {
    const builder = getImageBuilder();
    const ref = await builder.build(input, passportId);
    return ref.fullRef;
  } catch {
    return 'node:20-slim';
  }
}
```

Also update `generateSDL()` to handle env_vars from either type:
```typescript
const envVars = isImageDeploy(input) ? input.env_vars : (input as RuntimeArtifact).env_vars;
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix(deploy): AkashDeployer checks user image before imageBuilder fallback"
```

---

### Task 4: Fix IoNetDeployer + NosanaDeployer + Railway + Phala Signatures

**Files:**
- Modify: `offchain/packages/engine/src/compute/deploy/IoNetDeployer.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/NosanaDeployer.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/RailwayDeployer.ts`
- Modify: `offchain/packages/engine/src/compute/deploy/PhalaDeployer.ts`

- [ ] **Step 1: Fix IoNetDeployer entrypoint (line 116)**

```typescript
entrypoint: isImageDeploy(input)
  ? (input.entrypoint || undefined)
  : (input.entrypoint ? ['node', input.entrypoint] : ['node', 'index.js']),
```

- [ ] **Step 2: Fix NosanaDeployer entrypoint (line 98)**

```typescript
cmd: isImageDeploy(input)
  ? (input.entrypoint || undefined)
  : (input.entrypoint ? ['node', input.entrypoint] : ['node', 'index.js']),
```

- [ ] **Step 3: Update all 4 deploy() signatures to accept union type**

- [ ] **Step 4: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep "error TS" | head -10`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(deploy): all 6 deployers accept ImageDeployInput, BYOI entrypoint preserved"
```

---

### Task 5: Deployer Image-Ref Tests

**Files:**
- Modify: `offchain/packages/engine/src/__tests__/deployers.test.ts`

- [ ] **Step 1: Add image-ref tests**

```typescript
import { isImageDeploy } from '../compute/deploy/types';
import type { ImageDeployInput } from '../compute/deploy/types';

describe('Image-based deployment', () => {
  const imageInput: ImageDeployInput = {
    image: 'ghcr.io/test/my-agent:v1',
    env_vars: { LUCID_API_URL: 'http://localhost:3001', LUCID_PASSPORT_ID: 'test_passport' },
    port: 8080,
    verification: 'full',
  };

  test('DockerDeployer deploys image ref with image: directive', async () => {
    const deployer = getDeployer('docker');
    const result = await deployer.deploy(imageInput, { target: { type: 'docker' }, restart_policy: 'on-failure' }, 'test_passport');
    expect(result.success).toBe(true);
    expect(result.url).toContain('8080');
    expect(result.metadata?.status).toBe('prepared');
    expect(result.metadata?.requires_manual_start).toBe(true);
  });

  test('isImageDeploy correctly identifies image vs artifact', () => {
    expect(isImageDeploy(imageInput)).toBe(true);
    expect(isImageDeploy({ files: new Map(), entrypoint: 'x', adapter: 'y', dependencies: {}, env_vars: {} })).toBe(false);
  });

  test('DockerDeployer image deploy generates compose with image: not build:', async () => {
    const deployer = getDeployer('docker');
    const result = await deployer.deploy(imageInput, { target: { type: 'docker' }, restart_policy: 'on-failure' }, 'test_passport');
    const dir = path.join(process.cwd(), 'data', 'deployments', result.deployment_id);
    const compose = fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('image: ghcr.io/test/my-agent:v1');
    expect(compose).not.toContain('build:');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/__tests__/deployers.test.ts --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(deploy): image-ref deployment tests — DockerDeployer + isImageDeploy"
```

---

## Chunk 2: Launch Module + CLI

### Task 6: Launch Module — Types + Validators + Helpers

**Files:**
- Create: `offchain/packages/engine/src/launch/types.ts`
- Create: `offchain/packages/engine/src/launch/validators.ts`
- Create: `offchain/packages/engine/src/launch/passport-resolution.ts`
- Create: `offchain/packages/engine/src/launch/env-builder.ts`

- [ ] **Step 1: Create launch/types.ts**

```typescript
// offchain/packages/engine/src/launch/types.ts

import type { DeploymentTargetType } from '../compute/agent/agentDescriptor';

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
  runtime_version?: string;
}

export interface LaunchResult {
  success: boolean;
  passport_id?: string;
  deployment_id?: string;
  deployment_url?: string;
  verification_mode?: 'full' | 'minimal';
  config_hash?: string;
  /** BYOI capability declaration — only `full` is reputation-bearing */
  reputation_eligible: boolean;
  error?: string;
}

/** What a BYOI agent actually supports (declared, not assumed) */
export interface VerificationCapabilities {
  receipts: boolean;
  memory: boolean;
  payment: boolean;
  tool_gateway: boolean;
}

export const BASE_RUNTIME_IMAGE = 'ghcr.io/lucid-fdn/agent-runtime';
export const DEFAULT_RUNTIME_VERSION = 'v1.0.0';
export const DEFAULT_PORT = 3100;
```

- [ ] **Step 2: Create launch/validators.ts**

```typescript
// offchain/packages/engine/src/launch/validators.ts

import type { LaunchImageInput, LaunchBaseRuntimeInput } from './types';

export function validateLaunchImageInput(input: LaunchImageInput): string | null {
  if (!input.image || typeof input.image !== 'string') return 'image is required';
  if (!input.target) return 'target is required';
  if (!input.owner || typeof input.owner !== 'string') return 'owner is required';
  if (!input.name || typeof input.name !== 'string') return 'name is required';
  if (input.verification && !['full', 'minimal'].includes(input.verification)) {
    return 'verification must be "full" or "minimal"';
  }
  return null;
}

export function validateBaseRuntimeInput(input: LaunchBaseRuntimeInput): string | null {
  if (!input.model || typeof input.model !== 'string') return 'model is required';
  if (!input.prompt || typeof input.prompt !== 'string') return 'prompt is required';
  if (!input.target) return 'target is required';
  if (!input.owner || typeof input.owner !== 'string') return 'owner is required';
  return null;
}
```

- [ ] **Step 3: Create launch/passport-resolution.ts**

```typescript
// offchain/packages/engine/src/launch/passport-resolution.ts

import { getPassportManager } from '../identity/passport/passportManager';
import { logger } from '../shared/lib/logger';

/** Create a new agent passport or verify an existing one */
export async function resolvePassport(opts: {
  passport_id?: string;
  owner: string;
  name: string;
  target: string;
}): Promise<{ ok: true; passport_id: string } | { ok: false; error: string }> {
  if (opts.passport_id) {
    return { ok: true, passport_id: opts.passport_id };
  }

  const pm = getPassportManager();
  const result = await pm.createPassport({
    type: 'agent',
    owner: opts.owner,
    name: opts.name,
    metadata: {
      agent_config: {
        system_prompt: `Agent: ${opts.name}`,
        model_passport_id: 'user-provided',
      },
      deployment_config: {
        target: { type: opts.target },
      },
    },
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: `Passport creation failed: ${result.error}` };
  }

  logger.info(`[Launch] Passport created: ${result.data.passport_id}`);
  return { ok: true, passport_id: result.data.passport_id };
}
```

- [ ] **Step 4: Create launch/env-builder.ts**

```typescript
// offchain/packages/engine/src/launch/env-builder.ts

/** Build Lucid env vars injected into every launched container */
export function buildLucidEnvVars(opts: {
  passportId: string;
  verification: 'full' | 'minimal';
  extra?: Record<string, string>;
}): Record<string, string> {
  const lucidApiUrl = process.env.LUCID_API_URL || `http://localhost:${process.env.PORT || 3001}`;
  return {
    LUCID_API_URL: lucidApiUrl,
    LUCID_PASSPORT_ID: opts.passportId,
    LUCID_VERIFICATION_MODE: opts.verification,
    TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
    ...(opts.extra || {}),
  };
}

/** Build env vars specific to the base runtime image */
export function buildBaseRuntimeEnvVars(opts: {
  model: string;
  prompt: string;
  tools: string[];
  configHash: string;
}): Record<string, string> {
  return {
    LUCID_MODEL: opts.model,
    LUCID_PROMPT: opts.prompt,
    LUCID_TOOLS: opts.tools.join(','),
    LUCID_CONFIG_HASH: opts.configHash,
    TRUSTGATE_URL: process.env.TRUSTGATE_URL || '',
    TRUSTGATE_API_KEY: process.env.TRUSTGATE_API_KEY || '',
    MCPGATE_URL: process.env.MCPGATE_URL || '',
  };
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(launch): types, validators, passport-resolution, env-builder modules"
```

---

### Task 7: Launch Service — Orchestration

**Files:**
- Create: `offchain/packages/engine/src/launch/service.ts`
- Create: `offchain/packages/engine/src/launch/index.ts`

- [ ] **Step 1: Create launch/service.ts**

```typescript
// offchain/packages/engine/src/launch/service.ts

import crypto from 'crypto';
import { logger } from '../shared/lib/logger';
import { getDeployer } from '../compute/deploy';
import { getDeploymentStore } from '../deployment/control-plane';
import { resolvePassport } from './passport-resolution';
import { buildLucidEnvVars, buildBaseRuntimeEnvVars } from './env-builder';
import { validateLaunchImageInput, validateBaseRuntimeInput } from './validators';
import type { ImageDeployInput } from '../compute/deploy/types';
import type {
  LaunchImageInput,
  LaunchBaseRuntimeInput,
  LaunchResult,
} from './types';
import { BASE_RUNTIME_IMAGE, DEFAULT_RUNTIME_VERSION, DEFAULT_PORT } from './types';

/**
 * Launch a user-provided Docker image (BYOI).
 *
 * minimal verification = NOT reputation-bearing.
 * full verification = reputation-eligible (requires SDK integration).
 */
export async function launchImage(input: LaunchImageInput): Promise<LaunchResult> {
  const store = getDeploymentStore();
  const verification = input.verification || 'full';
  const reputationEligible = verification === 'full';

  logger.info(`[Launch] Image: ${input.name} → ${input.target} (verification=${verification})`);

  // 1. Validate
  const validationError = validateLaunchImageInput(input);
  if (validationError) return { success: false, error: validationError, reputation_eligible: false };

  try {
    // 2. Resolve passport
    const passport = await resolvePassport({
      passport_id: input.passport_id,
      owner: input.owner,
      name: input.name,
      target: input.target,
    });
    if (!passport.ok) return { success: false, error: passport.error, reputation_eligible: false };

    // 3. Create deployment record (pending)
    const deployment = await store.create({
      agent_passport_id: passport.passport_id,
      provider: input.target,
      runtime_adapter: 'user-image',
      descriptor_snapshot: {
        image: input.image,
        verification,
        reputation_eligible: reputationEligible,
        port: input.port || DEFAULT_PORT,
      },
      created_by: 'launch-service',
    });
    logger.info(`[Launch] Deployment record: ${deployment.deployment_id}`);

    // 4. Transition to deploying
    await store.transition(deployment.deployment_id, 'deploying', deployment.version, { actor: 'launch-service' });

    // 5. Build image deploy input
    const envVars = buildLucidEnvVars({
      passportId: passport.passport_id,
      verification,
      extra: input.env_vars,
    });

    const imageInput: ImageDeployInput = {
      image: input.image,
      env_vars: envVars,
      port: input.port || DEFAULT_PORT,
      verification,
      ...(input.registry_auth ? { registry_auth: input.registry_auth } : {}),
    };

    // 6. Deploy
    const deployer = getDeployer(input.target);
    const result = await deployer.deploy(imageInput, {
      target: { type: input.target },
      restart_policy: 'on_failure',
    }, passport.passport_id);

    if (result.success) {
      await store.updateProviderResources(deployment.deployment_id, {
        provider_deployment_id: result.deployment_id,
        deployment_url: result.url || undefined,
      });
      // Docker returns 'prepared' (not actually running). Other providers return running.
      const newState = result.metadata?.status === 'prepared' ? 'deploying' : 'running';
      const updated = await store.getById(deployment.deployment_id);
      await store.transition(deployment.deployment_id, newState, updated!.version, { actor: 'launch-service' });
      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: newState === 'running' ? 'succeeded' : 'started',
        actor: 'launch-service',
        metadata: { image: input.image, verification, target: input.target },
      });

      logger.info(`[Launch] Agent launched: ${passport.passport_id} → ${result.url || 'pending'} (${newState})`);
      return {
        success: true,
        passport_id: passport.passport_id,
        deployment_id: result.deployment_id,
        deployment_url: result.url,
        verification_mode: verification,
        reputation_eligible: reputationEligible,
      };
    } else {
      const updated = await store.getById(deployment.deployment_id);
      await store.transition(deployment.deployment_id, 'failed', updated!.version, {
        actor: 'launch-service',
        error: result.error,
      });
      return { success: false, error: result.error, reputation_eligible: false };
    }
  } catch (err: any) {
    logger.error(`[Launch] Error: ${err.message}`);
    return { success: false, error: err.message, reputation_eligible: false };
  }
}

/**
 * Launch the pre-built Lucid base runtime (no-code).
 * Always full verification. Always reputation-eligible.
 * TrustGate hardwired inside the image.
 */
export async function launchBaseRuntime(input: LaunchBaseRuntimeInput): Promise<LaunchResult> {
  const validationError = validateBaseRuntimeInput(input);
  if (validationError) return { success: false, error: validationError, reputation_eligible: false };

  const version = input.runtime_version || DEFAULT_RUNTIME_VERSION;
  const image = `${BASE_RUNTIME_IMAGE}:${version}`;
  const configHash = crypto.createHash('sha256')
    .update(JSON.stringify({ model: input.model, prompt: input.prompt, tools: input.tools || [], version }))
    .digest('hex')
    .slice(0, 16);

  logger.info(`[Launch] Base runtime: ${image} (config_hash=${configHash})`);

  const baseEnvVars = buildBaseRuntimeEnvVars({
    model: input.model,
    prompt: input.prompt,
    tools: input.tools || [],
    configHash,
  });

  const result = await launchImage({
    image,
    target: input.target,
    owner: input.owner,
    name: input.name || `base-${input.model}`,
    verification: 'full', // always full for base runtime
    env_vars: baseEnvVars,
  });

  return { ...result, config_hash: configHash };
}
```

- [ ] **Step 2: Create launch/index.ts**

```typescript
// offchain/packages/engine/src/launch/index.ts
export { launchImage, launchBaseRuntime } from './service';
export type { LaunchImageInput, LaunchBaseRuntimeInput, LaunchResult, VerificationCapabilities } from './types';
export { resolvePassport } from './passport-resolution';
export { buildLucidEnvVars, buildBaseRuntimeEnvVars } from './env-builder';
export { validateLaunchImageInput, validateBaseRuntimeInput } from './validators';
```

- [ ] **Step 3: Run type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep "error TS" | head -10`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(launch): service orchestration + barrel exports — launchImage, launchBaseRuntime"
```

---

### Task 8: Launch Tests

**Files:**
- Create: `offchain/packages/engine/src/__tests__/launch.test.ts`

- [ ] **Step 1: Write ~12 tests**

Use `DEPLOYMENT_STORE=memory` in test setup. Test:
1. `launchImage` — deploys to docker, returns success
2. `launchImage` — minimal verification returns `reputation_eligible: false`
3. `launchImage` — full verification returns `reputation_eligible: true`
4. `launchImage` — reuses existing passport_id
5. `launchImage` — custom port passed through
6. `launchImage` — custom env_vars merged with Lucid vars
7. `launchImage` — invalid input returns validation error
8. `launchImage` — invalid owner returns passport error
9. `launchBaseRuntime` — deploys with model+prompt
10. `launchBaseRuntime` — always full verification (reputation_eligible: true)
11. `launchBaseRuntime` — returns config_hash
12. `launchBaseRuntime` — missing model returns validation error

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/__tests__/launch.test.ts --no-coverage`
Expected: 12 tests passing.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(launch): 12 tests — image, base runtime, verification modes, reputation eligibility"
```

---

### Task 9: CLI — Add `launch` Command

**Files:**
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add launch command**

**IMPORTANT:** Insert BEFORE `program.parse(process.argv)` (line 255). If appended after parse(), the command is unreachable.

Add the `launch` command with `--image` and `--runtime` flags. Use `launchImage` and `launchBaseRuntime` from `../packages/engine/src/launch`.

- [ ] **Step 2: Test CLI manually**

```bash
cd offchain && DEPLOYMENT_STORE=memory npx ts-node src/cli.ts launch \
  --image nginx:latest --target docker \
  --owner 3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3 \
  --name TestLaunch
```
Expected: "Agent launched:" with passport, deployment ID.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cli): add 'lucid launch' — image-based + base runtime activation"
```

---

## Chunk 3: Adapter Deprecation + OpenAPI + Full Test

### Task 10: Make Runtime Adapter Loading Optional

**Files:**
- Modify: `offchain/packages/engine/src/compute/runtime/index.ts`

- [ ] **Step 1: Wrap each require() in try/catch**

In `loadAdapters()`, wrap each adapter `require()` in try/catch. Log debug warning for missing adapters. Do NOT crash if adapters are missing — they're being deprecated.

- [ ] **Step 2: Add deprecation notice to each adapter file header**

Add to each of the 7 adapter files:
```typescript
/** @deprecated Use lucid launch --image or --runtime base instead. Will move to examples/. */
```

- [ ] **Step 3: Run full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All tests pass (adapters still present, just optional).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(runtime): make adapter loading optional, mark adapters deprecated"
```

---

### Task 11: Add Missing Endpoints to OpenAPI

**Files:**
- Modify: `openapi.yaml` (root)

- [ ] **Step 1: Add 7 memory endpoints**

- [ ] **Step 2: Add 5 blue-green deployment endpoints**

- [ ] **Step 3: Add launch endpoint with two modes**

```yaml
/v1/agents/launch:
  post:
    summary: Launch an agent in the Lucid verified network
    requestBody:
      content:
        application/json:
          schema:
            oneOf:
              - $ref: '#/components/schemas/LaunchImageRequest'
              - $ref: '#/components/schemas/LaunchBaseRuntimeRequest'
            discriminator:
              propertyName: mode
              mapping:
                image: '#/components/schemas/LaunchImageRequest'
                base-runtime: '#/components/schemas/LaunchBaseRuntimeRequest'
```

With separate schemas for BYOI (`mode: "image"`) vs base runtime (`mode: "base-runtime"`).

- [ ] **Step 4: Add webhook + a2a endpoints**

- [ ] **Step 5: Validate OpenAPI**

Run: `npx @apidevtools/swagger-cli validate openapi.yaml 2>&1`

- [ ] **Step 6: Commit**

```bash
git commit -m "docs(openapi): add 16 missing endpoints — memory, blue-green, launch, webhooks"
```

---

### Task 12: Full Test Suite + Type Check + E2E

- [ ] **Step 1: Type-check**

Run: `cd offchain && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`
Expected: 0

- [ ] **Step 2: Full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: 103+ suites, all pass.

- [ ] **Step 3: E2E CLI launch**

```bash
DEPLOYMENT_STORE=memory npx ts-node src/cli.ts launch \
  --image nginx:latest --target docker \
  --owner 3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3 \
  --name E2ETest
```

- [ ] **Step 4: Verify docker-compose uses image: not build:**

```bash
cat data/deployments/deploy_*/docker-compose.yml | grep -E "image:|build:"
```

- [ ] **Step 5: Final commit**

```bash
git commit -m "feat(launch): agent launcher redesign complete — image-based, verification modes"
```

---

## Verification Checklist

After all 12 tasks:

- [ ] `cd offchain && npx tsc --noEmit` — 0 errors
- [ ] `cd offchain && npx jest --no-coverage` — all suites pass
- [ ] `lucid launch --image nginx:latest --target docker` — prepared, image: directive used
- [ ] `lucid launch --runtime base --model test --prompt "hello" --target docker` — works
- [ ] `lucid launch --image x --verification minimal` — reputation_eligible: false
- [ ] `lucid launch --image x --verification full` — reputation_eligible: true
- [ ] launch/service.ts is in `engine/src/launch/` (not compute/agent/)
- [ ] Adapters marked deprecated, loading optional (still present, not moved yet)
- [ ] `openapi.yaml` has 16 new endpoints, validates
- [ ] Old `lucid deploy` still works (backward compat)
- [ ] Launch tests pass (12+)
- [ ] Deployer image-ref tests pass (3+)
- [ ] Docker deployer returns `prepared` not `running` for image deploys

---

## Phase B (Separate PR — after stabilization)

After the launch path is proven stable in production:

- [ ] Move 7 adapter classes to `examples/adapters/`
- [ ] Move `imageBuilder.ts` to `examples/adapters/`
- [ ] Move `descriptorBuilder.ts` to `examples/adapters/`
- [ ] Move `runtimeAdapters.test.ts` to `examples/adapters/`
- [ ] Create `examples/adapters/README.md`
- [ ] Update `runtime/index.ts` to not load any adapters by default
- [ ] Update `agentDeploymentService.deployAgent()` to return clear deprecation message
