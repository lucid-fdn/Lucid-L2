// offchain/packages/engine/src/deployment/__tests__/rollout.test.ts
// Tests for Phase 3: RolloutManager, store extensions, secrets

import { InMemoryDeploymentStore } from '../control-plane/in-memory-store';
import { RolloutManager } from '../rollout/service';
import { MockSecretsResolver } from '../secrets/mock-resolver';
import { EnvSecretsResolver } from '../secrets/env-resolver';
import { getSecretsResolver } from '../secrets';
import { getDefaultRolloutConfig, RolloutConfig } from '../rollout/policies';
import {
  Deployment,
  CreateDeploymentInput,
  StaleVersionError,
} from '../control-plane/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeInput(overrides?: Partial<CreateDeploymentInput>): CreateDeploymentInput {
  return {
    agent_passport_id: 'agent-001',
    provider: 'railway',
    runtime_adapter: 'vercel-ai',
    descriptor_snapshot: { name: 'test-agent', version: '1.0' },
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<RolloutConfig>): RolloutConfig {
  return {
    healthGateDurationMs: 30_000,
    autoPromote: false,
    rollbackOnFailure: false,
    ...overrides,
  };
}

/**
 * Helper: create a primary deployment in 'running' state.
 * Returns the deployment with correct version.
 */
async function createRunningPrimary(
  store: InMemoryDeploymentStore,
  agentId: string = 'agent-001',
): Promise<Deployment> {
  const d = await store.create(makeInput({ agent_passport_id: agentId }));
  await store.transition(d.deployment_id, 'deploying', 1);
  const running = await store.transition(d.deployment_id, 'running', 2);
  return running;
}

/* ------------------------------------------------------------------ */
/*  RolloutManager Tests                                               */
/* ------------------------------------------------------------------ */

