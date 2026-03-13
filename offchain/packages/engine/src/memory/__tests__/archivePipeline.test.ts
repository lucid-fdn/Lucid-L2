import { ArchivePipeline } from '../archivePipeline';
import { InMemoryMemoryStore } from '../store/in-memory';
import { computeMemoryHash } from '../commitments';
import type { LucidMemoryFile } from '../types';

// Mock DePIN storage
const mockStorage = {
  providerName: 'mock',
  uploadJSON: jest.fn().mockResolvedValue({ cid: 'bafymock123', url: 'http://mock/bafymock123' }),
  uploadBytes: jest.fn().mockResolvedValue({ cid: 'bafymock456', url: 'http://mock/bafymock456' }),
  retrieve: jest.fn(),
};

// Mock signing
jest.mock('../../crypto/signing', () => ({
  signMessage: jest.fn().mockReturnValue({
    signature: 'mocksig123',
    publicKey: 'mockpub456',
  }),
  verifySignature: jest.fn().mockReturnValue(true),
  getOrchestratorPublicKey: jest.fn().mockReturnValue('mockpub456'),
}));

describe('ArchivePipeline', () => {
  let pipeline: ArchivePipeline;
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    pipeline = new ArchivePipeline(store, mockStorage as any, async () => 'mockpub456');
    jest.clearAllMocks();
  });

  describe('createSnapshot', () => {
    it('should serialize entries, compute MMR root, sign, and upload', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'agent-1', namespace: 'agent:agent-1',
        content: 'Fact 1', fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        memory_lane: 'self', content: 'Fact 1', metadata: {}, fact: 'F1', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      await store.createSession({
        session_id: 's1', agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1', status: 'active',
      });

      const result = await pipeline.createSnapshot('agent-1', 'checkpoint');

      expect(result.cid).toBe('bafymock123');
      expect(result.snapshot_id).toBeDefined();
      expect(mockStorage.uploadJSON).toHaveBeenCalledTimes(1);

      // Verify the uploaded data is a valid LMF
      const uploadedData = mockStorage.uploadJSON.mock.calls[0][0] as LucidMemoryFile;
      expect(uploadedData.version).toBe('1.0');
      expect(uploadedData.agent_passport_id).toBe('agent-1');
      expect(uploadedData.entry_count).toBe(1);
      expect(uploadedData.content_mmr_root).toBeDefined();
      expect(uploadedData.signature).toBe('mocksig123');
      expect(uploadedData.signer_pubkey).toBe('mockpub456');
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore entries in merge mode (skip existing)', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'agent-1', namespace: 'agent:agent-1',
        content: 'Existing fact', fact: 'Existing', confidence: 1, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        memory_lane: 'self', content: 'Existing fact', metadata: {}, fact: 'Existing', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      const lmf: LucidMemoryFile = {
        version: '1.0',
        agent_passport_id: 'agent-1',
        created_at: Date.now(),
        chain_head_hash: h1,
        entries: [{
          memory_id: 'imported-1',
          agent_passport_id: 'agent-1',
          type: 'semantic',
          namespace: 'agent:agent-1',
          content: 'Existing fact',
          status: 'active',
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: {},
          content_hash: h1,
          prev_hash: null,
          fact: 'Existing',
          confidence: 1,
          source_memory_ids: [],
        } as any],
        provenance: [],
        sessions: [],
        entry_count: 1,
        content_mmr_root: 'mock-root',
        signature: 'mocksig123',
        signer_pubkey: 'mockpub456',
      };

      mockStorage.retrieve.mockResolvedValue(lmf);

      const result = await pipeline.restoreSnapshot('agent-1', { cid: 'bafymock', mode: 'merge' });

      expect(result.entries_imported).toBe(0); // Skipped because content_hash matches
      expect(result.entries_skipped).toBe(1);
    });
  });

  describe('serializeLMF', () => {
    it('should produce a valid LMF structure', () => {
      const entries = [{
        memory_id: 'm1', agent_passport_id: 'a', type: 'semantic' as const,
        namespace: 'ns', memory_lane: 'self' as const, content: 'F', status: 'active' as const,
        created_at: Date.now(), updated_at: Date.now(), metadata: {},
        content_hash: 'h1', prev_hash: null,
      }];

      const lmf = ArchivePipeline.serializeLMF(entries, [], [], 'a');

      expect(lmf.version).toBe('1.0');
      expect(lmf.agent_passport_id).toBe('a');
      expect(lmf.entry_count).toBe(1);
      expect(lmf.content_mmr_root).toBeDefined();
      expect(lmf.chain_head_hash).toBe('h1');
    });
  });

  describe('verifyLMF', () => {
    it('should verify a valid LMF', () => {
      const lmf: LucidMemoryFile = {
        version: '1.0',
        agent_passport_id: 'a',
        created_at: Date.now(),
        chain_head_hash: 'h1',
        entries: [{
          memory_id: 'm1', agent_passport_id: 'a', type: 'semantic',
          namespace: 'ns', content: 'F', status: 'active',
          created_at: Date.now(), updated_at: Date.now(), metadata: {},
          content_hash: 'h1', prev_hash: null,
        } as any],
        provenance: [],
        sessions: [],
        entry_count: 1,
        content_mmr_root: 'some-root',
        signature: 'mocksig',
        signer_pubkey: 'mockpub',
      };

      const result = ArchivePipeline.verifyLMF(lmf);
      expect(result.valid).toBe(true);
    });

    it('should reject LMF with wrong entry_count', () => {
      const lmf: LucidMemoryFile = {
        version: '1.0',
        agent_passport_id: 'a',
        created_at: Date.now(),
        chain_head_hash: 'h1',
        entries: [],
        provenance: [],
        sessions: [],
        entry_count: 5, // Wrong!
        content_mmr_root: 'root',
        signature: 'sig',
        signer_pubkey: 'pub',
      };

      const result = ArchivePipeline.verifyLMF(lmf);
      expect(result.valid).toBe(false);
    });
  });
});
