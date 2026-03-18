# Deployment Control Plane — Phase 2: Reconciler + LeaseManager + Webhooks

**Date:** 2026-03-16
**Status:** Design
**Author:** Kevin Wayne
**Depends on:** Phase 1 (DeploymentStore, DeploymentEventStore, status machine)

## Core Principle

> Events reduce latency. Polling guarantees correctness. Three focused controllers share one store. Lucid Core is the control plane — not the execution authority.

## Context

Phase 1 built the foundation: durable deployment records, append-only event stream, strict status machine, optimistic concurrency. Deployments survive restarts but have no automated lifecycle management — no drift detection, no lease renewal, no provider callbacks.

Phase 2 adds three controllers that close the loop between desired state and actual state:
- **Reconciler** — detects and repairs drift between desired and actual state
- **LeaseManager** — tracks and extends time-limited deployments
- **WebhookHandler** — ingests provider callbacks and triggers reconciliation

### What is NOT in scope

- Blue-green / rollback (Phase 3)
- Secrets abstraction (Phase 3)
- Auto-scaling / canary (Phase 4)
- Fleet analytics dashboards (Phase 4)

---

## Section 1: Webhook Ingestion

Ingestion adapter. No business logic. Normalizes provider-specific payloads into a standard shape and writes to the store.

### 1.1 Route

```typescript
// POST /v1/webhooks/:provider
webhookRouter.post('/v1/webhooks/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const normalizer = getNormalizer(provider);
    if (!normalizer) return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });

    // 1. Validate signature (per-provider, optional in Phase 2)
    // 2. Normalize payload
    const event = normalizer.normalize(req.body, req.headers);

    // 3. Look up deployment
    const store = getDeploymentStore();
    const deployment = await store.getByProviderDeploymentId(provider, event.provider_deployment_id);
    if (!deployment) return res.status(404).json({ success: false, error: 'Deployment not found' });

    // 4. Update provider status
    await store.updateProviderResources(deployment.deployment_id, {
      provider_status: event.provider_status,
      provider_status_detail: event.provider_status_detail,
    });

    // 5. Append event
    await store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'health_changed',
      actor: `webhook:${provider}`,
      previous_state: deployment.actual_state,
      new_state: deployment.actual_state,
      metadata: { provider_status: event.provider_status, raw: event.provider_status_detail },
      idempotency_key: `webhook:${provider}:${event.provider_deployment_id}:${event.timestamp}`,
    });

    // 6. Mark for reconciliation (enqueue, don't execute inline)
    await store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'health_changed',
      actor: `webhook:${provider}`,
      metadata: { reconcile_requested: true },
    });

    return res.json({ success: true });
  } catch (error: any) {
    // After signature/shape validation passes, ALWAYS return 2xx
    // Otherwise providers retry endlessly, creating webhook storms
    console.warn(`[webhook] Internal error processing ${req.params.provider} callback:`, error.message);
    return res.json({ success: true, warning: 'accepted but processing failed' });
  }
});
```

**Webhook acknowledgment rule:** Reject only on invalid payload or signature (400/401). Everything else returns 2xx — even if the deployment is unknown or reconcile fails. Log internally, never block the provider.

**Reconcile trigger:** Webhook does NOT call `reconcileDeployment()` inline. It appends a `reconcile_requested` event. The reconciler picks it up on its next poll cycle or via the deployment event bus. This decouples HTTP ingestion from reconcile execution, avoids thundering herd under webhook bursts, and enables debouncing.

### 1.2 Normalized Provider Event

```typescript
export interface NormalizedProviderEvent {
  provider: string;
  provider_deployment_id: string;
  provider_status: string;
  provider_status_detail: Record<string, unknown>;
  timestamp: number;
  deployment_url?: string;
}
```

### 1.3 Provider Normalizers

Per-provider normalizer:

```typescript
export interface IProviderNormalizer {
  normalize(body: unknown, headers: Record<string, string>): NormalizedProviderEvent;
  validateSignature?(body: unknown, headers: Record<string, string>, secret: string): boolean;
}
```

Implementations for 5 providers: Railway, Akash, Phala, io.net, Nosana. Each extracts `provider_deployment_id`, `provider_status`, and detail from the provider's specific payload format.

