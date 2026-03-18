/**
 * Deployment Service E2E Tests
 *
 * Tests the deployment pipeline end-to-end using InMemoryDeploymentStore
 * with mocked deployer, passport manager, runtime adapter, and wallet provider.
 *
 * 6 tests:
 * 1. Full deploy pipeline — record exists with 'running' state + provider_deployment_id
 * 2. Deploy emits events — 'created', 'started', 'succeeded' events in order
 * 3. Deploy failure — mock deployer throws → 'failed' state + 'failed' event
 * 4. Terminate — deploy then terminate → 'terminated' state + 'terminated' event
 * 5. Idempotent deploy — same idempotency_key → same deployment_id, no duplicate
 * 6. List deployments — deploy 2 agents → both returned, filters work
 */

import { InMemoryDeploymentStore } from '../store/in-memory-store';

// ---------------------------------------------------------------------------
// Mock external dependencies (BEFORE imports that use them)
// ---------------------------------------------------------------------------

// Mock schemaValidator
jest.mock('../../../shared/crypto/schemaValidator', () => ({
  validateWithSchema: jest.fn(() => ({ ok: true, value: {} })),
}));

// Mock passportManager
let passportCallCount = 0;
jest.mock('../../../identity/passport/passportManager', () => ({
  getPassportManager: jest.fn(() => ({
    createPassport: jest.fn().mockImplementation(() => {
      passportCallCount++;
      return Promise.resolve({
        ok: true,
        data: { passport_id: `passport_agent_${passportCallCount}` },
      });
    }),
  })),
}));

// Mock deployers + runtime adapters (merged into providers)
const mockDeployer = {
  target: 'docker',
  description: 'Docker deployer',
  deploy: jest.fn().mockResolvedValue({
    success: true,
    deployment_id: 'provider_deploy_001',
    target: 'docker',
    url: 'http://localhost:3100',
  }),
  status: jest.fn().mockResolvedValue({
    deployment_id: 'provider_deploy_001',
    status: 'running',
    health: 'healthy',
    url: 'http://localhost:3100',
  }),
  logs: jest.fn().mockResolvedValue('Agent started'),
  terminate: jest.fn().mockResolvedValue(undefined),
  scale: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
};
jest.mock('../../providers', () => ({
  getRuntimeAdapter: jest.fn(),
  selectBestAdapter: jest.fn(() => ({
    name: 'vercel-ai',
    version: '1.0.0',
    language: 'typescript',
    canHandle: jest.fn(() => true),
    generate: jest.fn().mockResolvedValue({
      adapter: 'vercel-ai',
      files: new Map([['agent.ts', 'console.log("agent");'], ['Dockerfile', 'FROM node:20-slim']]),
      entrypoint: 'agent.ts',
      dependencies: { tsx: '^4.0.0' },
      env_vars: { PORT: '3100' },
      dockerfile: 'FROM node:20-slim',
    }),
  })),
  listAdapterNames: jest.fn(() => ['vercel-ai', 'openclaw', 'docker']),
  getDeployer: jest.fn(() => mockDeployer),
  listDeployerTargets: jest.fn(() => ['docker', 'railway']),
}));

