# Deployment Control Plane — Phase 1: Durable State + Event Stream

**Date:** 2026-03-16
**Status:** Design
**Author:** Kevin Wayne + Claude
**Depends on:** Existing agentDeploymentService, 6 deployers, 7 runtime adapters

## Core Principle

> One durable deployment record. One append-only event stream. One status machine. Central Supabase store. Desired state vs actual state. Provider status separate from platform state.

## Context

Agent deployments currently live in an in-memory `Map<string, AgentDeployment>`. State is lost on server restart. No audit trail, no versioning, no reconciliation foundation. The execution plane (6 deployers, 7 adapters) is production-grade. The control plane doesn't exist.

Phase 1 builds the control plane foundation: durable deployment records, append-only event log, strict status machine, and optimistic concurrency. Everything else (reconciler, lease manager, rollout, secrets) depends on this.

### What is NOT in scope

- Reconciler (Phase 2)
- Lease manager / auto-extend (Phase 2)
- Webhook ingestion (Phase 2)
- Blue-green / rollback (Phase 3)
- Secrets abstraction (Phase 3)
- Auto-scaling / canary (Phase 4)

---

## Section 1: Deployment Record

**Table:** `deployments`

```sql
CREATE TABLE deployments (
  deployment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id     TEXT NOT NULL,
  tenant_id             TEXT,

  -- Versioning (separate concerns)
  version               INTEGER NOT NULL DEFAULT 1,     -- optimistic locking (incremented on any write)
  revision              INTEGER NOT NULL DEFAULT 1,     -- deployment revision (incremented on redeploy/config change)

  -- Provider
  provider              TEXT NOT NULL,                   -- railway, akash, phala, ionet, nosana, docker
  runtime_adapter       TEXT NOT NULL,                   -- vercel-ai, crewai, langgraph, etc.

  -- Platform state (Lucid's view)
  desired_state         TEXT NOT NULL DEFAULT 'running'
    CHECK (desired_state IN ('running', 'stopped', 'terminated')),
  actual_state          TEXT NOT NULL DEFAULT 'pending'
    CHECK (actual_state IN ('pending', 'deploying', 'running', 'stopped', 'failed', 'terminated')),
  health_status         TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),

  -- Provider state (raw, from provider API)
  provider_status       TEXT,                            -- BUILDING, ACTIVE, RUNNING, etc. (provider-specific)
  provider_status_detail JSONB,                          -- raw provider response for debugging

  -- Provider resources
  provider_deployment_id TEXT,                           -- Railway service ID, Akash deployment ID, etc.
  deployment_url         TEXT,
  a2a_endpoint          TEXT,
  wallet_address        TEXT,

  -- Config (frozen at deploy time)
  descriptor_snapshot   JSONB NOT NULL,                  -- full AgentDescriptor at this revision
  env_vars_hash         TEXT,                            -- SHA-256 of env config (not the values)
  code_bundle_hash      TEXT,                            -- SHA-256 of generated code artifact

  -- Lifecycle timestamps
  lease_expires_at      TIMESTAMPTZ,                     -- for time-limited providers (io.net)
  last_health_at        TIMESTAMPTZ,
  last_transition_at    TIMESTAMPTZ DEFAULT NOW(),
  terminated_at         TIMESTAMPTZ,
  error                 TEXT,

  -- Audit
  created_by            TEXT NOT NULL DEFAULT 'system',  -- 'system', 'user:{id}', 'api'
  updated_by            TEXT NOT NULL DEFAULT 'system',
  idempotency_key       TEXT,                            -- prevents duplicate deploys

  -- Standard timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary queries
CREATE INDEX idx_deploy_agent ON deployments(agent_passport_id);
CREATE INDEX idx_deploy_state ON deployments(actual_state, updated_at) WHERE actual_state NOT IN ('terminated');
CREATE INDEX idx_deploy_desired ON deployments(desired_state, actual_state);
CREATE INDEX idx_deploy_health ON deployments(health_status, updated_at);
CREATE INDEX idx_deploy_lease ON deployments(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX idx_deploy_provider ON deployments(provider, actual_state);
CREATE UNIQUE INDEX idx_deploy_idempotency ON deployments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Active deployment per agent (one active at a time in Phase 1)
CREATE UNIQUE INDEX idx_deploy_active_agent ON deployments(agent_passport_id)
  WHERE actual_state NOT IN ('terminated', 'failed');
```

