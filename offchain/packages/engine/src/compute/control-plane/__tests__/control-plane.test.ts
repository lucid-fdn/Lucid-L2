// offchain/packages/engine/src/deployment/__tests__/control-plane.test.ts
// Tests for the Deployment Control Plane — InMemoryDeploymentStore

import { InMemoryDeploymentStore } from '../store/in-memory-store';
import {
  StaleVersionError,
  InvalidTransitionError,
  Deployment,
  CreateDeploymentInput,
} from '../store/types';

function makeInput(overrides?: Partial<CreateDeploymentInput>): CreateDeploymentInput {
  return {
    agent_passport_id: 'agent-001',
    provider: 'railway',
    runtime_adapter: 'vercel-ai',
    descriptor_snapshot: { name: 'test-agent', version: '1.0' },
    ...overrides,
  };
}

describe('Deployment Control Plane — InMemoryDeploymentStore', () => {
  let store: InMemoryDeploymentStore;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
  });

  /* ---------------------------------------------------------------- */
  /*  1. Create deployment — all fields populated                     */
  /* ---------------------------------------------------------------- */

  test('create deployment — all fields populated', async () => {
    const input = makeInput({
      tenant_id: 'tenant-a',
      env_vars_hash: 'sha256-abc',
      code_bundle_hash: 'sha256-def',
      created_by: 'user:kevin',
      idempotency_key: 'deploy-1',
    });

    const d = await store.create(input);

    expect(d.deployment_id).toBeDefined();
    expect(d.agent_passport_id).toBe('agent-001');
    expect(d.tenant_id).toBe('tenant-a');
    expect(d.version).toBe(1);
    expect(d.revision).toBe(1);
    expect(d.provider).toBe('railway');
    expect(d.runtime_adapter).toBe('vercel-ai');
    expect(d.desired_state).toBe('running');
    expect(d.actual_state).toBe('pending');
    expect(d.health_status).toBe('unknown');
    expect(d.deployment_slot).toBe('primary');
    expect(d.descriptor_snapshot).toEqual({ name: 'test-agent', version: '1.0' });
    expect(d.env_vars_hash).toBe('sha256-abc');
    expect(d.code_bundle_hash).toBe('sha256-def');
    expect(d.created_by).toBe('user:kevin');
    expect(d.updated_by).toBe('user:kevin');
    expect(d.idempotency_key).toBe('deploy-1');
    expect(d.created_at).toBeGreaterThan(0);
    expect(d.updated_at).toBeGreaterThan(0);
    expect(d.last_transition_at).toBeGreaterThan(0);
    expect(d.terminated_at).toBeNull();
    expect(d.error).toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  2. getActiveByAgent — returns active, ignores terminated        */
  /* ---------------------------------------------------------------- */

  test('getActiveByAgent — returns active, ignores terminated', async () => {
    const d1 = await store.create(makeInput());
    // Terminate d1
    await store.transition(d1.deployment_id, 'deploying', 1);
    await store.transition(d1.deployment_id, 'terminated', 2, { terminatedReason: 'user_request' });

    // Create a new active deployment
    const d2 = await store.create(makeInput());

    const active = await store.getActiveByAgent('agent-001');
    expect(active).not.toBeNull();
    expect(active!.deployment_id).toBe(d2.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  3. getByProviderDeploymentId — lookup works                     */
  /* ---------------------------------------------------------------- */

  test('getByProviderDeploymentId — lookup works', async () => {
    const d = await store.create(makeInput());
    await store.updateProviderResources(d.deployment_id, {
      provider_deployment_id: 'railway-svc-123',
    });

    const found = await store.getByProviderDeploymentId('railway', 'railway-svc-123');
    expect(found).not.toBeNull();
    expect(found!.deployment_id).toBe(d.deployment_id);

    const notFound = await store.getByProviderDeploymentId('akash', 'railway-svc-123');
    expect(notFound).toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  4. listByAgent — multiple deployments per agent                 */
  /* ---------------------------------------------------------------- */

  test('listByAgent — multiple deployments per agent', async () => {
    await store.create(makeInput({ agent_passport_id: 'agent-A' }));
    await store.create(makeInput({ agent_passport_id: 'agent-A' }));
    await store.create(makeInput({ agent_passport_id: 'agent-B' }));

    const listA = await store.listByAgent('agent-A');
    expect(listA).toHaveLength(2);

    const listB = await store.listByAgent('agent-B');
    expect(listB).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /*  5. list with filters — provider, state, health                  */
  /* ---------------------------------------------------------------- */

  test('list with filters — provider, state, health', async () => {
    const d1 = await store.create(makeInput({ provider: 'railway' }));
    const d2 = await store.create(makeInput({ provider: 'akash' }));
    const d3 = await store.create(makeInput({ provider: 'railway' }));

    // Transition d1 to running
    await store.transition(d1.deployment_id, 'deploying', 1);
    await store.transition(d1.deployment_id, 'running', 2);
    await store.updateHealth(d1.deployment_id, 'healthy', Date.now());

    // Filter by provider
    const railways = await store.list({ provider: 'railway' });
    expect(railways).toHaveLength(2);

    // Filter by state
    const running = await store.list({ actual_state: 'running' });
    expect(running).toHaveLength(1);
    expect(running[0].deployment_id).toBe(d1.deployment_id);

    // Filter by health
    const healthy = await store.list({ health_status: 'healthy' });
    expect(healthy).toHaveLength(1);
    expect(healthy[0].deployment_id).toBe(d1.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  6. transition valid — pending → deploying → running             */
  /* ---------------------------------------------------------------- */

  test('transition valid — pending → deploying → running', async () => {
    const d = await store.create(makeInput());
    expect(d.actual_state).toBe('pending');
    expect(d.version).toBe(1);

    const d2 = await store.transition(d.deployment_id, 'deploying', 1, { actor: 'system' });
    expect(d2.actual_state).toBe('deploying');
    expect(d2.version).toBe(2);

    const d3 = await store.transition(d.deployment_id, 'running', 2, { actor: 'system' });
    expect(d3.actual_state).toBe('running');
    expect(d3.version).toBe(3);
    expect(d3.last_transition_at).toBeGreaterThan(0);
  });

  /* ---------------------------------------------------------------- */
  /*  7. transition invalid — running → pending throws                */
  /* ---------------------------------------------------------------- */

  test('transition invalid — running → pending throws InvalidTransitionError', async () => {
    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1);
    await store.transition(d.deployment_id, 'running', 2);

    await expect(
      store.transition(d.deployment_id, 'pending' as any, 3),
    ).rejects.toThrow(InvalidTransitionError);
  });

  /* ---------------------------------------------------------------- */
  /*  8. optimistic locking — stale version throws StaleVersionError  */
  /* ---------------------------------------------------------------- */

  test('optimistic locking — stale version throws StaleVersionError', async () => {
    const d = await store.create(makeInput());

    // Transition bumps version to 2
    await store.transition(d.deployment_id, 'deploying', 1);

    // Now try to transition with stale version 1
    await expect(
      store.transition(d.deployment_id, 'running', 1),
    ).rejects.toThrow(StaleVersionError);
  });

  /* ---------------------------------------------------------------- */
  /*  9. append event — correct type, actor, states                   */
  /* ---------------------------------------------------------------- */

  test('append event — correct type, actor, states', async () => {
    const d = await store.create(makeInput());

    const event = await store.appendEvent({
      deployment_id: d.deployment_id,
      event_type: 'created',
      actor: 'system',
      previous_state: undefined,
      new_state: 'pending',
      metadata: { trigger: 'api' },
    });

    expect(event.event_id).toBeDefined();
    expect(event.deployment_id).toBe(d.deployment_id);
    expect(event.event_type).toBe('created');
    expect(event.actor).toBe('system');
    expect(event.previous_state).toBeNull();
    expect(event.new_state).toBe('pending');
    expect(event.metadata).toEqual({ trigger: 'api' });
    expect(event.sequence).toBe(1);
    expect(event.created_at).toBeGreaterThan(0);
  });

  /* ---------------------------------------------------------------- */
  /*  10. get events — ordered, filtered by type                      */
  /* ---------------------------------------------------------------- */

  test('get events — ordered by created_at DESC, filtered by type', async () => {
    const d = await store.create(makeInput());

    await store.appendEvent({
      deployment_id: d.deployment_id,
      event_type: 'created',
      actor: 'system',
    });
    await store.appendEvent({
      deployment_id: d.deployment_id,
      event_type: 'started',
      actor: 'system',
    });
    await store.appendEvent({
      deployment_id: d.deployment_id,
      event_type: 'health_changed',
      actor: 'health_monitor',
    });

    // All events, most recent first
    const all = await store.getEvents(d.deployment_id);
    expect(all).toHaveLength(3);
    expect(all[0].event_type).toBe('health_changed');
    expect(all[2].event_type).toBe('created');

    // Filtered by type
    const healthOnly = await store.getEvents(d.deployment_id, { types: ['health_changed'] });
    expect(healthOnly).toHaveLength(1);
    expect(healthOnly[0].event_type).toBe('health_changed');
  });

  /* ---------------------------------------------------------------- */
  /*  11. listByState — only matching state                           */
  /* ---------------------------------------------------------------- */

  test('listByState — only matching state', async () => {
    const d1 = await store.create(makeInput());
    const d2 = await store.create(makeInput());
    await store.transition(d1.deployment_id, 'deploying', 1);
    await store.transition(d1.deployment_id, 'running', 2);

    const running = await store.listByState('running');
    expect(running).toHaveLength(1);
    expect(running[0].deployment_id).toBe(d1.deployment_id);

    const pending = await store.listByState('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].deployment_id).toBe(d2.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  12. listExpiringLeases — returns expiring within window         */
  /* ---------------------------------------------------------------- */

  test('listExpiringLeases — returns expiring within window', async () => {
    const d1 = await store.create(makeInput());
    const d2 = await store.create(makeInput());

    // d1 expires in 5 minutes
    await store.updateLease(d1.deployment_id, Date.now() + 5 * 60 * 1000);
    // d2 expires in 2 hours
    await store.updateLease(d2.deployment_id, Date.now() + 2 * 60 * 60 * 1000);

    // Query for leases expiring within 10 minutes
    const expiring = await store.listExpiringLeases(10 * 60 * 1000);
    expect(expiring).toHaveLength(1);
    expect(expiring[0].deployment_id).toBe(d1.deployment_id);

    // Query for leases expiring within 3 hours (both)
    const expiringAll = await store.listExpiringLeases(3 * 60 * 60 * 1000);
    expect(expiringAll).toHaveLength(2);
  });

  /* ---------------------------------------------------------------- */
  /*  13. listDrifted — desired_state != actual_state                 */
  /* ---------------------------------------------------------------- */

  test('listDrifted — desired_state != actual_state', async () => {
    // d1: desired=running, actual=pending → drifted
    const d1 = await store.create(makeInput());

    // d2: desired=running, actual=running → not drifted
    const d2 = await store.create(makeInput());
    await store.transition(d2.deployment_id, 'deploying', 1);
    await store.transition(d2.deployment_id, 'running', 2);

    // d3: terminated → excluded from drift
    const d3 = await store.create(makeInput());
    await store.transition(d3.deployment_id, 'deploying', 1);
    await store.transition(d3.deployment_id, 'terminated', 2, { terminatedReason: 'user_request' });

    const drifted = await store.listDrifted();
    expect(drifted).toHaveLength(1);
    expect(drifted[0].deployment_id).toBe(d1.deployment_id);
  });

  /* ---------------------------------------------------------------- */
  /*  14. idempotency — duplicate key returns existing                */
  /* ---------------------------------------------------------------- */

  test('idempotency — duplicate key returns existing', async () => {
    const d1 = await store.create(makeInput({ idempotency_key: 'unique-key-1' }));
    const d2 = await store.create(makeInput({ idempotency_key: 'unique-key-1' }));

    expect(d1.deployment_id).toBe(d2.deployment_id);
    expect(d1.created_at).toBe(d2.created_at);

    // Verify only one was actually created
    const all = await store.list();
    expect(all).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /*  15. incrementRevision — revision bumps, descriptor updates      */
  /* ---------------------------------------------------------------- */

  test('incrementRevision — revision bumps, descriptor updates, version bumps', async () => {
    const d = await store.create(makeInput());
    expect(d.revision).toBe(1);
    expect(d.version).toBe(1);

    const updated = await store.incrementRevision(
      d.deployment_id,
      { name: 'test-agent', version: '2.0', newField: true },
      'user:kevin',
    );

    expect(updated.revision).toBe(2);
    expect(updated.version).toBe(2);
    expect(updated.descriptor_snapshot).toEqual({ name: 'test-agent', version: '2.0', newField: true });
    expect(updated.updated_by).toBe('user:kevin');
  });

  /* ---------------------------------------------------------------- */
  /*  16. provider status separate — actual_state and provider_status */
  /* ---------------------------------------------------------------- */

  test('provider status separate — actual_state and provider_status independent', async () => {
    const d = await store.create(makeInput());

    // Transition to deploying
    await store.transition(d.deployment_id, 'deploying', 1, {
      providerStatus: 'BUILDING',
      providerStatusDetail: { build_id: 'b-123' },
    });

    // Update provider status independently (e.g., provider webhook)
    await store.updateProviderResources(d.deployment_id, {
      provider_status: 'ACTIVE',
      provider_status_detail: { service_id: 'svc-456' },
    });

    const fetched = await store.getById(d.deployment_id);
    expect(fetched!.actual_state).toBe('deploying');        // Platform state unchanged
    expect(fetched!.provider_status).toBe('ACTIVE');        // Provider state updated independently
    expect(fetched!.provider_status_detail).toEqual({ service_id: 'svc-456' });
  });

  /* ---------------------------------------------------------------- */
  /*  17. updateHealth — health + last_health_at + version bumped     */
  /* ---------------------------------------------------------------- */

  test('updateHealth — health + last_health_at + version bumped', async () => {
    const d = await store.create(makeInput());
    expect(d.health_status).toBe('unknown');
    expect(d.version).toBe(1);

    const checkAt = Date.now();
    await store.updateHealth(d.deployment_id, 'healthy', checkAt);

    const fetched = await store.getById(d.deployment_id);
    expect(fetched!.health_status).toBe('healthy');
    expect(fetched!.last_health_at).toBe(checkAt);
    expect(fetched!.version).toBe(2);
  });

  /* ---------------------------------------------------------------- */
  /*  18. updateProviderResources — fields updated + version bumped   */
  /* ---------------------------------------------------------------- */

  test('updateProviderResources — fields updated + version bumped', async () => {
    const d = await store.create(makeInput());

    await store.updateProviderResources(d.deployment_id, {
      provider_deployment_id: 'railway-svc-789',
      deployment_url: 'https://agent.up.railway.app',
      a2a_endpoint: 'https://agent.up.railway.app/.well-known/agent.json',
      wallet_address: '0xABC123',
      provider_region: 'us-west-1',
    });

    const fetched = await store.getById(d.deployment_id);
    expect(fetched!.provider_deployment_id).toBe('railway-svc-789');
    expect(fetched!.deployment_url).toBe('https://agent.up.railway.app');
    expect(fetched!.a2a_endpoint).toBe('https://agent.up.railway.app/.well-known/agent.json');
    expect(fetched!.wallet_address).toBe('0xABC123');
    expect(fetched!.provider_region).toBe('us-west-1');
    expect(fetched!.version).toBe(2);
  });

  /* ---------------------------------------------------------------- */
  /*  19. terminated transition — terminated_at set, reason stored    */
  /* ---------------------------------------------------------------- */

  test('terminated transition — terminated_at set, terminated_reason stored', async () => {
    const d = await store.create(makeInput());
    await store.transition(d.deployment_id, 'deploying', 1);
    await store.transition(d.deployment_id, 'running', 2);

    const terminated = await store.transition(d.deployment_id, 'terminated', 3, {
      actor: 'reconciler',
      terminatedReason: 'lease_expired',
    });

    expect(terminated.actual_state).toBe('terminated');
    expect(terminated.terminated_at).toBeGreaterThan(0);
    expect(terminated.terminated_reason).toBe('lease_expired');
    expect(terminated.updated_by).toBe('reconciler');

    // Verify no further transitions allowed
    await expect(
      store.transition(terminated.deployment_id, 'running' as any, terminated.version),
    ).rejects.toThrow(InvalidTransitionError);
  });
});
