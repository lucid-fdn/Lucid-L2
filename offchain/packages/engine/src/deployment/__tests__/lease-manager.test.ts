// offchain/packages/engine/src/deployment/__tests__/lease-manager.test.ts
// Tests for LeaseManagerService — extend, failure, unsupported

import { InMemoryDeploymentStore } from '../control-plane/in-memory-store';
import { LeaseManagerService } from '../lease-manager/service';
import type { CreateDeploymentInput, Deployment } from '../control-plane/types';
import type { LeaseConfig } from '../lease-manager/policies';

// Mock the deploy module
jest.mock('../../compute/deploy', () => ({
  getDeployer: jest.fn(),
}));

import { getDeployer } from '../../compute/deploy';
const mockGetDeployer = getDeployer as jest.MockedFunction<typeof getDeployer>;

function makeInput(overrides?: Partial<CreateDeploymentInput>): CreateDeploymentInput {
  return {
    agent_passport_id: 'agent-001',
    provider: 'ionet',
    runtime_adapter: 'vercel-ai',
    descriptor_snapshot: { name: 'test-agent' },
    lease_expires_at: Date.now() + 3600_000, // 1 hour from now
    ...overrides,
  };
}

function makeLeaseConfig(overrides?: Partial<LeaseConfig>): LeaseConfig {
  return {
    warningThresholdMs: 7_200_000, // 2h
    extensionHours: 24,
    ...overrides,
  };
}

describe('LeaseManagerService', () => {
  let store: InMemoryDeploymentStore;
  let leaseManager: LeaseManagerService;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
    leaseManager = new LeaseManagerService(store, makeLeaseConfig());
    jest.clearAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /*  1. Extend io.net lease                                           */
  /* ---------------------------------------------------------------- */

  test('extend io.net lease -> updateLease called, lease_extended event appended', async () => {
    const mockExtend = jest.fn().mockResolvedValue(undefined);
    mockGetDeployer.mockReturnValue({
      target: 'ionet',
      description: 'Mock io.net',
      deploy: jest.fn(),
      status: jest.fn(),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
      extend: mockExtend,
    } as any);

    const d = await store.create(makeInput({ provider: 'ionet' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'io-123' });

    const deployment = await store.getById(d.deployment_id);
    await leaseManager.handleExpiring(deployment!);

    // Check lease was updated
    const after = await store.getById(d.deployment_id);
    expect(after!.lease_expires_at).toBeGreaterThan(Date.now());

    // Check event was appended
    const events = await store.getEvents(d.deployment_id, { types: ['lease_extended'] });
    expect(events.length).toBe(1);
    expect(events[0].actor).toBe('lease_manager');
    expect((events[0].metadata as any).extension_hours).toBe(24);
  });

  /* ---------------------------------------------------------------- */
  /*  2. Extend failure -> lease_expiring event with error             */
  /* ---------------------------------------------------------------- */

  test('extend failure -> lease_expiring event with error', async () => {
    mockGetDeployer.mockReturnValue({
      target: 'ionet',
      description: 'Mock io.net',
      deploy: jest.fn(),
      status: jest.fn(),
      logs: jest.fn(),
      terminate: jest.fn(),
      scale: jest.fn(),
      isHealthy: jest.fn(),
      extend: jest.fn().mockRejectedValue(new Error('Extension quota exceeded')),
    } as any);

    const d = await store.create(makeInput({ provider: 'ionet' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'io-456' });

    const deployment = await store.getById(d.deployment_id);
    await leaseManager.handleExpiring(deployment!);

    // Check error event was appended
    const events = await store.getEvents(d.deployment_id, { types: ['lease_expiring'] });
    expect(events.length).toBe(1);
    expect((events[0].metadata as any).error).toContain('Extension quota exceeded');
  });

  /* ---------------------------------------------------------------- */
  /*  3. Provider without extension (Railway)                          */
  /* ---------------------------------------------------------------- */

  test('provider without extension (Railway) -> lease_expiring event with reason', async () => {
    const d = await store.create(makeInput({ provider: 'railway' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });

    const deployment = await store.getById(d.deployment_id);
    await leaseManager.handleExpiring(deployment!);

    // Check warning event was appended
    const events = await store.getEvents(d.deployment_id, { types: ['lease_expiring'] });
    expect(events.length).toBe(1);
    expect((events[0].metadata as any).reason).toBe('extension_not_supported');
  });
});