Factory: `getNormalizer(provider: string): IProviderNormalizer | null`

### 1.4 Signature Validation

Optional in Phase 2. Each provider has its own signature mechanism:
- Railway: webhook secret + HMAC
- Akash: none (IP allowlist recommended)
- Phala: API key header
- io.net: API key header
- Nosana: none

Env: `WEBHOOK_SECRET_RAILWAY`, `WEBHOOK_SECRET_PHALA`, etc.

---

## Section 2: Reconciler

The brain. Compares desired state vs actual state, repairs drift, retries stuck transitions, syncs with providers.

### 2.1 Hybrid trigger model

**Event-driven** (immediate): triggered by webhook handler or service call for a specific deployment.

**Polling** (safety sweep, every 30-60s): queries targeted subsets, not full-table scans.

```typescript
export class ReconcilerService {
  private interval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;

  constructor(
    private store: IDeploymentStore,
    private leaseManager: LeaseManagerService,
    private config: ReconcilerConfig,
  ) {
    this.pollIntervalMs = config.pollIntervalMs || 60_000;
  }

  // --- Immediate reconciliation (single deployment) ---
  async reconcileDeployment(deploymentId: string): Promise<void> {
    const deployment = await this.store.getById(deploymentId);
    if (!deployment) return;
    if (deployment.actual_state === 'terminated') return;

    // 1. Sync with provider if stale
    if (this.isProviderStale(deployment)) {
      await this.syncProviderState(deployment);
    }

    // 2. Check drift: desired != actual
    if (this.isDrifted(deployment)) {
      await this.repairDrift(deployment);
    }

    // 3. Check stuck transitions
    if (this.isStuck(deployment)) {
      await this.repairStuck(deployment);
    }

    // 4. Check lease
    if (this.isLeaseExpiring(deployment)) {
      await this.leaseManager.handleExpiring(deployment);
    }
  }

  // --- Safety sweep (polling, targeted subsets) ---
  async sweep(): Promise<SweepResult> {
    const result: SweepResult = { drifted: 0, stuck: 0, leases: 0, health: 0 };

    // Drifted: desired != actual
    const drifted = await this.store.listDrifted();
    for (const d of drifted) {
      await this.reconcileDeployment(d.deployment_id);
      result.drifted++;
    }

    // Stuck in deploying > timeout
    const deploying = await this.store.listByState('deploying');
    for (const d of deploying) {
      if (this.isStuck(d)) {
        await this.reconcileDeployment(d.deployment_id);
        result.stuck++;
      }
    }

    // Expiring leases
    const expiring = await this.store.listExpiringLeases(this.config.leaseWarningMs);
    for (const d of expiring) {
      await this.leaseManager.handleExpiring(d);
      result.leases++;
    }

    return result;
  }

  // --- Lifecycle ---
  start(): void {
    if (this.interval) return;
    // NOTE: Do NOT use getMemoryEventBus() — deployment has its own event bus
    // The reconciler is triggered by polling only in Phase 2.
    // Webhook handler enqueues reconcile requests via deployment_events table.
    // The sweep() picks up reconcile_requested events.
    // Phase 3+ may add a dedicated deployment event bus for lower-latency triggers.

    // Polling safety net (primary trigger in Phase 2)
    this.interval = setInterval(() => this.sweep().catch(() => {}), this.pollIntervalMs);
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}
```

### 2.2 Reconciliation policies

**File:** `reconciler/policies.ts`

```typescript
export interface ReconcilerConfig {
  pollIntervalMs: number;         // default 60_000 (60s)
  stuckTimeoutMs: number;         // default 600_000 (10 min) — deploying for too long
  providerStalenessMs: number;    // default 300_000 (5 min) — last_health_at too old
  leaseWarningMs: number;         // default 7_200_000 (2h) — warn before expiry
  maxRetries: number;             // default 3 — retry stuck transitions
}

export function getDefaultReconcilerConfig(): ReconcilerConfig {
  return {
    pollIntervalMs: parseInt(process.env.RECONCILER_POLL_MS || '60000', 10),
    stuckTimeoutMs: parseInt(process.env.RECONCILER_STUCK_TIMEOUT_MS || '600000', 10),
    providerStalenessMs: parseInt(process.env.RECONCILER_STALENESS_MS || '300000', 10),
    leaseWarningMs: parseInt(process.env.RECONCILER_LEASE_WARNING_MS || '7200000', 10),
    maxRetries: parseInt(process.env.RECONCILER_MAX_RETRIES || '3', 10),
  };
}
```

