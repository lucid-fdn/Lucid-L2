# Deployment Control Plane — Phase 3: Blue-Green + Rollback + Secrets

**Date:** 2026-03-16
**Status:** Design
**Author:** Kevin Wayne
**Depends on:** Phase 1 (DeploymentStore, status machine), Phase 2 (Reconciler, LeaseManager, Webhooks)

## Core Principle

> Promotion is a state transition, not a redeploy. Rollback is promotion in reverse. Secrets are references, not values. Phase 3 stays in L2 engine — deployment lifecycle belongs with the deployment controller, not the fleet supervisor.

## Context

Phase 1 built durable state + events. Phase 2 added reconciler + lease manager + webhooks. Deployments are now durable, observable, and automatically repaired. But there's no safe update path — deploying a new version terminates the old one immediately. No health gate, no rollback, no secret management.

Phase 3 adds:
- **Blue-green rollout** — deploy new version alongside old, health-gate, promote atomically
- **Rollback** — revert to previous revision using deploy history
- **Secrets abstraction** — reference secrets, resolve at deploy time, never store values

### What is NOT in scope

- Canary rollout / progressive traffic splitting (Phase 4)
- Shadow deployments (Phase 4)
- Fleet-wide rollout policies (Platform Core)
- HashiCorp Vault integration (future — interface is ready)

---

## Section 1: Blue-Green via Slot Promotion

### 1.1 Flow

```
Before:
  agent-001: primary → v1 (running)

During blue-green deploy:
  agent-001: primary → v1 (running)     ← still serving
              blue    → v2 (deploying)   ← candidate

After health gate passes:
  agent-001: primary → v2 (running)     ← promoted from blue
              [v1 terminated]            ← old primary cleaned up
```

### 1.2 deployBlueGreen()

1. Check: does agent have an active primary deployment? (required)
2. Check: does agent already have a blue deployment? (reject if yes — cancel first)
3. Deploy new version to `deployment_slot='blue'` using existing deploy pipeline
4. Blue goes through: pending → deploying → running (normal pipeline)
5. Wait for health gate: `actual_state='running'` + `health_status='healthy'` for `healthGateDurationMs`
6. If health gate passes: call `promote(agentPassportId)`
7. If health gate fails: leave blue as-is (operator can cancel or retry)

Auto-promote is optional (controlled by `RolloutConfig.autoPromote`). If false, operator calls `promote()` manually after inspecting blue.

### 1.3 Atomic promotion

```sql
BEGIN;
-- Demote current primary → terminated
UPDATE deployments
  SET deployment_slot = 'old',
      actual_state = 'terminated',
      desired_state = 'terminated',
      terminated_at = NOW(),
      terminated_reason = 'promoted',
      version = version + 1,
      updated_at = NOW(),
      updated_by = 'rollout_manager'
  WHERE agent_passport_id = $1
    AND deployment_slot = 'primary'
    AND actual_state NOT IN ('terminated');

-- Promote blue → primary
UPDATE deployments
  SET deployment_slot = 'primary',
      version = version + 1,
      updated_at = NOW(),
      updated_by = 'rollout_manager'
  WHERE deployment_id = $2
    AND deployment_slot = 'blue';
COMMIT;
```

After promotion:
- `getActiveByAgent()` returns the new version (reads primary slot)
- Append `promoted` event on new deployment
- Append `terminated` event on old deployment
- Reconciler terminates old deployment's provider resources

### 1.4 Cancel blue

If blue fails health gate or operator decides not to promote:
- Terminate blue deployment (transition to terminated)
- Primary remains untouched
- No disruption to production

---

## Section 2: Rollback

### 2.1 Mechanism

Rollback = deploy the previous revision's `descriptor_snapshot` as a new blue-green deployment, then promote.

```typescript
async rollback(agentPassportId: string): Promise<Deployment> {
  // Find most recent terminated deployment (the one we promoted away from)
  const history = await this.store.listByAgent(agentPassportId, {
    actual_state: ['terminated'],
    order_by: 'updated_at',
    order_dir: 'desc',
    limit: 1,
  });
  if (history.length === 0) throw new Error('No previous revision to rollback to');

  const previous = history[0];
  // Deploy the previous descriptor as a blue-green
  return this.deployBlueGreen(agentPassportId, previous.descriptor_snapshot);
}
```

### 2.2 Rollback characteristics