---

## Section 2: Deployment Event Store

**Table:** `deployment_events`

```sql
CREATE TABLE deployment_events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID NOT NULL REFERENCES deployments(deployment_id),
  sequence        BIGSERIAL,                            -- monotonic ordering for replay
  event_type      TEXT NOT NULL CHECK (event_type IN (
    -- Lifecycle
    'created', 'started', 'succeeded', 'failed', 'stopped', 'terminated', 'restarted',
    -- Health
    'health_changed',
    -- Lease
    'lease_extended', 'lease_expiring',
    -- Config
    'config_updated', 'scaled',
    -- Rollout (Phase 3 prep)
    'promoted', 'rolled_back'
  )),
  actor           TEXT NOT NULL,                         -- 'system', 'user:{id}', 'reconciler', 'health_monitor', 'lease_manager'
  previous_state  TEXT,
  new_state       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,                                  -- prevents duplicate events
  correlation_id  TEXT,                                  -- links related events across systems
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_deployment ON deployment_events(deployment_id, created_at DESC);
CREATE INDEX idx_event_type ON deployment_events(event_type, created_at DESC);
CREATE UNIQUE INDEX idx_event_idempotency ON deployment_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

---

## Section 3: Status Machine

**File:** `engine/src/deployment/control-plane/state-machine.ts`

### Desired states

```typescript
export const DESIRED_STATES = ['running', 'stopped', 'terminated'] as const;
export type DesiredState = (typeof DESIRED_STATES)[number];
```

### Actual states

```typescript
export const ACTUAL_STATES = ['pending', 'deploying', 'running', 'stopped', 'failed', 'terminated'] as const;
export type ActualState = (typeof ACTUAL_STATES)[number];
```

### Health states

```typescript
export const HEALTH_STATES = ['healthy', 'degraded', 'unhealthy', 'unknown'] as const;
export type HealthStatus = (typeof HEALTH_STATES)[number];
```

### Transition map

```typescript
const VALID_TRANSITIONS: Record<ActualState, ActualState[]> = {
  pending:     ['deploying', 'failed', 'terminated'],
  deploying:   ['running', 'failed', 'terminated'],
  running:     ['stopped', 'failed', 'terminated'],
  stopped:     ['deploying', 'terminated'],           // restart goes through deploying
  failed:      ['deploying', 'terminated'],           // retry goes through deploying
  terminated:  [],                                     // terminal state, no transitions out
};

