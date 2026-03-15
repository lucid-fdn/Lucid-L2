// offchain/packages/engine/src/anchoring/__tests__/anchoring.test.ts
// Tests for the Anchoring Control Plane

import { createHash } from 'crypto';
import { InMemoryAnchorRegistry } from '../registry';
import { AnchorDispatcher } from '../dispatcher';
import { AnchorVerifier } from '../verifier';
import {
  getAnchorDispatcher,
  getAnchorRegistry,
  resetAnchoring,
} from '../index';
import type { IDepinStorage, UploadResult } from '../../storage/depin/IDepinStorage';
import type { AnchorRequest } from '../types';

// ---------------------------------------------------------------------------
// Mock storage factory
// ---------------------------------------------------------------------------

function createMockStorage(providerName: string): IDepinStorage {
  const stored = new Map<string, Buffer>();
  return {
    providerName,
    uploadJSON: jest.fn().mockImplementation(async (data: unknown) => {
      const buf = Buffer.from(JSON.stringify(data));
      const cid = `mock-${Math.random().toString(36).slice(2, 10)}`;
      stored.set(cid, buf);
      return { cid, url: `http://mock/${cid}`, provider: providerName, sizeBytes: buf.length } as UploadResult;
    }),
    uploadBytes: jest.fn().mockImplementation(async (data: Buffer) => {
      const cid = `mock-${Math.random().toString(36).slice(2, 10)}`;
      stored.set(cid, data);
      return { cid, url: `http://mock/${cid}`, provider: providerName, sizeBytes: data.length } as UploadResult;
    }),
    retrieve: jest.fn().mockImplementation(async (cid: string) => stored.get(cid) || null),
    exists: jest.fn().mockImplementation(async (cid: string) => stored.has(cid)),
    isHealthy: jest.fn().mockResolvedValue(true),
    getUrl: jest.fn().mockImplementation((cid: string) => `http://mock/${cid}`),
  };
}

// ---------------------------------------------------------------------------
// Dispatcher tests
// ---------------------------------------------------------------------------

describe('AnchorDispatcher', () => {
  let permanentStorage: IDepinStorage;
  let evolvingStorage: IDepinStorage;
  let registry: InMemoryAnchorRegistry;
  let dispatcher: AnchorDispatcher;

  beforeEach(() => {
    permanentStorage = createMockStorage('permanent-mock');
    evolvingStorage = createMockStorage('evolving-mock');
    registry = new InMemoryAnchorRegistry();
    dispatcher = new AnchorDispatcher(permanentStorage, evolvingStorage, registry);
  });

  const baseRequest: AnchorRequest = {
    artifact_type: 'epoch_bundle',
    artifact_id: 'epoch-001',
    agent_passport_id: 'agent-abc',
    producer: 'epochService',
    storage_tier: 'permanent',
    payload: { epoch: 1, root: '0xabc' },
  };

  it('uploads to permanent storage for permanent tier', async () => {
    const result = await dispatcher.dispatch(baseRequest);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('permanent-mock');
    expect(permanentStorage.uploadJSON).toHaveBeenCalled();
    expect(evolvingStorage.uploadJSON).not.toHaveBeenCalled();
  });

  it('uploads to evolving storage for evolving tier', async () => {
    const result = await dispatcher.dispatch({
      ...baseRequest,
      storage_tier: 'evolving',
    });
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('evolving-mock');
    expect(evolvingStorage.uploadJSON).toHaveBeenCalled();
    expect(permanentStorage.uploadJSON).not.toHaveBeenCalled();
  });

  it('writes registry record after upload', async () => {
    const result = await dispatcher.dispatch(baseRequest);
    expect(result).not.toBeNull();
    const record = await registry.getById(result!.anchor_id);
    expect(record).not.toBeNull();
    expect(record!.artifact_type).toBe('epoch_bundle');
    expect(record!.artifact_id).toBe('epoch-001');
    expect(record!.agent_passport_id).toBe('agent-abc');
  });

  it('returns null when DEPIN_UPLOAD_ENABLED=false', async () => {
    const original = process.env.DEPIN_UPLOAD_ENABLED;
    try {
      process.env.DEPIN_UPLOAD_ENABLED = 'false';
      const result = await dispatcher.dispatch(baseRequest);
      expect(result).toBeNull();
    } finally {
      if (original !== undefined) process.env.DEPIN_UPLOAD_ENABLED = original;
      else delete process.env.DEPIN_UPLOAD_ENABLED;
    }
  });
});

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('InMemoryAnchorRegistry', () => {
  let registry: InMemoryAnchorRegistry;

  beforeEach(() => {
    registry = new InMemoryAnchorRegistry();
  });

  const sampleInput = {
    artifact_type: 'memory_snapshot' as const,
    artifact_id: 'snap-001',
    agent_passport_id: 'agent-xyz',
    producer: 'archivePipeline',
    provider: 'mock',
    storage_tier: 'evolving' as const,
    cid: 'cid-aaa',
    content_hash: 'hash-aaa',
    url: 'http://mock/cid-aaa',
    size_bytes: 1024,
    parent_anchor_id: null,
    chain_tx: null,
    metadata: {},
  };

  it('create + getById round-trip', async () => {
    const created = await registry.create(sampleInput);
    expect(created.anchor_id).toBeDefined();
    expect(created.status).toBe('uploaded');
    expect(created.verified_at).toBeNull();

    const fetched = await registry.getById(created.anchor_id);
    expect(fetched).toEqual(created);
  });

  it('getByArtifact returns array', async () => {
    await registry.create(sampleInput);
    await registry.create({ ...sampleInput, content_hash: 'hash-bbb', cid: 'cid-bbb' });
    const results = await registry.getByArtifact('memory_snapshot', 'snap-001');
    expect(results).toHaveLength(2);
  });

  it('getLatestByArtifact returns most recent', async () => {
    const first = await registry.create(sampleInput);
    // Ensure distinct timestamps by advancing Date.now()
    const origNow = Date.now;
    Date.now = () => origNow.call(Date) + 1000;
    try {
      const second = await registry.create({ ...sampleInput, content_hash: 'hash-ccc', cid: 'cid-ccc' });
      const latest = await registry.getLatestByArtifact('memory_snapshot', 'snap-001');
      expect(latest).not.toBeNull();
      expect(latest!.anchor_id).toBe(second.anchor_id);
      expect(latest!.created_at).toBeGreaterThan(first.created_at);
    } finally {
      Date.now = origNow;
    }
  });

  it('getByCID lookup', async () => {
    const created = await registry.create(sampleInput);
    const found = await registry.getByCID('cid-aaa');
    expect(found).not.toBeNull();
    expect(found!.anchor_id).toBe(created.anchor_id);

    const notFound = await registry.getByCID('nonexistent');
    expect(notFound).toBeNull();
  });

  it('getByAgent with artifact_type filter', async () => {
    await registry.create(sampleInput);
    await registry.create({
      ...sampleInput,
      artifact_type: 'deploy_artifact',
      artifact_id: 'deploy-001',
      content_hash: 'hash-ddd',
      cid: 'cid-ddd',
    });

    const all = await registry.getByAgent('agent-xyz');
    expect(all).toHaveLength(2);

    const filtered = await registry.getByAgent('agent-xyz', { artifact_type: 'memory_snapshot' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].artifact_type).toBe('memory_snapshot');
  });
});