- **Not instant** — requires a full deploy cycle (provider call + health gate)
- **Safe** — goes through the same health gate as any blue-green deploy
- **Auditable** — creates new deployment record + events, full history preserved
- **Idempotent** — calling rollback twice deploys the same descriptor (dedup by idempotency_key)

### 2.3 Rollback event

Append `rolled_back` event on the new deployment with metadata pointing to the revision being restored.

---

## Section 3: Secrets Abstraction

### 3.1 Problem

Secrets currently passed as plain-text env vars through the deploy pipeline. They appear in:
- `DeploymentConfig.env_vars` (in descriptor)
- Deployer API calls (sent to provider)
- `env_vars_hash` (only hash stored, not values — this is fine)

### 3.2 ISecretsResolver interface

```typescript
export interface ISecretsResolver {
  resolve(refs: string[]): Promise<Record<string, string>>;
  readonly provider: string;
}
```

Secret refs are strings like `secret:OPENAI_API_KEY` or `vault:path/to/secret#key`.

### 3.3 Implementations

**EnvSecretsResolver** (default):
```typescript
export class EnvSecretsResolver implements ISecretsResolver {
  readonly provider = 'env';

  async resolve(refs: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const ref of refs) {
      const key = ref.replace(/^secret:/, '');
      const value = process.env[key];
      if (value) result[key] = value;
    }
    return result;
  }
}
```

**MockSecretsResolver** (tests):
```typescript
export class MockSecretsResolver implements ISecretsResolver {
  readonly provider = 'mock';
  private secrets: Record<string, string>;

  constructor(secrets: Record<string, string> = {}) {
    this.secrets = secrets;
  }

  async resolve(refs: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const ref of refs) {
      const key = ref.replace(/^secret:/, '');
      if (this.secrets[key]) result[key] = this.secrets[key];
    }
    return result;
  }
}
```

### 3.4 Factory

```typescript
export function getSecretsResolver(): ISecretsResolver {
  const provider = process.env.SECRETS_PROVIDER || 'env';
  switch (provider) {
    case 'env': return new EnvSecretsResolver();
    case 'mock': return new MockSecretsResolver();
    default: throw new Error(`Unknown SECRETS_PROVIDER: ${provider}`);
  }
}
```

### 3.5 Integration with deploy pipeline

In `agentDeploymentService.deploy()`, before calling the deployer:

```typescript
const secretRefs = descriptor.deployment_config?.secrets || [];
if (secretRefs.length > 0) {
  const resolver = getSecretsResolver();
  const secretValues = await resolver.resolve(secretRefs);
  // Merge secrets into env vars (secrets override if conflict)
  Object.assign(envVars, secretValues);
}
```

Secrets are resolved at deploy time. Never stored in the deployment record. `env_vars_hash` captures the combined hash.

### 3.6 Env config

```
SECRETS_PROVIDER=env|mock     # default: env
# Future: vault, aws-secrets-manager, gcp-secret-manager
```

---

## Section 4: RolloutManager

**File:** `engine/src/deployment/rollout/service.ts`

Owns blue-green + rollback + promotion. Separate from ReconcilerService (different concern: controlled rollout vs automated repair).

```typescript
export class RolloutManager {
  constructor(
    private store: IDeploymentStore,
    private deployService: AgentDeploymentService,
    private secretsResolver: ISecretsResolver,
    private config: RolloutConfig,
  ) {}

  /** Deploy new version to blue slot */
  async deployBlueGreen(agentPassportId: string, descriptor: Record<string, unknown>): Promise<Deployment>;

  /** Promote blue → primary (atomic slot swap) */
  async promote(agentPassportId: string): Promise<{ promoted: Deployment; terminated: Deployment }>;

  /** Rollback to previous revision (deploys as blue-green, then promotes) */
  async rollback(agentPassportId: string): Promise<Deployment>;

  /** Get blue slot deployment status */
  async getBlueStatus(agentPassportId: string): Promise<Deployment | null>;

  /** Cancel blue deployment without promoting */
  async cancelBlue(agentPassportId: string): Promise<void>;
}
```

### 4.1 RolloutConfig

```typescript
export interface RolloutConfig {
  healthGateDurationMs: number;    // default 30_000 (30s healthy before auto-promote)
  autoPromote: boolean;            // default false (manual promote by default)
  rollbackOnFailure: boolean;      // default false (future: auto-rollback if blue fails)
}

export function getDefaultRolloutConfig(): RolloutConfig {
  return {
    healthGateDurationMs: parseInt(process.env.ROLLOUT_HEALTH_GATE_MS || '30000', 10),
    autoPromote: process.env.ROLLOUT_AUTO_PROMOTE === 'true',
    rollbackOnFailure: process.env.ROLLOUT_AUTO_ROLLBACK === 'true',
  };
}
```