### 2.3 Drift repair rules

| Desired | Actual | Action |
|---------|--------|--------|
| running | stopped | Redeploy (transition deploying → call provider → running) |
| running | failed | Retry if attempts < maxRetries, else leave failed |
| stopped | running | Call provider.terminate() or provider.stop(), transition to stopped |
| terminated | running | Call provider.terminate(), transition to terminated |
| terminated | stopped | Transition to terminated |
| terminated | deploying | Call provider.terminate() if possible, transition to terminated |
| terminated | failed | Transition to terminated (already dead) |

### 2.4 Stuck deployment repair

If `actual_state == 'deploying'` and `last_transition_at < now - stuckTimeoutMs`:
1. Check provider status via `deployer.status(provider_deployment_id)`
2. If provider says running → transition to running
3. If provider says failed → transition to failed
4. If provider unreachable → increment retry counter, leave deploying
5. If retry counter > maxRetries → transition to failed

### 2.5 Provider sync

**File:** `reconciler/provider-sync.ts`

```typescript
export async function syncProviderState(
  deployment: Deployment,
  store: IDeploymentStore,
): Promise<void> {
  if (!deployment.provider_deployment_id) return;

  const deployer = getDeployer(deployment.provider);
  try {
    const status = await deployer.status(deployment.provider_deployment_id);
    await store.updateProviderResources(deployment.deployment_id, {
      provider_status: status.status,
      provider_status_detail: { health: status.health, uptime_ms: status.uptime_ms, url: status.url },
      deployment_url: status.url || deployment.deployment_url,
    });
    await store.updateHealth(deployment.deployment_id, mapProviderHealth(status.health), Date.now());
  } catch (err) {
    // Provider unreachable — don't crash reconciler
    await store.updateHealth(deployment.deployment_id, 'unknown', Date.now());
  }
}
```

### 2.6 Provider capability flags

Each provider declares what control-plane operations it supports:

```typescript
export interface ProviderCapabilities {
  supportsStop: boolean;      // can pause without destroying
  supportsResume: boolean;    // can restart after stop
  supportsExtend: boolean;    // can extend lease/duration
  supportsStatus: boolean;    // can query current state
  supportsScale: boolean;     // can change replica count
  supportsLogs: boolean;      // can fetch runtime logs
}
```

| Provider | stop | resume | extend | status | scale | logs |
|----------|------|--------|--------|--------|-------|------|
| Railway | No | No | N/A | Yes | Partial | Yes |
| Akash | No | No | No | Yes | Yes | Yes |
| Phala | Yes | No | No | Yes | No | Yes |
| io.net | No | No | Yes | Yes | Yes | Yes |
| Nosana | Yes | No | N/A | Yes | Yes | Yes |
| Docker | No | No | N/A | No | No | No |

The reconciler uses capabilities to decide actions — never assumes a provider supports an operation.

### 2.7 Provider status mapping layer

**File:** `reconciler/provider-sync.ts`

Single canonical mapping from provider-specific status strings to Lucid platform state:

```typescript
export function mapProviderStatus(provider: string, rawStatus: string): {
  actualState?: ActualState;
  health?: HealthStatus;
  isTerminal: boolean;
  isTransitional: boolean;
} {
  const normalized = rawStatus.toUpperCase();

  // Universal terminal states
  if (['FAILED', 'CRASHED', 'ERROR', 'DEAD'].includes(normalized)) {
    return { actualState: 'failed', health: 'unhealthy', isTerminal: true, isTransitional: false };
  }
  if (['REMOVED', 'REMOVING', 'DELETED', 'ARCHIVED'].includes(normalized)) {
    return { actualState: 'terminated', health: 'unknown', isTerminal: true, isTransitional: false };
  }

  // Universal transitional states
  if (['BUILDING', 'DEPLOYING', 'INITIALIZING', 'PROVISIONING', 'COMMITTING', 'STARTING', 'WAITING', 'PENDING'].includes(normalized)) {
    return { actualState: 'deploying', health: 'unknown', isTerminal: false, isTransitional: true };
  }

  // Universal running states
  if (['RUNNING', 'ACTIVE', 'SUCCESS', 'READY'].includes(normalized)) {
    return { actualState: 'running', health: 'healthy', isTerminal: false, isTransitional: false };
  }

  // Universal stopped states
  if (['STOPPED', 'PAUSED', 'SLEEPING', 'STOPPING'].includes(normalized)) {
    return { actualState: 'stopped', health: 'unknown', isTerminal: false, isTransitional: false };
  }

  // Unknown — don't change state
  return { health: 'unknown', isTerminal: false, isTransitional: false };
}
```

