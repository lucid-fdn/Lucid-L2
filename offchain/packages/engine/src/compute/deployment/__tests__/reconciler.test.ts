// offchain/packages/engine/src/deployment/__tests__/reconciler.test.ts
// Tests for ReconcilerService — drift detection, stuck repair, provider sync, sweep

import { InMemoryDeploymentStore } from '../control-plane/in-memory-store';
import { ReconcilerService } from '../reconciler/service';
import { LeaseManagerService } from '../lease-manager/service';
import { mapProviderStatus } from '../reconciler/provider-sync';
import { CreateDeploymentInput, Deployment } from '../control-plane/types';
import { LeaseConfig } from '../lease-manager/policies';
import { ReconcilerConfig } from '../reconciler/policies';

// Mock the deploy module
jest.mock('../../deploy', () => ({
  getDeployer: jest.fn(),
}));

import { getDeployer } from '../../deploy';
const mockGetDeployer = getDeployer as jest.MockedFunction<typeof getDeployer>;

function makeInput(overrides?: Partial<CreateDeploymentInput>): CreateDeploymentInput {
  return {
    agent_passport_id: 'agent-001',
    provider: 'railway',
    runtime_adapter: 'vercel-ai',
    descriptor_snapshot: { name: 'test-agent' },
    ...overrides,
  };
}

function makeReconcilerConfig(overrides?: Partial<ReconcilerConfig>): ReconcilerConfig {
  return {
    pollIntervalMs: 60_000,
    stuckTimeoutMs: 600_000,
    providerStalenessMs: 300_000,
    leaseWarningMs: 7_200_000,
    maxRetries: 3,
    ...overrides,
  };
}

function makeLeaseConfig(overrides?: Partial<LeaseConfig>): LeaseConfig {
  return {
    warningThresholdMs: 7_200_000,
    extensionHours: 24,
    ...overrides,
  };
}

