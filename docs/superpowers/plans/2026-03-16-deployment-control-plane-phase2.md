# Deployment Control Plane Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three focused controllers — Reconciler, LeaseManager, WebhookHandler — to close the loop between desired state and actual state. Hybrid event+polling model.

**Architecture:** Three controllers share Phase 1's `IDeploymentStore`. Webhook ingests + enqueues. Reconciler polls targeted subsets + repairs drift. LeaseManager extends time-limited providers. All use optimistic locking. Provider status mapped through one canonical function.

**Tech Stack:** TypeScript, Jest, Express, existing `IDeploymentStore` + deployers.

**Spec:** `docs/superpowers/specs/2026-03-16-deployment-control-plane-phase2-design.md`

**Baseline:** 99 test suites, 1648 tests, 0 failures.

**Execution order:** Chunk 1 (provider sync + reconciler) → Chunk 2 (lease manager + webhooks) → Chunk 3 (boot + routes + tests). Tests green at each chunk boundary.

**Hard rules:**
- Reconciler never calls `reconcileDeployment()` from webhook inline — webhook enqueues via DB event, reconciler picks up via polling.
- Provider status mapped through ONE `mapProviderStatus()` function — never ad-hoc.
- Reconciler uses provider capability flags — never assumes a provider supports stop/extend/status.
- Webhook always returns 2xx after signature validation passes — never block the provider.
- Every mutation uses optimistic locking + idempotency.

---

## File Structure

### Files to Create (14)
| File | Responsibility |
|------|---------------|
| `engine/src/deployment/reconciler/service.ts` | ReconcilerService (polling sweep + single-deployment reconcile) |
| `engine/src/deployment/reconciler/policies.ts` | ReconcilerConfig, drift repair rules, defaults |
| `engine/src/deployment/reconciler/provider-sync.ts` | syncProviderState, mapProviderStatus, ProviderCapabilities |
| `engine/src/deployment/reconciler/index.ts` | barrel + factory |
| `engine/src/deployment/lease-manager/service.ts` | LeaseManagerService (extend, warn) |
| `engine/src/deployment/lease-manager/policies.ts` | LeaseConfig, defaults |
| `engine/src/deployment/lease-manager/index.ts` | barrel + factory |
| `engine/src/deployment/webhooks/types.ts` | NormalizedProviderEvent, IProviderNormalizer |
| `engine/src/deployment/webhooks/handler.ts` | WebhookHandler (normalize, store, enqueue) |
| `engine/src/deployment/webhooks/normalizers/railway.ts` | Railway normalizer |
| `engine/src/deployment/webhooks/normalizers/akash.ts` | Akash normalizer |
| `engine/src/deployment/webhooks/normalizers/phala.ts` | Phala normalizer |
| `engine/src/deployment/webhooks/normalizers/ionet.ts` | io.net normalizer |
| `engine/src/deployment/webhooks/normalizers/nosana.ts` | Nosana normalizer |

### Files to Create (continued)
| File | Responsibility |
|------|---------------|
| `engine/src/deployment/webhooks/normalizers/index.ts` | getNormalizer factory |
| `engine/src/deployment/webhooks/index.ts` | barrel |
| `engine/src/deployment/boot.ts` | startDeploymentControlPlane / stop |
| `gateway-lite/src/routes/agent/webhookRoutes.ts` | POST /v1/webhooks/:provider |

### Files to Modify (2)
| File | Changes |
|------|---------|
| `gateway-lite/src/startup.ts` | Wire deployment control plane boot |
| `CLAUDE.md` | Update deployment section for Phase 2 |

### New Test Files (3)
| File | Expected Tests |
|------|---------------|
| `engine/src/deployment/__tests__/reconciler.test.ts` | ~9 |
| `engine/src/deployment/__tests__/lease-manager.test.ts` | ~3 |
| `engine/src/deployment/__tests__/webhooks.test.ts` | ~8 |

---

## Chunk 1: Provider Sync + Reconciler

### Task 1: Provider Sync + Status Mapping + Capabilities

**Files:**
- Create: `offchain/packages/engine/src/deployment/reconciler/provider-sync.ts`
- Create: `offchain/packages/engine/src/deployment/reconciler/policies.ts`

- [ ] **Step 1: Create provider-sync.ts**

Contains three things:
1. `ProviderCapabilities` interface + per-provider capability map
2. `mapProviderStatus(provider, rawStatus)` — canonical mapping from provider strings to Lucid state
3. `syncProviderState(deployment, store)` — calls deployer.status(), updates store

Per spec Sections 2.5, 2.6, 2.7. The mapProviderStatus function handles: FAILED/CRASHED/ERROR → failed, REMOVED/DELETED → terminated, BUILDING/DEPLOYING/STARTING → deploying, RUNNING/ACTIVE → running, STOPPED/PAUSED → stopped, unknown → no change.

Provider capabilities table: Railway (status+logs), Akash (status+scale+logs), Phala (stop+status+logs), io.net (extend+status+scale+logs), Nosana (stop+status+scale+logs), Docker (none).

- [ ] **Step 2: Create policies.ts**

