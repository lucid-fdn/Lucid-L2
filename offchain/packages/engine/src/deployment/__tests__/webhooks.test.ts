// offchain/packages/engine/src/deployment/__tests__/webhooks.test.ts
// Tests for webhook normalizers + WebhookHandler

import { InMemoryDeploymentStore } from '../control-plane/in-memory-store';
import { WebhookHandler } from '../webhooks/handler';
import { getNormalizer } from '../webhooks/normalizers';
import type { CreateDeploymentInput } from '../control-plane/types';

function makeInput(overrides?: Partial<CreateDeploymentInput>): CreateDeploymentInput {
  return {
    agent_passport_id: 'agent-001',
    provider: 'railway',
    runtime_adapter: 'vercel-ai',
    descriptor_snapshot: { name: 'test-agent' },
    ...overrides,
  };
}

describe('Webhook Normalizers', () => {
  /* ---------------------------------------------------------------- */
  /*  1. Railway normalizer                                            */
  /* ---------------------------------------------------------------- */

  test('Railway normalizer extracts correct fields', () => {
    const normalizer = getNormalizer('railway')!;
    expect(normalizer).toBeDefined();

    const event = normalizer.normalize(
      { service: { id: 'svc-123' }, status: 'RUNNING', url: 'https://agent.railway.app' },
      {},
    );

    expect(event.provider).toBe('railway');
    expect(event.provider_deployment_id).toBe('svc-123');
    expect(event.provider_status).toBe('RUNNING');
    expect(event.deployment_url).toBe('https://agent.railway.app');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  /* ---------------------------------------------------------------- */
  /*  2. Akash normalizer                                              */
  /* ---------------------------------------------------------------- */

  test('Akash normalizer extracts correct fields', () => {
    const normalizer = getNormalizer('akash')!;
    expect(normalizer).toBeDefined();

    const event = normalizer.normalize(
      { dseq: 'dseq-456', status: 'ACTIVE', uri: 'https://agent.akash.network' },
      {},
    );

    expect(event.provider).toBe('akash');
    expect(event.provider_deployment_id).toBe('dseq-456');
    expect(event.provider_status).toBe('ACTIVE');
    expect(event.deployment_url).toBe('https://agent.akash.network');
  });

  /* ---------------------------------------------------------------- */
  /*  3. Phala normalizer                                              */
  /* ---------------------------------------------------------------- */

  test('Phala normalizer extracts correct fields', () => {
    const normalizer = getNormalizer('phala')!;
    expect(normalizer).toBeDefined();

    const event = normalizer.normalize(
      { app_id: 'phala-789', status: 'RUNNING', url: 'https://agent.phala.cloud' },
      {},
    );

    expect(event.provider).toBe('phala');
    expect(event.provider_deployment_id).toBe('phala-789');
    expect(event.provider_status).toBe('RUNNING');
    expect(event.deployment_url).toBe('https://agent.phala.cloud');
  });

  /* ---------------------------------------------------------------- */
  /*  4. io.net normalizer                                             */
  /* ---------------------------------------------------------------- */

  test('io.net normalizer extracts correct fields', () => {
    const normalizer = getNormalizer('ionet')!;
    expect(normalizer).toBeDefined();

    const event = normalizer.normalize(
      { cluster_id: 'cluster-101', status: 'READY', endpoint: 'https://agent.io.net' },
      {},
    );

    expect(event.provider).toBe('ionet');
    expect(event.provider_deployment_id).toBe('cluster-101');
    expect(event.provider_status).toBe('READY');
    expect(event.deployment_url).toBe('https://agent.io.net');
  });

  /* ---------------------------------------------------------------- */
  /*  5. Nosana normalizer                                             */
  /* ---------------------------------------------------------------- */

  test('Nosana normalizer extracts correct fields', () => {
    const normalizer = getNormalizer('nosana')!;
    expect(normalizer).toBeDefined();

    const event = normalizer.normalize(
      { job_id: 'job-202', status: 'RUNNING', url: 'https://agent.nosana.io' },
      {},
    );

    expect(event.provider).toBe('nosana');
    expect(event.provider_deployment_id).toBe('job-202');
    expect(event.provider_status).toBe('RUNNING');
    expect(event.deployment_url).toBe('https://agent.nosana.io');
  });
});

describe('WebhookHandler', () => {
  let store: InMemoryDeploymentStore;
  let handler: WebhookHandler;

  beforeEach(() => {
    store = new InMemoryDeploymentStore();
    handler = new WebhookHandler(store);
  });

  /* ---------------------------------------------------------------- */
  /*  6. Handler updates store                                         */
  /* ---------------------------------------------------------------- */

  test('handler updates store — provider_status updated after webhook', async () => {
    const d = await store.create(makeInput({ provider: 'railway' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'svc-999' });

    const result = await handler.handle('railway', {
      service: { id: 'svc-999' },
      status: 'CRASHED',
    }, {});

    expect(result.success).toBe(true);

    const after = await store.getById(d.deployment_id);
    expect(after!.provider_status).toBe('CRASHED');
  });

  /* ---------------------------------------------------------------- */
  /*  7. Handler idempotent                                            */
  /* ---------------------------------------------------------------- */

  test('handler idempotent — same event twice -> one event in log', async () => {
    const d = await store.create(makeInput({ provider: 'railway' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'svc-888' });

    const body = { service: { id: 'svc-888' }, status: 'RUNNING', timestamp: 1710000000000 };

    await handler.handle('railway', body, {});
    await handler.handle('railway', body, {});

    // The idempotency-keyed event should only appear once
    const events = await store.getEvents(d.deployment_id);
    const webhookEvents = events.filter(e =>
      e.idempotency_key === 'webhook:railway:svc-888:1710000000000'
    );
    expect(webhookEvents.length).toBe(1);
  });

  /* ---------------------------------------------------------------- */
  /*  8. Handler enqueues reconcile                                    */
  /* ---------------------------------------------------------------- */

  test('handler enqueues reconcile — reconcile_requested metadata in event', async () => {
    const d = await store.create(makeInput({ provider: 'railway' }));
    await store.transition(d.deployment_id, 'deploying', 1, { actor: 'test' });
    await store.transition(d.deployment_id, 'running', 2, { actor: 'test' });
    await store.updateProviderResources(d.deployment_id, { provider_deployment_id: 'svc-777' });

    await handler.handle('railway', {
      service: { id: 'svc-777' },
      status: 'RUNNING',
    }, {});

    const events = await store.getEvents(d.deployment_id);
    const reconcileEvent = events.find(e =>
      (e.metadata as any).reconcile_requested === true
    );
    expect(reconcileEvent).toBeDefined();
    expect(reconcileEvent!.actor).toBe('webhook:railway');
  });
});
