# Deployment Control Plane Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory deployment state with durable Supabase-backed DeploymentStore + append-only event stream + strict status machine. Foundation for reconciler, leases, rollout, and fleet analytics (Phases 2-4).

**Architecture:** Bottom-up: types + state machine → InMemory store → Postgres store → refactor agentDeploymentService → migration → routes update → tests. Control plane lives in `engine/src/deployment/`, execution plane stays in `compute/`.

**Tech Stack:** TypeScript, Jest, PostgreSQL (Supabase), existing `pool` from `shared/db/pool.ts`.

**Spec:** `docs/superpowers/specs/2026-03-16-deployment-control-plane-phase1-design.md`

**Baseline:** 97 test suites, 1618 tests, 0 failures.

**Execution order:** Chunk 1 (types + state machine + stores) → Chunk 2 (refactor service + migration) → Chunk 3 (routes update + tests). Tests green at each chunk boundary.

**Hard rules:**
- Every mutation to `deployments` row increments `version`, sets `updated_at = NOW()`, sets `updated_by`.
- State transitions enforced via `assertValidTransition()` — never bypass.
- Every state change emits a deployment event via `appendEvent()`.
- `version` = optimistic lock counter. `revision` = deployment generation. Never mix.
- Callers pass current `version` for mutations. Stale version throws `StaleVersionError`.

---

## File Structure

### Files to Create (8)
| File | Responsibility |
|------|---------------|
| `offchain/packages/engine/src/deployment/control-plane/types.ts` | Deployment, DeploymentEvent, enums, input types, filters |
| `offchain/packages/engine/src/deployment/control-plane/state-machine.ts` | Transition map, canTransition, assertValidTransition, event taxonomy |
| `offchain/packages/engine/src/deployment/control-plane/store.ts` | IDeploymentStore interface |
| `offchain/packages/engine/src/deployment/control-plane/in-memory-store.ts` | InMemoryDeploymentStore (tests) |
| `offchain/packages/engine/src/deployment/control-plane/postgres-store.ts` | PostgresDeploymentStore (production) |
| `offchain/packages/engine/src/deployment/control-plane/index.ts` | Factory + barrel exports |
| `offchain/packages/engine/src/deployment/__tests__/control-plane.test.ts` | Store + state machine tests (~19) |
| `infrastructure/migrations/20260316_deployment_control_plane.sql` | Schema migration |

### Files to Modify (4)
| File | Changes |
|------|---------|
| `offchain/packages/engine/src/compute/agent/agentDeploymentService.ts` | Replace Map with IDeploymentStore, emit events on transitions |
| `offchain/packages/engine/src/compute/index.ts` | Update exports for moved service |
| `offchain/packages/gateway-lite/src/routes/agent/agentDeployRoutes.ts` | Update imports |
| `CLAUDE.md` | Add deployment control plane docs |

---

## Chunk 1: Types + State Machine + Stores

### Task 1: Types + State Machine

**Files:**
- Create: `offchain/packages/engine/src/deployment/control-plane/types.ts`
- Create: `offchain/packages/engine/src/deployment/control-plane/state-machine.ts`

- [ ] **Step 1: Create types.ts**

All type definitions from spec Sections 1, 2, 4: `Deployment`, `DeploymentEvent`, `CreateDeploymentInput`, `CreateDeploymentEvent`, `DeploymentFilters`, `DesiredState`, `ActualState`, `HealthStatus`, `DeploymentEventType`, `StaleVersionError`, `InvalidTransitionError`.

- [ ] **Step 2: Create state-machine.ts**

Per spec Section 3: `DESIRED_STATES`, `ACTUAL_STATES`, `HEALTH_STATES`, `VALID_TRANSITIONS` map, `canTransition()`, `assertValidTransition()`, event taxonomy (`LIFECYCLE_EVENTS`, `HEALTH_EVENTS`, `LEASE_EVENTS`, `CONFIG_EVENTS`, `ROLLOUT_EVENTS`).

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/deployment/
git commit -m "feat(deployment): types + state machine — Deployment, events, transitions"
```

---

### Task 2: IDeploymentStore Interface

**Files:**
- Create: `offchain/packages/engine/src/deployment/control-plane/store.ts`

- [ ] **Step 1: Create store.ts**

Per spec Section 4. Full `IDeploymentStore` interface with all methods: create, getById, getActiveByAgent, getByProviderDeploymentId, listByAgent, list, transition, updateHealth, updateProviderResources, updateLease, incrementRevision, appendEvent, getEvents, listByState, listExpiringLeases, listDrifted, getByIdempotencyKey.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/deployment/control-plane/store.ts
git commit -m "feat(deployment): IDeploymentStore interface — 18 methods"
```

---

### Task 3: InMemoryDeploymentStore

**Files:**
- Create: `offchain/packages/engine/src/deployment/control-plane/in-memory-store.ts`

- [ ] **Step 1: Implement InMemoryDeploymentStore**