`ReconcilerConfig` interface + `getDefaultReconcilerConfig()` with env var overrides. Per spec Section 2.2.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deployment): provider-sync + status mapping + capabilities + reconciler config"
```

---

### Task 2: ReconcilerService

**Files:**
- Create: `offchain/packages/engine/src/deployment/reconciler/service.ts`
- Create: `offchain/packages/engine/src/deployment/reconciler/index.ts`

- [ ] **Step 1: Create service.ts**

`ReconcilerService` per spec Section 2.1. Key methods:
- `reconcileDeployment(deploymentId)` — sync provider, check drift, check stuck, check lease
- `sweep()` — poll `listDrifted()`, `listByState('deploying')`, `listExpiringLeases()`
- `start()` / `stop()` — setInterval for polling, NO memory event bus
- `isDrifted(d)` — desired_state != actual_state (excluding terminated)
- `isStuck(d)` — actual_state == 'deploying' && last_transition_at < now - stuckTimeoutMs
- `isProviderStale(d)` — last_health_at < now - providerStalenessMs
- `isLeaseExpiring(d)` — lease_expires_at && lease_expires_at < now + leaseWarningMs
- `repairDrift(d)` — per drift rules table in spec Section 2.3, uses provider capabilities
- `repairStuck(d)` — per spec Section 2.4

Import `mapProviderStatus`, `syncProviderState`, `getProviderCapabilities` from `./provider-sync`.
Import `LeaseManagerService` for lease handling delegation.

- [ ] **Step 2: Create index.ts**

Factory: `getReconciler()`, `resetReconciler()`. Barrel exports.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deployment): ReconcilerService — drift detection, stuck repair, provider sync"
```

---

### Task 3: Reconciler Tests

**Files:**
- Create: `offchain/packages/engine/src/deployment/__tests__/reconciler.test.ts`

- [ ] **Step 1: Write ~9 tests**

Use `InMemoryDeploymentStore`. Mock deployers via jest.mock.

1. Drift: desired=running, actual=stopped → redeploy triggered (transition to deploying)
2. Drift: desired=terminated, actual=running → terminate called
3. Drift: desired=terminated, actual=failed → transition to terminated
4. Stuck deploying > timeout, provider says running → transition to running
5. Stuck deploying, provider unreachable → health set to unknown
6. Provider sync updates health → deployer.status() → store.updateHealth()
7. Provider sync failure → health set to unknown, no crash
8. Sweep processes targeted subsets → listDrifted + listByState called
9. mapProviderStatus — RUNNING→running, FAILED→failed, BUILDING→deploying, unknown→no change

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/deployment/__tests__/reconciler.test.ts --no-coverage`
Expected: 9 tests passing.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(deployment): 9 reconciler tests — drift, stuck, provider sync, sweep"
```

---

## Chunk 2: Lease Manager + Webhooks

### Task 4: LeaseManagerService

**Files:**
- Create: `offchain/packages/engine/src/deployment/lease-manager/service.ts`
- Create: `offchain/packages/engine/src/deployment/lease-manager/policies.ts`
- Create: `offchain/packages/engine/src/deployment/lease-manager/index.ts`

- [ ] **Step 1: Create service.ts + policies.ts + index.ts**

Per spec Section 3. `LeaseManagerService` with `handleExpiring(deployment)`:
- Check if remaining time < warningThresholdMs
- If canExtend (io.net only in Phase 2) → call extend, update lease, append event
- If cannot extend → append warning event
- On extend failure → append error event

`LeaseConfig` with `warningThresholdMs` (default 2h) and `extensionHours` (default 24).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(deployment): LeaseManagerService — extend io.net leases, expiry warnings"
```

---

### Task 5: Lease Manager Tests

**Files:**
- Create: `offchain/packages/engine/src/deployment/__tests__/lease-manager.test.ts`

- [ ] **Step 1: Write ~3 tests**

1. Extend io.net lease → updateLease called, lease_extended event appended
2. Extend failure → lease_expiring event with error
3. Provider without extension (Railway) → lease_expiring event with reason

- [ ] **Step 2: Commit**

```bash
git commit -m "test(deployment): 3 lease manager tests — extend, failure, unsupported"
```

---

### Task 6: Webhook Types + Normalizers

**Files:**
- Create: `offchain/packages/engine/src/deployment/webhooks/types.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/railway.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/akash.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/phala.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/ionet.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/nosana.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/normalizers/index.ts`
- Create: `offchain/packages/engine/src/deployment/webhooks/index.ts`

- [ ] **Step 1: Create types.ts**

`NormalizedProviderEvent`, `IProviderNormalizer` interfaces per spec Section 1.2-1.3.

- [ ] **Step 2: Create 5 normalizers**

Each normalizer extracts `provider_deployment_id`, `provider_status`, `provider_status_detail`, `timestamp` from the provider-specific payload format.

For Phase 2, these are best-effort implementations based on provider documentation. Railway uses GraphQL webhook payload. Akash/Phala/io.net/Nosana use REST callback bodies.

Each normalizer:
```typescript
export class RailwayNormalizer implements IProviderNormalizer {
  normalize(body: unknown, headers: Record<string, string>): NormalizedProviderEvent {
    const payload = body as any;
    return {
      provider: 'railway',
      provider_deployment_id: payload.service?.id || payload.serviceId || '',
      provider_status: payload.status || payload.deploymentStatus || 'unknown',
      provider_status_detail: payload,
      timestamp: Date.now(),
      deployment_url: payload.url || undefined,
    };
  }
}
```

- [ ] **Step 3: Create normalizer factory**

`getNormalizer(provider: string): IProviderNormalizer | null`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deployment): webhook types + 5 provider normalizers"
```