---

## Section 5: IDeploymentStore Additions

```typescript
// New methods for Phase 3:
promoteBlue(agentPassportId: string): Promise<{ promoted: Deployment; terminated: Deployment }>;
getBySlot(agentPassportId: string, slot: string): Promise<Deployment | null>;
```

Both must be implemented in `InMemoryDeploymentStore` and `PostgresDeploymentStore`.

`promoteBlue()` is atomic: both updates in one transaction. Appends events for both deployments.

---

## Section 6: Routes

```typescript
// Blue-green deploy
POST /v1/agents/:passportId/deploy/blue-green
  Body: { descriptor: AgentDescriptor }
  Returns: { success: true, data: Deployment }

// Promote blue → primary
POST /v1/agents/:passportId/promote
  Returns: { success: true, data: { promoted: Deployment, terminated: Deployment } }

// Rollback to previous revision
POST /v1/agents/:passportId/rollback
  Returns: { success: true, data: Deployment }

// Get blue slot status
GET /v1/agents/:passportId/blue
  Returns: { success: true, data: Deployment | null }

// Cancel blue without promoting
POST /v1/agents/:passportId/blue/cancel
  Returns: { success: true }
```

---

## Section 7: File Structure

```
engine/src/deployment/
  control-plane/       # Phase 1 (exists)
  reconciler/          # Phase 2 (exists)
  lease-manager/       # Phase 2 (exists)
  webhooks/            # Phase 2 (exists)
  boot.ts              # Phase 2 (exists)
  rollout/
    service.ts         # RolloutManager
    policies.ts        # RolloutConfig, health gate
    index.ts           # barrel + factory
  secrets/
    interface.ts       # ISecretsResolver
    env-resolver.ts    # EnvSecretsResolver (default)
    mock-resolver.ts   # MockSecretsResolver (tests)
    index.ts           # factory + barrel
```

### Modified files

| File | Changes |
|------|---------|
| `deployment/control-plane/store.ts` | Add `promoteBlue()`, `getBySlot()` |
| `deployment/control-plane/in-memory-store.ts` | Implement new methods |
| `deployment/control-plane/postgres-store.ts` | Implement new methods |
| `compute/agent/agentDeploymentService.ts` | Wire secrets resolver |
| `gateway-lite/src/routes/agent/agentDeployRoutes.ts` | Add 5 rollout routes |
| `CLAUDE.md` | Phase 3 docs |

---

## Section 8: Test Plan

### Rollout tests (`__tests__/rollout.test.ts`)

| Test | Description |
|------|-------------|
| Blue-green deploy | Blue created in blue slot, primary untouched |
| Blue-green rejects if blue exists | Error if blue slot already occupied |
| Promote | Blue→primary atomic, old primary terminated |
| Promote appends events | 'promoted' + 'terminated' events in log |
| Promote fails if no blue | Error thrown |
| Rollback | Previous descriptor redeployed as blue |
| Rollback fails if no history | Error thrown |
| Cancel blue | Blue terminated, primary untouched |
| getBlueStatus | Returns blue slot deployment or null |
| Health gate | Only promotes after healthy for N seconds |
| Concurrent promotion | Optimistic locking prevents race |

Expected: ~11 tests.

### Secrets tests (`__tests__/secrets.test.ts`)

| Test | Description |
|------|-------------|
| EnvResolver reads from process.env | Returns matching env vars |
| EnvResolver skips missing | Missing env var not in result |
| MockResolver returns configured secrets | Deterministic values |
| Factory returns env by default | SECRETS_PROVIDER unset → EnvSecretsResolver |

Expected: ~4 tests.

### Total: ~15 new tests.

---

## Section 9: Env Configuration

```bash
# Rollout
ROLLOUT_HEALTH_GATE_MS=30000       # Health gate duration (default 30s)
ROLLOUT_AUTO_PROMOTE=false          # Auto-promote after health gate (default: manual)
ROLLOUT_AUTO_ROLLBACK=false         # Auto-rollback on blue failure (future)

# Secrets
SECRETS_PROVIDER=env|mock           # default: env
```