This lives in ONE place. The reconciler, webhook handler, and provider sync all use it. Never ad-hoc status parsing.

---

## Section 3: Lease Manager

Specialized controller for time-limited deployments (io.net 24h, future providers).

### 3.1 Service

```typescript
export class LeaseManagerService {
  constructor(
    private store: IDeploymentStore,
    private config: LeaseConfig,
  ) {}

  async handleExpiring(deployment: Deployment): Promise<void> {
    if (!deployment.lease_expires_at) return;

    const remaining = deployment.lease_expires_at - Date.now();
    if (remaining > this.config.warningThresholdMs) return;

    // Try to extend
    if (this.canExtend(deployment)) {
      try {
        await this.extend(deployment);
      } catch (err) {
        await this.store.appendEvent({
          deployment_id: deployment.deployment_id,
          event_type: 'lease_expiring',
          actor: 'lease_manager',
          metadata: { error: String(err), remaining_ms: remaining },
        });
      }
    } else {
      // Cannot extend — warn
      await this.store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'lease_expiring',
        actor: 'lease_manager',
        metadata: { remaining_ms: remaining, reason: 'extension_not_supported' },
      });
    }
  }

  private canExtend(deployment: Deployment): boolean {
    return ['ionet'].includes(deployment.provider);
    // Nosana is INFINITE — no lease. Railway has no time limit.
  }

  private async extend(deployment: Deployment): Promise<void> {
    const deployer = getDeployer(deployment.provider);
    // Provider-specific extension (io.net: PATCH /deployment with new duration)
    if ('extend' in deployer && typeof (deployer as any).extend === 'function') {
      await (deployer as any).extend(deployment.provider_deployment_id, this.config.extensionHours);
    }

    const newExpiry = Date.now() + this.config.extensionHours * 3600_000;
    await this.store.updateLease(deployment.deployment_id, newExpiry);
    await this.store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'lease_extended',
      actor: 'lease_manager',
      metadata: { new_expires_at: newExpiry, extension_hours: this.config.extensionHours },
    });
  }
}
```

### 3.2 Lease config

```typescript
export interface LeaseConfig {
  warningThresholdMs: number;   // default 7_200_000 (2h before expiry)
  extensionHours: number;       // default 24
}
```

### 3.3 Provider extension support

| Provider | Has lease? | Can extend? | Method |
|----------|-----------|------------|--------|
| Railway | No | N/A | Runs indefinitely |
| Akash | Yes (deposit-based) | Manual | Top up deposit |
| Phala | No | N/A | Runs until stopped |
| io.net | Yes (24h default) | Yes | PATCH /deployment with new duration |
| Nosana | No (INFINITE) | N/A | Persistent service |
| Docker | No | N/A | Local |

Phase 2 implements extension for io.net only. Others are no-ops.

---

## Section 4: Concurrency Model

Shared across all three controllers.

### Rules

1. Every mutation uses optimistic locking (`version` column)
2. Every webhook callback uses `idempotency_key` (`webhook:{provider}:{id}:{timestamp}`)
3. Every reconcile step is safe to retry (idempotent)
4. Webhook handler and reconciler can race on the same deployment — version check decides winner, loser retries with fresh read
5. Multiple reconciler instances can run concurrently — optimistic locking prevents conflicts

**Scope note:** Optimistic locking is sufficient for Phase 2. If multiple gateway instances create noisy duplicate provider checks at scale, Phase 3+ can add leader election or shard ownership. Not needed now.