// ---------------------------------------------------------------------------
// Lineage tests
// ---------------------------------------------------------------------------

describe('Lineage', () => {
  let registry: InMemoryAnchorRegistry;

  beforeEach(() => {
    registry = new InMemoryAnchorRegistry();
  });

  const baseInput = {
    artifact_type: 'epoch_proof' as const,
    artifact_id: 'proof-chain',
    agent_passport_id: null,
    producer: 'epochService',
    provider: 'mock',
    storage_tier: 'permanent' as const,
    url: 'http://mock/x',
    size_bytes: 256,
    chain_tx: null,
    metadata: {},
  };

  it('getLineage walks parent chain (A -> B -> C returns [C, B, A])', async () => {
    const a = await registry.create({ ...baseInput, cid: 'cid-a', content_hash: 'h-a', parent_anchor_id: null });
    const b = await registry.create({ ...baseInput, cid: 'cid-b', content_hash: 'h-b', parent_anchor_id: a.anchor_id });
    const c = await registry.create({ ...baseInput, cid: 'cid-c', content_hash: 'h-c', parent_anchor_id: b.anchor_id });

    const lineage = await registry.getLineage(c.anchor_id);
    expect(lineage).toHaveLength(3);
    expect(lineage[0].anchor_id).toBe(c.anchor_id);
    expect(lineage[1].anchor_id).toBe(b.anchor_id);
    expect(lineage[2].anchor_id).toBe(a.anchor_id);
  });

  it('getLineage returns single record for no-parent', async () => {
    const a = await registry.create({ ...baseInput, cid: 'cid-solo', content_hash: 'h-solo', parent_anchor_id: null });
    const lineage = await registry.getLineage(a.anchor_id);
    expect(lineage).toHaveLength(1);
    expect(lineage[0].anchor_id).toBe(a.anchor_id);
  });
});

// ---------------------------------------------------------------------------
// Verifier tests
// ---------------------------------------------------------------------------