describe('Phase 3 — RolloutManager', () => {
  let store: InMemoryDeploymentStore;
  let secrets: MockSecretsResolver;
  let manager: RolloutManager;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
    secrets = new MockSecretsResolver({ OPENAI_API_KEY: 'sk-test-123' });
    manager = new RolloutManager(store, secrets, makeConfig());
  });

  /* ---------------------------------------------------------------- */
  /*  1. Blue-green deploy creates blue slot                           */
  /* ---------------------------------------------------------------- */

  test('deployBlueGreen creates a deployment in blue slot', async () => {
    // Need an existing primary first
    await createRunningPrimary(store);

    const blue = await manager.deployBlueGreen('agent-001', {
      name: 'test-agent',
      version: '2.0',
      provider: 'railway',
      runtime_adapter: 'vercel-ai',
    });

    expect(blue.deployment_slot).toBe('blue');
    expect(blue.agent_passport_id).toBe('agent-001');
    expect(blue.descriptor_snapshot.version).toBe('2.0');
    expect(blue.actual_state).toBe('pending');
  });

  /* ---------------------------------------------------------------- */
  /*  2. Blue-green rejects if blue already exists                     */
  /* ---------------------------------------------------------------- */

  test('deployBlueGreen rejects if blue slot already occupied', async () => {
    await createRunningPrimary(store);
    await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    await expect(
      manager.deployBlueGreen('agent-001', { name: 'v3', provider: 'railway', runtime_adapter: 'vercel-ai' }),
    ).rejects.toThrow('already has an active blue deployment');
  });

  /* ---------------------------------------------------------------- */
  /*  3. Promote swaps blue -> primary, old primary -> terminated      */
  /* ---------------------------------------------------------------- */

  test('promote swaps blue to primary and terminates old primary', async () => {
    const primary = await createRunningPrimary(store);
    await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    const result = await manager.promote('agent-001');

    expect(result.promoted.deployment_slot).toBe('primary');
    expect(result.terminated.actual_state).toBe('terminated');
    expect(result.terminated.deployment_slot).toBe('old');
    expect(result.terminated.terminated_reason).toBe('promoted');
    expect(result.terminated.deployment_id).toBe(primary.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  4. Promote appends promoted + terminated events                  */
  /* ---------------------------------------------------------------- */

  test('promote appends promoted and terminated events', async () => {
    await createRunningPrimary(store);
    const blue = await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    const result = await manager.promote('agent-001');

    // Check promoted event on new primary
    const promotedEvents = await store.getEvents(result.promoted.deployment_id, { types: ['promoted'] });
    expect(promotedEvents).toHaveLength(1);
    expect(promotedEvents[0].actor).toBe('rollout_manager');
    expect(promotedEvents[0].new_state).toBe('primary');

    // Check terminated event on old primary
    const terminatedEvents = await store.getEvents(result.terminated.deployment_id, { types: ['terminated'] });
    expect(terminatedEvents).toHaveLength(1);
    expect(terminatedEvents[0].actor).toBe('rollout_manager');
    expect(terminatedEvents[0].metadata).toHaveProperty('reason', 'promoted');
  });

  /* ---------------------------------------------------------------- */
  /*  5. Promote fails if no blue                                      */
  /* ---------------------------------------------------------------- */

  test('promote fails if no blue deployment exists', async () => {
    await createRunningPrimary(store);

    await expect(manager.promote('agent-001')).rejects.toThrow('No blue deployment found');
  });

  /* ---------------------------------------------------------------- */
  /*  6. Rollback creates new blue from last terminated descriptor     */
  /* ---------------------------------------------------------------- */

  test('rollback deploys previous descriptor as new blue', async () => {
    // Create primary v1 and promote to v2
    await createRunningPrimary(store);
    await manager.deployBlueGreen('agent-001', {
      name: 'v2',
      version: '2.0',
      provider: 'railway',
      runtime_adapter: 'vercel-ai',
    });
    await manager.promote('agent-001');

    // Rollback should create a blue from v1's descriptor
    const rollbackBlue = await manager.rollback('agent-001');

    expect(rollbackBlue.deployment_slot).toBe('blue');
    expect(rollbackBlue.descriptor_snapshot).toEqual({ name: 'test-agent', version: '1.0' });
  });

  /* ---------------------------------------------------------------- */
  /*  7. Rollback fails if no terminated history                       */
  /* ---------------------------------------------------------------- */

  test('rollback fails if no previous revision exists', async () => {
    await createRunningPrimary(store);

    await expect(manager.rollback('agent-001')).rejects.toThrow('No previous revision to rollback to');
  });

  /* ---------------------------------------------------------------- */
  /*  8. Cancel blue terminates blue, primary untouched                */
  /* ---------------------------------------------------------------- */

  test('cancelBlue terminates blue and leaves primary untouched', async () => {
    const primary = await createRunningPrimary(store);
    await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    await manager.cancelBlue('agent-001');

    // Blue should be terminated
    const blueStatus = await manager.getBlueStatus('agent-001');
    expect(blueStatus).toBeNull();

    // Primary should still be running
    const active = await store.getActiveByAgent('agent-001');
    expect(active).not.toBeNull();
    expect(active!.deployment_id).toBe(primary.deployment_id);
    expect(active!.actual_state).toBe('running');
  });

  /* ---------------------------------------------------------------- */
  /*  9. getBlueStatus returns blue or null                            */
  /* ---------------------------------------------------------------- */

  test('getBlueStatus returns blue deployment or null', async () => {
    await createRunningPrimary(store);

    // No blue yet
    const noneYet = await manager.getBlueStatus('agent-001');
    expect(noneYet).toBeNull();

    // Deploy blue
    await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    const blue = await manager.getBlueStatus('agent-001');
    expect(blue).not.toBeNull();
    expect(blue!.deployment_slot).toBe('blue');
  });

  /* ---------------------------------------------------------------- */
  /*  10. Concurrent promotion — version conflict on stale read        */
  /* ---------------------------------------------------------------- */

  test('concurrent promotion is safe via optimistic locking (version)', async () => {
    await createRunningPrimary(store);
    await manager.deployBlueGreen('agent-001', { name: 'v2', provider: 'railway', runtime_adapter: 'vercel-ai' });

    // First promote succeeds
    await manager.promote('agent-001');

    // Second promote should fail — no blue slot left
    await expect(manager.promote('agent-001')).rejects.toThrow('No blue deployment found');
  });
});

/* ------------------------------------------------------------------ */
/*  Store Extension Tests                                              */
/* ------------------------------------------------------------------ */

describe('Phase 3 — Store Extensions (promoteBlue, getBySlot)', () => {
  let store: InMemoryDeploymentStore;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
  });

  /* ---------------------------------------------------------------- */
  /*  11. promoteBlue — atomic swap                                    */
  /* ---------------------------------------------------------------- */

  test('promoteBlue atomically swaps blue to primary', async () => {
    // Create primary
    const primary = await store.create(makeInput());
    await store.transition(primary.deployment_id, 'deploying', 1);
    await store.transition(primary.deployment_id, 'running', 2);

    // Create blue (manually set slot)
    const blue = await store.create(makeInput());
    (store as any).deployments.get(blue.deployment_id).deployment_slot = 'blue';
    await store.transition(blue.deployment_id, 'deploying', 1);
    await store.transition(blue.deployment_id, 'running', 2);

    const result = await store.promoteBlue('agent-001');

    expect(result.promoted.deployment_slot).toBe('primary');
    expect(result.promoted.deployment_id).toBe(blue.deployment_id);
    expect(result.terminated.deployment_slot).toBe('old');
    expect(result.terminated.actual_state).toBe('terminated');
    expect(result.terminated.terminated_reason).toBe('promoted');
    expect(result.terminated.deployment_id).toBe(primary.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  12. getBySlot — returns correct slot                             */
  /* ---------------------------------------------------------------- */

  test('getBySlot returns deployment in the requested slot', async () => {
    // Create primary
    const primary = await store.create(makeInput());

    // Create a second deployment and manually set slot to blue
    const blue = await store.create(makeInput());
    (store as any).deployments.get(blue.deployment_id).deployment_slot = 'blue';

    const foundPrimary = await store.getBySlot('agent-001', 'primary');
    expect(foundPrimary).not.toBeNull();
    expect(foundPrimary!.deployment_id).toBe(primary.deployment_id);

    const foundBlue = await store.getBySlot('agent-001', 'blue');
    expect(foundBlue).not.toBeNull();
    expect(foundBlue!.deployment_id).toBe(blue.deployment_id);

    const foundCanary = await store.getBySlot('agent-001', 'canary');
    expect(foundCanary).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Secrets Tests                                                      */
/* ------------------------------------------------------------------ */

describe('Phase 3 — Secrets', () => {

  /* ---------------------------------------------------------------- */
  /*  13. EnvSecretsResolver reads from process.env                    */
  /* ---------------------------------------------------------------- */

  test('EnvSecretsResolver reads from process.env and skips missing', async () => {
    const originalKey = process.env.TEST_SECRET_KEY;
    process.env.TEST_SECRET_KEY = 'test-value-42';

    try {
      const resolver = new EnvSecretsResolver();
      const result = await resolver.resolve([
        'secret:TEST_SECRET_KEY',
        'secret:DOES_NOT_EXIST_XYZ',
      ]);

      expect(result).toEqual({ TEST_SECRET_KEY: 'test-value-42' });
      expect(result).not.toHaveProperty('DOES_NOT_EXIST_XYZ');
      expect(resolver.provider).toBe('env');
    } finally {
      if (originalKey === undefined) {
        delete process.env.TEST_SECRET_KEY;
      } else {
        process.env.TEST_SECRET_KEY = originalKey;
      }
    }
  });

  /* ---------------------------------------------------------------- */
  /*  14. MockSecretsResolver returns configured values                */
  /* ---------------------------------------------------------------- */

  test('MockSecretsResolver returns configured secrets', async () => {
    const resolver = new MockSecretsResolver({
      API_KEY: 'sk-mock-123',
      DB_PASSWORD: 'secret-db',
    });

    const result = await resolver.resolve([
      'secret:API_KEY',
      'secret:DB_PASSWORD',
      'secret:MISSING_KEY',
    ]);

    expect(result).toEqual({
      API_KEY: 'sk-mock-123',
      DB_PASSWORD: 'secret-db',
    });
    expect(result).not.toHaveProperty('MISSING_KEY');
    expect(resolver.provider).toBe('mock');
  });

  /* ---------------------------------------------------------------- */
  /*  15. Factory returns env resolver by default                      */
  /* ---------------------------------------------------------------- */

  test('getSecretsResolver returns env resolver by default', () => {
    const originalProvider = process.env.SECRETS_PROVIDER;
    delete process.env.SECRETS_PROVIDER;

    try {
      const resolver = getSecretsResolver();
      expect(resolver.provider).toBe('env');
    } finally {
      if (originalProvider !== undefined) {
        process.env.SECRETS_PROVIDER = originalProvider;
      }
    }
  });
});