Map-based implementation for tests. All 18 methods. Key behaviors:
- `create()` — UUID generation, default version=1, revision=1, actual_state='pending', idempotency check
- `transition()` — validate via `assertValidTransition()`, check version matches, increment version, set last_transition_at, if 'terminated' set terminated_at
- `updateHealth/updateProviderResources/updateLease` — all increment version, set updated_at + updated_by
- `appendEvent()` — assign UUID event_id, global sequence counter, idempotency check
- `getEvents()` — filter by deployment_id, optional type filter, order by created_at DESC
- `listDrifted()` — return where desired_state != actual_state (excluding terminated)
- `listExpiringLeases()` — return where lease_expires_at < now + withinMs

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/deployment/control-plane/in-memory-store.ts
git commit -m "feat(deployment): InMemoryDeploymentStore — full IDeploymentStore for tests"
```

---

### Task 4: PostgresDeploymentStore

**Files:**
- Create: `offchain/packages/engine/src/deployment/control-plane/postgres-store.ts`

- [ ] **Step 1: Implement PostgresDeploymentStore**

Uses `pool` from `../../shared/db/pool`. Parameterized SQL throughout. Key patterns:
- `create()` — INSERT with ON CONFLICT (idempotency_key) DO NOTHING + SELECT to return existing
- `transition()` — UPDATE ... SET actual_state=$1, version=version+1 WHERE deployment_id=$2 AND version=$3. If rowCount=0, throw StaleVersionError. Validate transition in code before SQL.
- `updateHealth()` — UPDATE SET health_status, last_health_at, version=version+1, updated_at, updated_by WHERE deployment_id
- All timestamp conversions: TIMESTAMPTZ → `.getTime()` in row mapper
- `appendEvent()` — INSERT with ON CONFLICT (idempotency_key) DO NOTHING
- `getEvents()` — SELECT with optional type filter, ORDER BY created_at DESC, LIMIT
- `listDrifted()` — SELECT WHERE desired_state != actual_state AND actual_state NOT IN ('terminated')
- `listExpiringLeases()` — SELECT WHERE lease_expires_at < NOW() + interval

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/deployment/control-plane/postgres-store.ts
git commit -m "feat(deployment): PostgresDeploymentStore — Supabase-backed production store"
```

---

### Task 5: Factory + Barrel Exports

**Files:**
- Create: `offchain/packages/engine/src/deployment/control-plane/index.ts`

- [ ] **Step 1: Create index.ts**

Singleton factory: `getDeploymentStore()` reads `DEPLOYMENT_STORE` env (default 'postgres', 'memory' for tests). `resetDeploymentStore()` for test teardown. Barrel re-exports all types, interfaces, state machine functions.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/deployment/control-plane/index.ts
git commit -m "feat(deployment): factory + barrel — getDeploymentStore()"
```

---

### Task 6: Control Plane Tests

**Files:**
- Create: `offchain/packages/engine/src/deployment/__tests__/control-plane.test.ts`

- [ ] **Step 1: Write ~19 tests**

Using `InMemoryDeploymentStore`. Tests from spec Section 8:

1. Create deployment — all fields populated
2. getActiveByAgent — returns active, ignores terminated
3. getByProviderDeploymentId — lookup works
4. listByAgent — multiple deployments per agent
5. list with filters — tenant_id, provider, state, health
6. transition valid — pending → deploying → running
7. transition invalid — running → pending throws InvalidTransitionError
8. optimistic locking — stale version throws StaleVersionError
9. append event — correct type, actor, states
10. get events — ordered, filtered by type
11. listByState — only matching state
12. listExpiringLeases — returns expiring within window
13. listDrifted — desired_state != actual_state
14. idempotency — duplicate key returns existing
15. incrementRevision — revision bumps, descriptor updates
16. provider status separate — actual_state and provider_status independent
17. updateHealth — health + last_health_at + version bumped
18. updateProviderResources — fields updated + version bumped
19. terminated transition — terminated_at set, terminated_reason stored

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/deployment/__tests__/control-plane.test.ts --no-coverage`
Expected: 19 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/deployment/__tests__/control-plane.test.ts
git commit -m "test(deployment): 19 control plane tests — store, transitions, events, locking"
```

---

## Chunk 2: Service Refactor + Migration

### Task 7: Refactor agentDeploymentService

**Files:**
- Modify: `offchain/packages/engine/src/compute/agent/agentDeploymentService.ts`

- [ ] **Step 1: Replace in-memory Map with IDeploymentStore**

Key changes:
- Constructor: accept `IDeploymentStore` parameter (lazy-loaded via factory)
- Remove: `private deployments = new Map<string, AgentDeployment>()`
- deploy():
  - After deployer succeeds, call `store.create()` with all fields
  - Call `store.transition(id, 'deploying', version)` before deployer call
  - Call `store.transition(id, 'running', version)` after success
  - Call `store.appendEvent({ type: 'created', actor: 'system', ... })`
  - Call `store.appendEvent({ type: 'succeeded', ... })`
  - If deployer fails: `store.transition(id, 'failed', version, { error })`
  - Support `idempotency_key` — check first, return existing if found
- getDeployment(): `store.getActiveByAgent(passportId)`
- listDeployments(): `store.list(filters)`
- terminateAgent():
  - Read current deployment from store
  - Call deployer.terminate()
  - `store.transition(id, 'terminated', version, { actor: 'user' })`
  - `store.appendEvent({ type: 'terminated', ... })`
- getAgentStatus(): Read from store first, optionally refresh from deployer

- [ ] **Step 2: Update compute/index.ts exports**

The service stays in `compute/agent/` for now (moving to `deployment/service/` is a future cleanup). Update barrel exports if needed.

- [ ] **Step 3: Run existing tests**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All 97 suites pass (existing tests may need minor updates for constructor change).

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/compute/agent/agentDeploymentService.ts offchain/packages/engine/src/compute/index.ts
git commit -m "refactor(deployment): agentDeploymentService uses IDeploymentStore — durable state"
```