export function canTransition(from: ActualState, to: ActualState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: ActualState, to: ActualState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
```

### Event type taxonomy

```typescript
export const LIFECYCLE_EVENTS = ['created', 'started', 'succeeded', 'failed', 'stopped', 'terminated', 'restarted'] as const;
export const HEALTH_EVENTS = ['health_changed'] as const;
export const LEASE_EVENTS = ['lease_extended', 'lease_expiring'] as const;
export const CONFIG_EVENTS = ['config_updated', 'scaled'] as const;
export const ROLLOUT_EVENTS = ['promoted', 'rolled_back'] as const;

export type DeploymentEventType =
  | (typeof LIFECYCLE_EVENTS)[number]
  | (typeof HEALTH_EVENTS)[number]
  | (typeof LEASE_EVENTS)[number]
  | (typeof CONFIG_EVENTS)[number]
  | (typeof ROLLOUT_EVENTS)[number];
```

---

## Section 4: IDeploymentStore Interface

**File:** `engine/src/deployment/control-plane/store.ts`

```typescript
export interface IDeploymentStore {
  // CRUD
  create(input: CreateDeploymentInput): Promise<Deployment>;
  getById(deploymentId: string): Promise<Deployment | null>;
  getActiveByAgent(agentPassportId: string): Promise<Deployment | null>;
  listByAgent(agentPassportId: string, filters?: DeploymentFilters): Promise<Deployment[]>;
  list(filters?: DeploymentFilters): Promise<Deployment[]>;

  // State transitions (optimistic locking)
  transition(deploymentId: string, newState: ActualState, version: number, opts?: {
    actor?: string;
    error?: string;
    providerStatus?: string;
    providerStatusDetail?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<Deployment>;

  // Health updates
  updateHealth(deploymentId: string, health: HealthStatus, lastCheckAt: number): Promise<void>;

  // Provider resource updates
  updateProviderResources(deploymentId: string, resources: {
    provider_deployment_id?: string;
    deployment_url?: string;
    a2a_endpoint?: string;
    wallet_address?: string;
    provider_status?: string;
    provider_status_detail?: Record<string, unknown>;
  }): Promise<void>;

  // Lease management
  updateLease(deploymentId: string, expiresAt: number): Promise<void>;

  // Revision (for redeploy/config changes)
  incrementRevision(deploymentId: string, newDescriptor: Record<string, unknown>, actor: string): Promise<Deployment>;

  // Events (append-only)
  appendEvent(event: CreateDeploymentEvent): Promise<DeploymentEvent>;
  getEvents(deploymentId: string, options?: { limit?: number; since?: number; types?: DeploymentEventType[] }): Promise<DeploymentEvent[]>;

  // Queries for Phase 2 (reconciler, lease manager)
  listByState(state: ActualState): Promise<Deployment[]>;
  listExpiringLeases(withinMs: number): Promise<Deployment[]>;
  listDrifted(): Promise<Deployment[]>;  // desired_state != actual_state

  // Idempotency
  getByIdempotencyKey(key: string): Promise<Deployment | null>;
}
```

Two implementations: `PostgresDeploymentStore` (production) and `InMemoryDeploymentStore` (tests).

### CreateDeploymentInput

```typescript
export interface CreateDeploymentInput {
  agent_passport_id: string;
  tenant_id?: string;
  provider: string;
  runtime_adapter: string;
  descriptor_snapshot: Record<string, unknown>;
  env_vars_hash?: string;
  code_bundle_hash?: string;
  lease_expires_at?: number;
  created_by?: string;
  idempotency_key?: string;
}
```

### DeploymentFilters

```typescript
export interface DeploymentFilters {
  tenant_id?: string;
  provider?: string;
  actual_state?: ActualState | ActualState[];
  health_status?: HealthStatus;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_dir?: 'asc' | 'desc';
}
```

---

## Section 5: Refactor agentDeploymentService

The existing `agentDeploymentService.ts` keeps its 8-stage pipeline but replaces in-memory state with `IDeploymentStore`.

### Key changes

1. **Constructor** accepts `IDeploymentStore` instead of owning a Map
2. **deploy()** — after successful deployer call, creates deployment record + 'created' event + 'succeeded' event
3. **getDeployment()** → `store.getActiveByAgent(passportId)`
4. **listDeployments()** → `store.list(filters)`
5. **terminateAgent()** → `store.transition(id, 'terminated', version)` + 'terminated' event
6. **getAgentStatus()** → reads from store, falls back to deployer.status() if stale
7. **getAgentLogs()** → unchanged (delegates to deployer)
8. **Every state change** emits a deployment event via `store.appendEvent()`

### Idempotency

`deploy()` accepts optional `idempotency_key`. If provided, checks `store.getByIdempotencyKey()` first. If deployment exists, returns it instead of creating a new one.

### Optimistic locking

`terminate()` and `transition()` pass the current `version` from the read. If another actor updated the record, the version mismatch throws `StaleVersionError`. Caller retries with fresh read.

---

## Section 6: File Structure

```
engine/src/deployment/
  control-plane/
    types.ts              # Deployment, DeploymentEvent, DeploymentFilters, enums
    state-machine.ts      # Transition map, canTransition, assertValidTransition
    store.ts              # IDeploymentStore interface
    postgres-store.ts     # PostgresDeploymentStore
    in-memory-store.ts    # InMemoryDeploymentStore (tests)
    index.ts              # factory (getDeploymentStore) + barrel exports
  service/
    agentDeploymentService.ts  # refactored (moved from compute/agent/)
  __tests__/
    control-plane.test.ts      # store CRUD, transitions, events, locking, idempotency
    deployment-service.test.ts # E2E pipeline through store
```

Note: `agentDeploymentService.ts` moves from `compute/agent/` to `deployment/service/`. The existing `compute/` keeps deployers and runtime adapters — they're execution plane, not control plane.

---

## Section 7: Migration

**File:** `infrastructure/migrations/20260316_deployment_control_plane.sql`

Creates `deployments` + `deployment_events` tables with all indexes.

Also: backfill script that reads any in-memory state (if server is running) and writes to the new tables. Not critical for Phase 1 since no production deployments exist yet.

---

## Section 8: Test Plan

### Control plane tests (`__tests__/control-plane.test.ts`)

| Test | Description |
|------|-------------|
| Create deployment | Insert + read back all fields |
| getActiveByAgent | Returns active, ignores terminated |
| listByAgent | Multiple deployments per agent (terminated + active) |
| list with filters | tenant_id, provider, state, health |
| transition valid | pending → deploying → running |
| transition invalid | running → pending throws InvalidTransitionError |
| optimistic locking | Stale version throws StaleVersionError |
| append event | Event created with correct type, actor, states |
| get events | Ordered by created_at DESC, filtered by type |
| listByState | Only returns matching state |
| listExpiringLeases | Returns deployments expiring within window |
| listDrifted | desired_state != actual_state |
| idempotency | Duplicate idempotency_key returns existing |
| incrementRevision | Revision bumps, descriptor snapshot updates |
| provider status separate | actual_state and provider_status updated independently |
| updateHealth | Health + last_health_at updated |
| updateProviderResources | Provider fields updated |
| updateLease | lease_expires_at updated |
| terminated_at | Set on transition to terminated |

Expected: ~19 tests.

### Deployment service tests (`__tests__/deployment-service.test.ts`)

| Test | Description |
|------|-------------|
| Full deploy pipeline | Deploy → store record exists with running state |
| Deploy emits events | created + succeeded events in event log |
| Terminate | Transition to terminated + event emitted |
| Status reads from store | Returns deployment from DB |
| Idempotent deploy | Same key → same deployment returned |
| List deployments | Filters work through store |

Expected: ~6 tests.

**Total: ~25 new tests.**

---

## Section 9: Env Configuration

```bash
# Deployment store (default: postgres for production)
DEPLOYMENT_STORE=postgres|memory     # memory for tests
```

No other new env vars. Uses existing Supabase connection.

---

## Section 10: What This Enables for Phase 2+

With Phase 1 complete, the foundation supports:

- **Reconciler** (Phase 2): `listDrifted()` + `listByState()` give the reconciler its work queue
- **Lease manager** (Phase 2): `listExpiringLeases()` gives the lease manager candidates
- **Webhook ingestion** (Phase 2): events land in `deployment_events`, update `provider_status`
- **Blue-green** (Phase 3): `revision` column + `descriptor_snapshot` enable version comparison
- **Rollback** (Phase 3): `deployment_events` give the history to roll back to
- **Fleet analytics** (Phase 4): `deployments` + `deployment_events` are the data source