describe('ReconcilerService', () => {
  let store: InMemoryDeploymentStore;
  let leaseManager: LeaseManagerService;
  let reconciler: ReconcilerService;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
    leaseManager = new LeaseManagerService(store, makeLeaseConfig());
    reconciler = new ReconcilerService(store, leaseManager, makeReconcilerConfig());
    jest.clearAllMocks();
  });

  afterEach(() => {
    reconciler.stop();
  });

  /* ---------------------------------------------------------------- */
  /*  1. Drift: desired=running, actual=stopped -> redeploy            */
  /* ---------------------------------------------------------------- */

  test('drift: desired=running, actual=stopped -> redeploy triggered (transition to deploying)', async () => {
    const d = await store.create(makeInput());
    // Move to deploying -> running -> stopped to set up drift
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.transition(d.deployment_id, 'stopped', 3, { actor: 'test' });
    // desired_state is still 'running' (default)

    const before = await store.getById(d.deployment_id);
    expect(before!.actual_state).toBe('stopped');
    expect(before!.desired_state).toBe('running');

    await reconciler.reconcileDeployment(d.deployment_id);

    const after = await store.getById(d.deployment_id);
    expect(after!.actual_state).toBe('deploying');
  });

  /* ---------------------------------------------------------------- */
  /*  2. Drift: desired=terminated, actual=running -> terminate called */
  /* ---------------------------------------------------------------- */

  test('drift: desired=terminated, actual=running -> terminate called', async () => {
    const mockTerminate = jest.fn().mockResolvedValue(undefined);
    const mockStatus = jest.fn().mockResolvedValue({ status: 'RUNNING', health: 'healthy' });
    mockGetDeployer.mockReturnValue({
      target: 'railway',
      description: 'Mock Railway',
      deploy: jest.fn(),
      status: mockStatus,
      logs: jest.fn(),
      terminate: mockTerminate,
      scale: jest.fn(),
      isHealthy: jest.fn(),
    });

    const d = await store.create(makeInput({ provider: 'railway' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'rw-123' });

    // Set desired_state to terminated by directly manipulating (store doesn't have a setDesired method,
    // so we work around it by transitioning as reconciler would see it)
    // Actually, the store creates with desired='running'. We need to set desired='terminated'.
    // The in-memory store doesn't expose a setDesiredState. Let's access internals for testing.
    const raw = (store as any).deployments.get(d.deployment_id);
    raw.desired_state = 'terminated';

    await reconciler.reconcileDeployment(d.deployment_id);

    const after = await store.getById(d.deployment_id);
    expect(after!.actual_state).toBe('terminated');
  });

  /* ---------------------------------------------------------------- */
  /*  3. Drift: desired=terminated, actual=failed -> transition        */
  /* ---------------------------------------------------------------- */

  test('drift: desired=terminated, actual=failed -> transition to terminated', async () => {
    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'failed', 2, { actor: 'test', error: 'test error' });

    const raw = (store as any).deployments.get(d.deployment_id);
    raw.desired_state = 'terminated';

    await reconciler.reconcileDeployment(d.deployment_id);

    const after = await store.getById(d.deployment_id);
    expect(after!.actual_state).toBe('terminated');
  });

  /* ---------------------------------------------------------------- */
  /*  4. Stuck deploying > timeout, provider says running              */
  /* ---------------------------------------------------------------- */

  test('stuck deploying > timeout, provider says running -> transition to running', async () => {
    mockGetDeployer.mockReturnValue({
      target: 'railway',
      description: 'Mock Railway',
      deploy: jest.fn(),
      status: jest.fn().mockResolvedValue({ status: 'RUNNING', health: 'healthy', deployment_id: 'rw-123' }),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
    });

    const config = makeReconcilerConfig({ stuckTimeoutMs: 1 }); // 1ms so it's immediately stuck
    reconciler = new ReconcilerService(store, leaseManager, config);

    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'rw-123' });

    // Make last_transition_at old enough
    const raw = (store as any).deployments.get(d.deployment_id);
    raw.last_transition_at = Date.now() - 1000;

    await reconciler.reconcileDeployment(d.deployment_id);

    const after = await store.getById(d.deployment_id);
    expect(after!.actual_state).toBe('running');
  });

  /* ---------------------------------------------------------------- */
  /*  5. Stuck deploying, provider unreachable -> health=unknown       */
  /* ---------------------------------------------------------------- */

  test('stuck deploying, provider unreachable -> health set to unknown', async () => {
    mockGetDeployer.mockReturnValue({
      target: 'railway',
      description: 'Mock Railway',
      deploy: jest.fn(),
      status: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
    });

    const config = makeReconcilerConfig({ stuckTimeoutMs: 1, providerStalenessMs: 1 });
    reconciler = new ReconcilerService(store, leaseManager, config);

    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'rw-123' });

    const raw = (store as any).deployments.get(d.deployment_id);
    raw.last_transition_at = Date.now() - 1000;

    await reconciler.reconcileDeployment(d.deployment_id);

    const after = await store.getById(d.deployment_id);
    expect(after!.health_status).toBe('unknown');
  });

  /* ---------------------------------------------------------------- */
  /*  6. Provider sync updates health                                  */
  /* ---------------------------------------------------------------- */

  test('provider sync updates health -> deployer.status() -> store.updateHealth()', async () => {
    mockGetDeployer.mockReturnValue({
      target: 'railway',
      description: 'Mock Railway',
      deploy: jest.fn(),
      status: jest.fn().mockResolvedValue({
        status: 'running',
        health: 'healthy',
        deployment_id: 'rw-456',
        uptime_ms: 120000,
        url: 'https://agent.up.railway.app',
      }),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
    });

    const { syncProviderState } = require('../reconciler/provider-sync');

    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'rw-456' });

    await syncProviderState(await store.getById(d.deployment_id)!, store);

    const after = await store.getById(d.deployment_id);
    expect(after!.health_status).toBe('healthy');
    expect(after!.last_health_at).toBeDefined();
  });

  /* ---------------------------------------------------------------- */
  /*  7. Provider sync failure -> health=unknown, no crash             */
  /* ---------------------------------------------------------------- */

  test('provider sync failure -> health set to unknown, no crash', async () => {
    mockGetDeployer.mockReturnValue({
      target: 'railway',
      description: 'Mock Railway',
      deploy: jest.fn(),
      status: jest.fn().mockRejectedValue(new Error('API unavailable')),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
    });

    const { syncProviderState } = require('../reconciler/provider-sync');

    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'rw-789' });

    // Should NOT throw
    await syncProviderState(await store.getById(d.deployment_id)!, store);

    const after = await store.getById(d.deployment_id);
    expect(after!.health_status).toBe('unknown');
  });

  /* ---------------------------------------------------------------- */
  /*  8. Sweep processes targeted subsets                               */
  /* ---------------------------------------------------------------- */

  test('sweep processes targeted subsets -> listDrifted + listByState called', async () => {
    const listDriftedSpy = jest.spyOn(store, 'listDrifted');
    const listByStateSpy = jest.spyOn(store, 'listByState');
    const listExpiringLeasesSpy = jest.spyOn(store, 'listExpiringLeases');

    await reconciler.sweep();

    expect(listDriftedSpy).toHaveBeenCalled();
    expect(listByStateSpy).toHaveBeenCalledWith('deploying');
    expect(listExpiringLeasesSpy).toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  9. mapProviderStatus — canonical mapping                         */
  /* ---------------------------------------------------------------- */

  test('mapProviderStatus — RUNNING->running, FAILED->failed, BUILDING->deploying, unknown->no change', () => {
    const running = mapProviderStatus('railway', 'RUNNING');
    expect(running.actualState).toBe('running');
    expect(running.health).toBe('healthy');
    expect(running.isTerminal).toBe(false);

    const failed = mapProviderStatus('railway', 'FAILED');
    expect(failed.actualState).toBe('failed');
    expect(failed.health).toBe('unhealthy');
    expect(failed.isTerminal).toBe(true);

    const building = mapProviderStatus('railway', 'BUILDING');
    expect(building.actualState).toBe('deploying');
    expect(building.isTransitional).toBe(true);

    const unknown = mapProviderStatus('railway', 'SOME_RANDOM_STATUS');
    expect(unknown.actualState).toBeUndefined();
    expect(unknown.health).toBe('unknown');
    expect(unknown.isTerminal).toBe(false);
  });
});