// Mock wallet
jest.mock('../../../identity/wallet', () => ({
  getAgentWalletProvider: jest.fn(() => ({
    providerName: 'mock',
    chain: 'mock',
    createWallet: jest.fn().mockResolvedValue({
      address: 'mock_wallet_addr',
      chain: 'mock',
      provider: 'mock',
      agent_passport_id: 'mock',
      created_at: Date.now(),
    }),
    setSpendingLimits: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock A2A
jest.mock('../agent/a2a/agentCard', () => ({
  generateAgentCard: jest.fn(() => ({
    name: 'test-agent',
    capabilities: ['research'],
  })),
}));

// Mock deployment control plane — use InMemory for tests
let testStore: InMemoryDeploymentStore;
jest.mock('../store', () => {
  const actual = jest.requireActual('../store');
  return {
    ...actual,
    getDeploymentStore: () => testStore,
    resetDeploymentStore: () => { testStore = new InMemoryDeploymentStore(); },
  };
});

// Now import the service
import {
  AgentDeploymentService,
  resetAgentDeploymentService,
} from '../agent/agentDeploymentService';
import { DeployAgentInput } from '../agent/agentDeploymentService';
import { AgentDescriptor } from '../agent/agentDescriptor';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDescriptor(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
  return {
    agent_config: {
      system_prompt: 'You are a helpful agent.',
      model_passport_id: 'passport_model_abc',
      tool_passport_ids: [],
      skill_slugs: [],
      mcp_servers: [],
      autonomy_level: 'supervised',
      stop_conditions: [],
      guardrails: [],
      memory_enabled: false,
      memory_provider: 'supabase',
      memory_window_size: 10,
      workflow_type: 'single',
      channels: [],
      a2a_enabled: false,
    },
    deployment_config: {
      target: { type: 'docker' },
      restart_policy: 'on_failure',
    },
    ...overrides,
  };
}

function makeInput(overrides?: Partial<DeployAgentInput>): DeployAgentInput {
  return {
    name: 'Test Agent',
    description: 'A test agent',
    owner: 'owner_sol_address',
    descriptor: makeDescriptor(),
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Deployment Service E2E', () => {
  let service: AgentDeploymentService;

  beforeEach(() => {
    passportCallCount = 0;
    resetAgentDeploymentService();
    testStore = new InMemoryDeploymentStore();
    service = new AgentDeploymentService();
    jest.clearAllMocks();

    // Reset mock deployer to default success behavior
    mockDeployer.deploy.mockResolvedValue({
      success: true,
      deployment_id: 'provider_deploy_001',
      target: 'docker',
      url: 'http://localhost:3100',
    });
    mockDeployer.terminate.mockResolvedValue(undefined);
  });

  /* ------------------------------------------------------------------ */
  /*  1. Full deploy pipeline                                            */
  /* ------------------------------------------------------------------ */

  test('full deploy pipeline — deployment record exists with running state and provider_deployment_id', async () => {
    const result = await service.deployAgent(makeInput());

    expect(result.success).toBe(true);
    expect(result.passport_id).toBeTruthy();

    // Verify the durable store has the deployment
    const deployments = await testStore.list();
    expect(deployments).toHaveLength(1);

    const d = deployments[0];
    expect(d.actual_state).toBe('running');
    expect(d.provider_deployment_id).toBe('provider_deploy_001');
    expect(d.deployment_url).toBe('http://localhost:3100');
    expect(d.provider).toBe('docker');
    expect(d.runtime_adapter).toBe('vercel-ai');
  });

  /* ------------------------------------------------------------------ */
  /*  2. Deploy emits events                                             */
  /* ------------------------------------------------------------------ */

  test('deploy emits created, started, succeeded events in order', async () => {
    const result = await service.deployAgent(makeInput());
    expect(result.success).toBe(true);

    const deployments = await testStore.list();
    expect(deployments).toHaveLength(1);

    // getEvents returns most recent first (DESC), so reverse for chronological
    const events = await testStore.getEvents(deployments[0].deployment_id);
    const eventTypes = events.map(e => e.event_type);

    expect(eventTypes).toContain('created');
    expect(eventTypes).toContain('started');
    expect(eventTypes).toContain('succeeded');

    // Verify chronological order: created before started before succeeded
    // Events are DESC so reverse for chronological comparison
    const chronological = [...events].reverse();
    const createdIdx = chronological.findIndex(e => e.event_type === 'created');
    const startedIdx = chronological.findIndex(e => e.event_type === 'started');
    const succeededIdx = chronological.findIndex(e => e.event_type === 'succeeded');
    expect(createdIdx).toBeLessThan(startedIdx);
    expect(startedIdx).toBeLessThan(succeededIdx);
  });

  /* ------------------------------------------------------------------ */
  /*  3. Deploy failure                                                  */
  /* ------------------------------------------------------------------ */

  test('deploy failure — deployer throws → deployment in failed state with failed event', async () => {
    mockDeployer.deploy.mockRejectedValueOnce(new Error('GPU out of memory'));

    const result = await service.deployAgent(makeInput());
    expect(result.success).toBe(false);
    expect(result.error).toContain('GPU out of memory');

    // Verify the store recorded the failure
    const deployments = await testStore.list();
    expect(deployments).toHaveLength(1);
    expect(deployments[0].actual_state).toBe('failed');

    // Verify failed event was emitted
    const events = await testStore.getEvents(deployments[0].deployment_id);
    const failedEvents = events.filter(e => e.event_type === 'failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].metadata).toEqual(
      expect.objectContaining({ error: expect.stringContaining('GPU out of memory') }),
    );
  });

  /* ------------------------------------------------------------------ */
  /*  4. Terminate                                                       */
  /* ------------------------------------------------------------------ */

  test('terminate — deployment transitions to terminated with terminated event and user_request reason', async () => {
    const deployResult = await service.deployAgent(makeInput());
    expect(deployResult.success).toBe(true);

    const terminateResult = await service.terminateAgent(deployResult.passport_id!);
    expect(terminateResult.success).toBe(true);

    // Verify the store has the terminated deployment
    const deployments = await testStore.list();
    const terminated = deployments.find(d => d.actual_state === 'terminated');
    expect(terminated).toBeTruthy();
    expect(terminated!.terminated_reason).toBe('user_request');
    expect(terminated!.terminated_at).toBeGreaterThan(0);

    // Verify terminated event
    const events = await testStore.getEvents(terminated!.deployment_id);
    const terminatedEvents = events.filter(e => e.event_type === 'terminated');
    expect(terminatedEvents).toHaveLength(1);
    expect(terminatedEvents[0].metadata).toEqual(
      expect.objectContaining({ terminated_reason: 'user_request' }),
    );
  });

  /* ------------------------------------------------------------------ */
  /*  5. Idempotent deploy                                               */
  /* ------------------------------------------------------------------ */

  test('idempotent deploy — same idempotency_key returns same deployment, no duplicate', async () => {
    const result1 = await service.deployAgent(makeInput({ idempotency_key: 'idem-e2e-1' }));
    expect(result1.success).toBe(true);

    const result2 = await service.deployAgent(makeInput({ idempotency_key: 'idem-e2e-1' }));
    expect(result2.success).toBe(true);

    // Same passport_id returned
    expect(result2.passport_id).toBe(result1.passport_id);

    // Only one deployment in the store
    const deployments = await testStore.list();
    expect(deployments).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ */
  /*  6. List deployments                                                */
  /* ------------------------------------------------------------------ */

  test('list deployments — deploy 2 agents, both returned, filters work', async () => {
    const result1 = await service.deployAgent(makeInput({ owner: 'owner_alpha' }));
    const result2 = await service.deployAgent(makeInput({ owner: 'owner_beta' }));
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // All deployments
    const all = await service.listDeployments();
    expect(all).toHaveLength(2);

    // Filter by tenant_id (owner)
    const alphaOnly = await service.listDeployments({ tenant_id: 'owner_alpha' });
    expect(alphaOnly).toHaveLength(1);
    expect(alphaOnly[0].tenant_id).toBe('owner_alpha');

    // Filter by status
    const running = await service.listDeployments({ status: 'running' });
    expect(running).toHaveLength(2);

    const stopped = await service.listDeployments({ status: 'stopped' });
    expect(stopped).toHaveLength(0);

    // Filter by target
    const docker = await service.listDeployments({ target: 'docker' });
    expect(docker).toHaveLength(2);

    const railway = await service.listDeployments({ target: 'railway' });
    expect(railway).toHaveLength(0);
  });
});