### Retry pattern

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof StaleVersionError && attempt < maxAttempts) {
        continue; // Re-read and retry
      }
      throw err;
    }
  }
  throw new Error('Max retry attempts exceeded');
}
```

---

## Section 5: Boot Integration

**File:** `engine/src/deployment/boot.ts`

```typescript
export function startDeploymentControlPlane(): void {
  const store = getDeploymentStore();
  const leaseManager = new LeaseManagerService(store, getDefaultLeaseConfig());
  const reconciler = new ReconcilerService(store, leaseManager, getDefaultReconcilerConfig());
  reconciler.start();
}

export function stopDeploymentControlPlane(): void {
  // stop reconciler interval + event listeners
}
```

Wired into `gateway-lite/src/startup.ts` alongside memory boot and other background jobs.

---

## Section 6: File Structure

```
engine/src/deployment/
  control-plane/               # Phase 1 (exists)
  reconciler/
    service.ts                 # ReconcilerService (hybrid event + polling)
    policies.ts                # ReconcilerConfig, drift rules
    provider-sync.ts           # Sync actual state from provider APIs
    index.ts                   # barrel + factory
  lease-manager/
    service.ts                 # LeaseManagerService
    policies.ts                # LeaseConfig, extension rules
    index.ts                   # barrel + factory
  webhooks/
    types.ts                   # NormalizedProviderEvent, IProviderNormalizer
    handler.ts                 # WebhookHandler (route handler logic)
    validators.ts              # Signature verification per provider
    normalizers/
      railway.ts
      akash.ts
      phala.ts
      ionet.ts
      nosana.ts
      index.ts                 # getNormalizer(provider)
    index.ts                   # barrel
  boot.ts                      # startDeploymentControlPlane / stop

gateway-lite/src/routes/agent/
  webhookRoutes.ts             # POST /v1/webhooks/:provider
```

---

## Section 7: Test Plan

### Reconciler tests (`__tests__/reconciler.test.ts`)

| Test | Description |
|------|-------------|
| Drift: desired running, actual stopped | Triggers redeploy flow |
| Drift: desired terminated, actual running | Calls terminate |
| Drift: desired terminated, actual failed | Transitions to terminated |
| Stuck deploying > timeout | Checks provider, updates state |
| Stuck deploying, provider unreachable | Marks health unknown |
| Provider sync updates health | Deployer returns healthy → store updated |
| Provider sync failure safe | Deployer throws → health set to unknown |
| Sweep processes targeted subsets | listDrifted + listByState + listExpiringLeases called |
| Immediate reconcile from webhook | Event triggers reconcileDeployment() |

Expected: ~9 tests.

### Lease manager tests (`__tests__/lease-manager.test.ts`)

| Test | Description |
|------|-------------|
| Extend io.net lease | Calls extend, updates lease_expires_at, appends event |
| Extend failure | Logs error event, doesn't crash |
| Provider without extension | Returns gracefully, appends warning event |

Expected: ~3 tests.

### Webhook tests (`__tests__/webhooks.test.ts`)

| Test | Description |
|------|-------------|
| Railway normalizer | Extracts provider_deployment_id + status |
| Akash normalizer | Extracts fields |
| Phala normalizer | Extracts fields |
| io.net normalizer | Extracts fields |
| Nosana normalizer | Extracts fields |
| Handler updates store | Webhook → provider_status updated |
| Handler idempotent | Same event twice → one record |
| Handler triggers reconcile | After store update, reconcile called |

Expected: ~8 tests.

### Total: ~20 new tests.

---

## Section 8: Env Configuration

```bash
# Reconciler
RECONCILER_POLL_MS=60000                # Safety sweep interval (default 60s)
RECONCILER_STUCK_TIMEOUT_MS=600000      # Deploying stuck threshold (default 10min)
RECONCILER_STALENESS_MS=300000          # Provider state stale threshold (default 5min)
RECONCILER_LEASE_WARNING_MS=7200000     # Lease expiry warning (default 2h)
RECONCILER_MAX_RETRIES=3                # Max retry for stuck transitions

# Lease
LEASE_EXTENSION_HOURS=24                # Default extension duration

# Webhooks
WEBHOOK_SECRET_RAILWAY=                 # Railway webhook secret (optional)
```