---

### Task 8: Migration SQL

**Files:**
- Create: `infrastructure/migrations/20260316_deployment_control_plane.sql`

- [ ] **Step 1: Create migration**

Full SQL from spec Section 1 + Section 2:
- `deployments` table with all columns, CHECK constraints
- `deployment_events` table with CHECK constraint on event_type
- All indexes (9 on deployments, 3 on events)
- UNIQUE constraints (idempotency, active agent+slot)

- [ ] **Step 2: Apply to Supabase devnet**

```bash
psql "$SUPABASE_DB_URL" -f infrastructure/migrations/20260316_deployment_control_plane.sql
```

- [ ] **Step 3: Commit**

```bash
git add infrastructure/migrations/20260316_deployment_control_plane.sql
git commit -m "feat(deployment): migration — deployments + deployment_events tables"
```

---

## Chunk 3: Routes + Service Tests + Docs

### Task 9: Update Routes

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/agent/agentDeployRoutes.ts`

- [ ] **Step 1: Update route imports and calls**

The routes call `getAgentDeploymentService()` which returns the service. The service interface stays the same (deploy, status, logs, terminate, list). Only the internal implementation changed. Routes should NOT need significant changes.

Verify: the `getAgentDeploymentService()` factory still works. If the service constructor changed, update the factory.

- [ ] **Step 2: Add deployment events route**

Add a new endpoint for deployment event history:

```typescript
// GET /v1/agents/:passportId/events
agentDeployRouter.get('/v1/agents/:passportId/events', async (req, res) => {
  try {
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(req.params.passportId);
    if (!deployment) return res.status(404).json({ success: false, error: 'No active deployment' });
    const events = await store.getEvents(deployment.deployment_id, {
      limit: parseInt(req.query.limit as string || '50', 10),
    });
    return res.json({ success: true, data: events });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/gateway-lite/src/routes/agent/agentDeployRoutes.ts
git commit -m "feat(deployment): deployment events route + factory update"
```

---

### Task 10: Deployment Service Tests

**Files:**
- Create: `offchain/packages/engine/src/deployment/__tests__/deployment-service.test.ts`

- [ ] **Step 1: Write ~6 E2E tests**

Using InMemoryDeploymentStore + mock deployers:

1. Full deploy pipeline — deploy → store record exists with running state
2. Deploy emits events — 'created' + 'succeeded' in event log
3. Deploy failure — deployer throws → store has 'failed' state + 'failed' event
4. Terminate — transition to terminated + event emitted
5. Idempotent deploy — same key returns existing deployment
6. List deployments — filters work through store

- [ ] **Step 2: Run all tests**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: 99+ suites, all pass.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/deployment/__tests__/deployment-service.test.ts
git commit -m "test(deployment): 6 E2E tests — deploy, terminate, events, idempotency"
```

---

### Task 11: Update CLAUDE.md + OpenAPI

**Files:**
- Modify: `CLAUDE.md`
- Modify: `openapi.yaml`

- [ ] **Step 1: Add deployment control plane section to CLAUDE.md**

After the Anchoring section, add:

```
### Deployment Control Plane
Durable deployment state in Supabase (`deployments` + `deployment_events` tables).
Status machine: pending → deploying → running → stopped → terminated (+ failed path).
Desired state vs actual state. Provider status tracked separately.
Optimistic locking via `version` column. Deployment revision via `revision` column.
Events: append-only audit log (created, succeeded, failed, terminated, health_changed, etc.).
`IDeploymentStore` interface with Postgres + InMemory implementations.
Route: `GET /v1/agents/:passportId/events` — deployment event history.
Env: `DEPLOYMENT_STORE=postgres|memory`.
Files: `engine/src/deployment/control-plane/` (types, state-machine, store, postgres-store, in-memory-store).
```

- [ ] **Step 2: Add events endpoint to OpenAPI**

Add `GET /v1/agents/{passportId}/events` to `openapi.yaml` under Agent routes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md openapi.yaml
git commit -m "docs: deployment control plane in CLAUDE.md + OpenAPI events endpoint"
```

---

## Verification Checklist

After all 11 tasks:

- [ ] `cd offchain && npx jest --no-coverage` — all suites pass (~99+)
- [ ] `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'` — no new errors
- [ ] Server starts and `/v1/agents/deploy` works through durable store
- [ ] `GET /v1/agents/:id/events` returns deployment events
- [ ] Migration applied to Supabase devnet
- [ ] No in-memory Map for deployment state
