# Deployment Control Plane Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blue-green rollout (slot promotion), rollback (previous revision redeploy), and secrets abstraction (ISecretsResolver) to the deployment control plane.

**Architecture:** RolloutManager owns blue-green + rollback + promotion. SecretsResolver resolves secret references at deploy time. Promotion is an atomic DB transaction swapping deployment slots. All in L2 engine.

**Tech Stack:** TypeScript, Jest, existing IDeploymentStore + deployers.

**Spec:** `docs/superpowers/specs/2026-03-16-deployment-control-plane-phase3-design.md`

**Baseline:** 102 test suites, 1668 tests, 0 failures.

---

## File Structure

### Files to Create (8)
| File | Responsibility |
|------|---------------|
| `engine/src/deployment/secrets/interface.ts` | ISecretsResolver |
| `engine/src/deployment/secrets/env-resolver.ts` | EnvSecretsResolver (default) |
| `engine/src/deployment/secrets/mock-resolver.ts` | MockSecretsResolver (tests) |
| `engine/src/deployment/secrets/index.ts` | Factory + barrel |
| `engine/src/deployment/rollout/service.ts` | RolloutManager |
| `engine/src/deployment/rollout/policies.ts` | RolloutConfig |
| `engine/src/deployment/rollout/index.ts` | Factory + barrel |
| `engine/src/deployment/__tests__/rollout.test.ts` | Rollout + secrets tests (~15) |

### Files to Modify (5)
| File | Changes |
|------|---------|
| `engine/src/deployment/control-plane/store.ts` | Add promoteBlue(), getBySlot() |
| `engine/src/deployment/control-plane/in-memory-store.ts` | Implement new methods |
| `engine/src/deployment/control-plane/postgres-store.ts` | Implement new methods |
| `gateway-lite/src/routes/agent/agentDeployRoutes.ts` | Add 5 rollout routes |
| `CLAUDE.md` | Phase 3 docs |

---

## Chunk 1: Secrets + Store Extensions

### Task 1: Secrets Module

**Files:** Create all 4 files in `deployment/secrets/`

Create `interface.ts` (ISecretsResolver), `env-resolver.ts` (reads process.env), `mock-resolver.ts` (deterministic test values), `index.ts` (factory: SECRETS_PROVIDER=env|mock).

### Task 2: Store Extensions

**Files:** Modify store.ts, in-memory-store.ts, postgres-store.ts

Add to IDeploymentStore:
- `promoteBlue(agentPassportId)` → atomic: blue→primary, old primary→terminated. Returns both.
- `getBySlot(agentPassportId, slot)` → returns deployment in that slot or null

InMemory: iterate Map, swap slots. Postgres: BEGIN/COMMIT transaction per spec Section 1.3.

### Task 3: Commit

```bash
git commit -m "feat(deployment): secrets module + promoteBlue/getBySlot store methods"
```

---

## Chunk 2: RolloutManager + Tests

### Task 4: RolloutManager

**Files:** Create rollout/service.ts, rollout/policies.ts, rollout/index.ts

`RolloutManager` with 5 methods: deployBlueGreen, promote, rollback, getBlueStatus, cancelBlue.

- `deployBlueGreen()`: check no existing blue, deploy with slot='blue', optionally auto-promote after health gate
- `promote()`: call store.promoteBlue(), append events
- `rollback()`: find last terminated deployment, deploy its descriptor_snapshot as blue-green
- `getBlueStatus()`: store.getBySlot(agent, 'blue')
- `cancelBlue()`: terminate blue slot deployment

### Task 5: Tests (~15)

**File:** Create `__tests__/rollout.test.ts`

11 rollout tests + 4 secrets tests using InMemoryDeploymentStore + MockSecretsResolver.

### Task 6: Commit

```bash
git commit -m "feat(deployment): RolloutManager — blue-green, promote, rollback, 15 tests"
```

---

## Chunk 3: Routes + Docs

### Task 7: Routes

**File:** Modify agentDeployRoutes.ts

Add 5 endpoints: POST deploy/blue-green, POST promote, POST rollback, GET blue, POST blue/cancel.

### Task 8: CLAUDE.md + push

Update CLAUDE.md with Phase 3 docs. Run full test suite.

```bash
git commit -m "feat(deployment): Phase 3 routes + CLAUDE.md — blue-green, rollback, secrets"
```