---

### Task 7: WebhookHandler + Tests

**Files:**
- Create: `offchain/packages/engine/src/deployment/webhooks/handler.ts`
- Create: `offchain/packages/engine/src/deployment/__tests__/webhooks.test.ts`

- [ ] **Step 1: Create handler.ts**

`WebhookHandler` class (not a route — just business logic). Per spec Section 1.1:
- `handle(provider, body, headers)` — normalize, lookup deployment, update store, enqueue reconcile
- Returns `{ success: boolean; warning?: string }`
- Never throws after signature validation (always returns success for provider)

- [ ] **Step 2: Write ~8 tests**

1-5. Each normalizer extracts correct fields (Railway, Akash, Phala, io.net, Nosana)
6. Handler updates store — provider_status updated after webhook
7. Handler idempotent — same event twice → one event in log
8. Handler enqueues reconcile — reconcile_requested metadata in event

Use `InMemoryDeploymentStore` with pre-created deployment records.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deployment): WebhookHandler + 8 webhook tests"
```

---

## Chunk 3: Boot + Routes + Docs

### Task 8: Boot Integration

**Files:**
- Create: `offchain/packages/engine/src/deployment/boot.ts`
- Modify: `offchain/packages/gateway-lite/src/startup.ts`

- [ ] **Step 1: Create boot.ts**

Per spec Section 5:
```typescript
export function startDeploymentControlPlane(): void
export function stopDeploymentControlPlane(): void
export function isDeploymentControlPlaneRunning(): boolean
```

Creates LeaseManager, ReconcilerService, starts reconciler polling.

- [ ] **Step 2: Wire into startup.ts**

Add to the startup sequence (after memory boot):
```typescript
if (process.env.DEPLOYMENT_CONTROL_PLANE !== 'false') {
  try {
    const { startDeploymentControlPlane } = require('../../engine/src/deployment/boot');
    startDeploymentControlPlane();
  } catch (err) {
    console.warn('[deployment] Failed to start control plane:', err);
  }
}
```

Add to graceful shutdown:
```typescript
try { const { stopDeploymentControlPlane } = require('../../engine/src/deployment/boot'); stopDeploymentControlPlane(); } catch {}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deployment): boot integration — start/stop reconciler on server lifecycle"
```

---

### Task 9: Webhook Route

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/agent/webhookRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/routes/core/lucidLayerRoutes.ts` (mount)

- [ ] **Step 1: Create webhookRoutes.ts**

```typescript
import { Router } from 'express';

export const webhookRouter = Router();

webhookRouter.post('/v1/webhooks/:provider', async (req, res) => {
  try {
    const { WebhookHandler } = await import('../../../../engine/src/deployment/webhooks/handler');
    const { getDeploymentStore } = await import('../../../../engine/src/deployment/control-plane');
    const handler = new WebhookHandler(getDeploymentStore());
    const result = await handler.handle(req.params.provider, req.body, req.headers as any);
    return res.json(result);
  } catch (error: any) {
    console.warn(`[webhook] Error:`, error.message);
    return res.json({ success: true, warning: 'accepted but processing failed' });
  }
});
```

- [ ] **Step 2: Mount in lucidLayerRoutes.ts**

```typescript
import { webhookRouter } from './webhookRoutes';
// or in agentDeployRoutes.ts — wherever makes sense
lucidLayerRouter.use('/', webhookRouter);
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deployment): POST /v1/webhooks/:provider route"
```

---

### Task 10: Update CLAUDE.md + OpenAPI

- [ ] **Step 1: Update CLAUDE.md**

Add to the Deployment Control Plane section:

```
Phase 2: Reconciler (polling every 60s, drift detection, stuck repair), LeaseManager (io.net extension),
WebhookHandler (POST /v1/webhooks/:provider). Provider status mapped through mapProviderStatus().
Provider capabilities: supportsStop/Resume/Extend/Status/Scale/Logs per provider.
```

- [ ] **Step 2: Add webhook endpoint to OpenAPI**

- [ ] **Step 3: Run full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: 100+ suites, all pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: deployment control plane Phase 2 — reconciler, leases, webhooks"
```

---

## Verification Checklist

After all 10 tasks:

- [ ] `cd offchain && npx jest --no-coverage` — all suites pass (100+)
- [ ] `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'` — no new errors
- [ ] Server starts with reconciler polling (visible in logs)
- [ ] `POST /v1/webhooks/railway` returns 200 (with mock body)
- [ ] Reconciler sweep runs on interval (visible in logs)
- [ ] ~20 new tests passing (9 reconciler + 3 lease + 8 webhook)