describe('AnchorVerifier', () => {
  let permanentStorage: IDepinStorage;
  let evolvingStorage: IDepinStorage;
  let registry: InMemoryAnchorRegistry;
  let verifier: AnchorVerifier;

  beforeEach(() => {
    permanentStorage = createMockStorage('permanent-mock');
    evolvingStorage = createMockStorage('evolving-mock');
    registry = new InMemoryAnchorRegistry();
    verifier = new AnchorVerifier(permanentStorage, evolvingStorage, registry);
  });

  it('verify sets status=verified when CID exists', async () => {
    // Upload something to the permanent mock so the CID exists
    const upload = await permanentStorage.uploadJSON({ test: true });
    const record = await registry.create({
      artifact_type: 'epoch_bundle',
      artifact_id: 'ep-1',
      agent_passport_id: null,
      producer: 'test',
      provider: 'permanent-mock',
      storage_tier: 'permanent',
      cid: upload.cid,
      content_hash: 'abc',
      url: upload.url,
      size_bytes: upload.sizeBytes,
      parent_anchor_id: null,
      chain_tx: null,
      metadata: {},
    });

    const result = await verifier.verify(record.anchor_id);
    expect(result.valid).toBe(true);

    const updated = await registry.getById(record.anchor_id);
    expect(updated!.status).toBe('verified');
  });

  it('verify sets status=unreachable when CID missing', async () => {
    const record = await registry.create({
      artifact_type: 'epoch_bundle',
      artifact_id: 'ep-2',
      agent_passport_id: null,
      producer: 'test',
      provider: 'permanent-mock',
      storage_tier: 'permanent',
      cid: 'nonexistent-cid',
      content_hash: 'xyz',
      url: 'http://mock/nonexistent-cid',
      size_bytes: 100,
      parent_anchor_id: null,
      chain_tx: null,
      metadata: {},
    });

    const result = await verifier.verify(record.anchor_id);
    expect(result.valid).toBe(false);

    const updated = await registry.getById(record.anchor_id);
    expect(updated!.status).toBe('unreachable');
  });
});

// ---------------------------------------------------------------------------
// Factory tests
// ---------------------------------------------------------------------------

describe('Factory (singletons)', () => {
  const originalStore = process.env.ANCHOR_REGISTRY_STORE;

  beforeEach(() => {
    process.env.ANCHOR_REGISTRY_STORE = 'memory';
    resetAnchoring();
  });

  afterAll(() => {
    if (originalStore !== undefined) process.env.ANCHOR_REGISTRY_STORE = originalStore;
    else delete process.env.ANCHOR_REGISTRY_STORE;
    resetAnchoring();
  });

  it('getAnchorDispatcher returns singleton', () => {
    const d1 = getAnchorDispatcher();
    const d2 = getAnchorDispatcher();
    expect(d1).toBe(d2);
  });

  it('resetAnchoring clears all singletons', () => {
    const d1 = getAnchorDispatcher();
    resetAnchoring();
    const d2 = getAnchorDispatcher();
    expect(d1).not.toBe(d2);
  });
});

// ---------------------------------------------------------------------------
// Content hash test
// ---------------------------------------------------------------------------

describe('Content hash', () => {
  it('dispatcher computes SHA-256 of canonical JSON payload', async () => {
    const permanentStorage = createMockStorage('permanent-mock');
    const evolvingStorage = createMockStorage('evolving-mock');
    const registry = new InMemoryAnchorRegistry();
    const dispatcher = new AnchorDispatcher(permanentStorage, evolvingStorage, registry);

    const payload = { z: 1, a: 2 }; // keys intentionally unordered
    const result = await dispatcher.dispatch({
      artifact_type: 'passport_metadata',
      artifact_id: 'pm-1',
      producer: 'test',
      storage_tier: 'permanent',
      payload,
    });

    expect(result).not.toBeNull();
    const record = await registry.getById(result!.anchor_id);
    expect(record).not.toBeNull();

    // canonicalJson sorts keys: {"a":2,"z":1}
    const { canonicalJson } = require('../../crypto/canonicalJson');
    const expected = createHash('sha256').update(Buffer.from(canonicalJson(payload))).digest('hex');
    expect(record!.content_hash).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Dedup test
// ---------------------------------------------------------------------------

describe('Dedup', () => {
  it('dispatch same artifact twice with same content produces single record', async () => {
    const permanentStorage = createMockStorage('permanent-mock');
    const evolvingStorage = createMockStorage('evolving-mock');
    const registry = new InMemoryAnchorRegistry();
    const dispatcher = new AnchorDispatcher(permanentStorage, evolvingStorage, registry);

    const request: AnchorRequest = {
      artifact_type: 'nft_metadata',
      artifact_id: 'nft-1',
      producer: 'nftService',
      storage_tier: 'permanent',
      payload: { name: 'Test NFT' },
    };

    const r1 = await dispatcher.dispatch(request);
    const r2 = await dispatcher.dispatch(request);

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    // Both should resolve to the same anchor_id due to dedup
    expect(r1!.anchor_id).toBe(r2!.anchor_id);

    // Registry should have exactly 1 record for this artifact
    const records = await registry.getByArtifact('nft_metadata', 'nft-1');
    expect(records).toHaveLength(1);
  });
});
