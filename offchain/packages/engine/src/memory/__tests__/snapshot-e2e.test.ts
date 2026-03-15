import { ArchivePipeline } from '../archivePipeline';
import { SQLiteMemoryStore } from '../store/sqlite/store';
import { computeMemoryHash } from '../commitments';
import type { LucidMemoryFile } from '../types';

// Shared dispatch mock — same instance used by both jest.mock and test assertions
const mockDispatch = jest.fn().mockResolvedValue({
  anchor_id: 'a1',
  cid: 'bafysnap-e2e',
  url: 'http://mock/bafysnap-e2e',
  provider: 'mock',
  size_bytes: 100,
});

// Mock anchoring module
jest.mock('../../anchoring', () => ({
  getAnchorDispatcher: () => ({
    dispatch: mockDispatch,
  }),
}));

// Mock DePIN storage for restore reads
const mockEvolvingRetrieve = jest.fn();
jest.mock('../../shared/depin', () => ({
  getEvolvingStorage: () => ({ retrieve: mockEvolvingRetrieve }),
}));

// Mock signing
jest.mock('../../shared/crypto/signing', () => ({
  signMessage: jest.fn().mockReturnValue({
    signature: 'mocksig-snapshot-e2e',
    publicKey: 'mockpub-snapshot-e2e',
  }),
  verifySignature: jest.fn().mockReturnValue(true),
  getOrchestratorPublicKey: jest.fn().mockReturnValue('mockpub-snapshot-e2e'),
}));

describe('Snapshot E2E (SQLite)', () => {
  let store: SQLiteMemoryStore;
  let pipeline: ArchivePipeline;

  beforeEach(() => {
    store = new SQLiteMemoryStore(':memory:');
    pipeline = new ArchivePipeline(store, async () => 'mockpub-snapshot-e2e');
    jest.clearAllMocks();
    // Re-set default resolved value after clearAllMocks
    mockDispatch.mockResolvedValue({
      anchor_id: 'a1',
      cid: 'bafysnap-e2e',
      url: 'http://mock/bafysnap-e2e',
      provider: 'mock',
      size_bytes: 100,
    });
  });

  afterEach(() => {
    store.close();
  });

  test('write entries -> create snapshot -> verify snapshot saved', async () => {
    // Write some entries
    const hash1 = computeMemoryHash({
      type: 'semantic', agent_passport_id: 'agent-snap',
      namespace: 'agent:agent-snap', content: 'Snapshot fact 1',
      fact: 'Snapshot fact 1', confidence: 0.9, source_memory_ids: [],
    });
    await store.write({
      agent_passport_id: 'agent-snap', type: 'semantic',
      namespace: 'agent:agent-snap', memory_lane: 'self',
      content: 'Snapshot fact 1', metadata: {},
      fact: 'Snapshot fact 1', confidence: 0.9, source_memory_ids: [],
      content_hash: hash1, prev_hash: null,
    } as any);

    const hash2 = computeMemoryHash({
      type: 'semantic', agent_passport_id: 'agent-snap',
      namespace: 'agent:agent-snap', content: 'Snapshot fact 2',
      fact: 'Snapshot fact 2', confidence: 0.85, source_memory_ids: [],
    });
    await store.write({
      agent_passport_id: 'agent-snap', type: 'semantic',
      namespace: 'agent:agent-snap', memory_lane: 'self',
      content: 'Snapshot fact 2', metadata: {},
      fact: 'Snapshot fact 2', confidence: 0.85, source_memory_ids: [],
      content_hash: hash2, prev_hash: hash1,
    } as any);

    // Create a session (required by serializeLMF)
    await store.createSession({
      session_id: 'sess-snap', agent_passport_id: 'agent-snap',
      namespace: 'agent:agent-snap', status: 'active',
    });

    // Create snapshot
    const result = await pipeline.createSnapshot('agent-snap', 'checkpoint');

    expect(result.cid).toBe('bafysnap-e2e');
    expect(result.snapshot_id).toBeDefined();

    // Verify snapshot was saved to the store
    const latestSnapshot = await store.getLatestSnapshot('agent-snap');
    expect(latestSnapshot).not.toBeNull();
    expect(latestSnapshot!.snapshot_id).toBe(result.snapshot_id);
    expect(latestSnapshot!.depin_cid).toBe('bafysnap-e2e');
    expect(latestSnapshot!.entry_count).toBe(2);
    expect(latestSnapshot!.snapshot_type).toBe('checkpoint');

    // Verify the uploaded LMF via the dispatch mock
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const uploadedLmf = mockDispatch.mock.calls[0][0].payload as LucidMemoryFile;
    expect(uploadedLmf.version).toBe('1.0');
    expect(uploadedLmf.agent_passport_id).toBe('agent-snap');
    expect(uploadedLmf.entry_count).toBe(2);
    expect(uploadedLmf.entries).toHaveLength(2);
    expect(uploadedLmf.signature).toBe('mocksig-snapshot-e2e');
    expect(uploadedLmf.content_mmr_root).toBeDefined();
    expect(uploadedLmf.content_mmr_root.length).toBeGreaterThan(0);
  });

  test('identity verification: rejects restore with mismatched agent_passport_id', async () => {
    // Create an LMF owned by agent-owner
    const lmf: LucidMemoryFile = {
      version: '1.0',
      agent_passport_id: 'agent-owner',
      created_at: Date.now(),
      chain_head_hash: 'h-owner',
      entries: [],
      provenance: [],
      sessions: [],
      entry_count: 0,
      content_mmr_root: '',
      signature: 'mocksig-snapshot-e2e',
      signer_pubkey: 'mockpub-snapshot-e2e',
    };
    mockEvolvingRetrieve.mockResolvedValue(lmf);

    // Attempt to restore as a different agent
    await expect(
      pipeline.restoreSnapshot('agent-impersonator', { cid: 'bafysnap-e2e', mode: 'replace' }),
    ).rejects.toThrow('Identity mismatch');
  });

  test('admin bypass: __admin__ can restore any agent snapshot', async () => {
    // Create an LMF owned by agent-owner
    const lmf: LucidMemoryFile = {
      version: '1.0',
      agent_passport_id: 'agent-owner',
      created_at: Date.now(),
      chain_head_hash: 'h-admin',
      entries: [{
        memory_id: 'imported-1',
        agent_passport_id: 'agent-owner',
        type: 'semantic',
        namespace: 'agent:agent-owner',
        memory_lane: 'self',
        content: 'Restored fact',
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
        content_hash: 'h-restored',
        prev_hash: null,
        fact: 'Restored fact',
        confidence: 0.95,
        source_memory_ids: [],
        embedding_status: 'skipped',
        embedding_attempts: 0,
      } as any],
      provenance: [],
      sessions: [],
      entry_count: 1,
      content_mmr_root: 'root',
      signature: 'mocksig-snapshot-e2e',
      signer_pubkey: 'mockpub-snapshot-e2e',
    };
    mockEvolvingRetrieve.mockResolvedValue(lmf);

    // Restore as __admin__ — should succeed
    const result = await pipeline.restoreSnapshot('__admin__', {
      cid: 'bafysnap-e2e',
      mode: 'replace',
    });

    expect(result.entries_imported).toBe(1);
    expect(result.source_agent_passport_id).toBe('agent-owner');
  });
});
