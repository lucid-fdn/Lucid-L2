/**
 * Tests for AgentMMRRegistry (Phase 6 DePIN rewrite)
 *
 * Validates that the registry correctly uses IDepinStorage
 * instead of the old IPFSStorageManager.
 */
import { AgentMMRRegistry } from '../utils/ipfsStorage';
import { IDepinStorage, UploadResult, UploadOptions } from '../storage/depin/IDepinStorage';
import { AgentMMR } from '../utils/mmr';
import { createHash } from 'crypto';

// =============================================================================
// In-memory mock implementing IDepinStorage
// =============================================================================

class InMemoryMockStorage implements IDepinStorage {
  readonly providerName = 'in-memory-mock';
  private store = new Map<string, Buffer>();

  async uploadJSON(data: unknown, options?: UploadOptions): Promise<UploadResult> {
    const json = JSON.stringify(data, null, 2);
    const buf = Buffer.from(json, 'utf-8');
    const cid = createHash('sha256').update(buf).digest('hex');
    this.store.set(cid, buf);
    return { cid, url: `mock://${cid}`, provider: this.providerName, sizeBytes: buf.length };
  }

  async uploadBytes(data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const cid = createHash('sha256').update(data).digest('hex');
    this.store.set(cid, data);
    return { cid, url: `mock://${cid}`, provider: this.providerName, sizeBytes: data.length };
  }

  async retrieve(cid: string): Promise<Buffer | null> {
    return this.store.get(cid) ?? null;
  }

  async exists(cid: string): Promise<boolean> {
    return this.store.has(cid);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  getUrl(cid: string): string {
    return `mock://${cid}`;
  }

  /** Test helper: clear all stored data */
  clear(): void {
    this.store.clear();
  }
}

// =============================================================================
// Mock getEvolvingStorage so the default constructor path is testable
// =============================================================================

// Mock both the proxy path and the engine path — engine path delegates to proxy
// so all spies share the same instances
jest.mock('../storage/depin', () => {
  const mockInstance = {
    providerName: 'jest-mock',
    uploadJSON: jest.fn(async (data: unknown) => ({
      cid: 'mock-cid-default',
      url: 'mock://mock-cid-default',
      provider: 'jest-mock',
      sizeBytes: 10,
    })),
    uploadBytes: jest.fn(async () => ({
      cid: 'mock-cid-bytes',
      url: 'mock://mock-cid-bytes',
      provider: 'jest-mock',
      sizeBytes: 10,
    })),
    retrieve: jest.fn(async () => null),
    exists: jest.fn(async () => false),
    isHealthy: jest.fn(async () => true),
    getUrl: jest.fn((cid: string) => `mock://${cid}`),
  };
  return {
    getEvolvingStorage: jest.fn(() => mockInstance),
    getPermanentStorage: jest.fn(() => mockInstance),
    resetDepinStorage: jest.fn(),
    __mockInstance: mockInstance,
  };
});
jest.mock('../../packages/engine/src/storage/depin', () => require('../storage/depin'));

// =============================================================================
// TESTS
// =============================================================================

describe('AgentMMRRegistry', () => {
  let storage: InMemoryMockStorage;
  let registry: AgentMMRRegistry;

  beforeEach(() => {
    storage = new InMemoryMockStorage();
    registry = new AgentMMRRegistry(storage);
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should use getEvolvingStorage() by default when no storage is passed', () => {
      const { getEvolvingStorage } = require('../storage/depin');
      const defaultRegistry = new AgentMMRRegistry();
      // The mock getEvolvingStorage should have been called
      expect(getEvolvingStorage).toHaveBeenCalled();
    });

    it('should accept a custom IDepinStorage via dependency injection', () => {
      const custom = new InMemoryMockStorage();
      const reg = new AgentMMRRegistry(custom);
      expect(reg.getDepinStorage()).toBe(custom);
    });
  });

  // ---------------------------------------------------------------------------
  // registerAgent
  // ---------------------------------------------------------------------------

  describe('registerAgent', () => {
    it('should create a new AgentMMR when called without a CID', async () => {
      const mmr = await registry.registerAgent('agent-1');
      expect(mmr).toBeInstanceOf(AgentMMR);
      expect(mmr.getAgentId()).toBe('agent-1');
      expect(mmr.getSize()).toBe(0);
    });

    it('should return existing MMR when registering the same agent twice', async () => {
      const mmr1 = await registry.registerAgent('agent-dup');
      const mmr2 = await registry.registerAgent('agent-dup');
      expect(mmr1).toBe(mmr2);
    });

    it('should load agent from DePIN storage when CID is provided', async () => {
      // First: create an agent, process an epoch, get a real CID
      const reg1 = new AgentMMRRegistry(storage);
      await reg1.registerAgent('agent-load');
      const vectors = [createHash('sha256').update('v1').digest()];
      const { depinCid } = await reg1.processAgentEpoch('agent-load', vectors, 1);
      expect(depinCid).toBeTruthy();

      // Second: create a fresh registry and load from that CID
      const reg2 = new AgentMMRRegistry(storage);
      const loaded = await reg2.registerAgent('agent-load', depinCid);
      expect(loaded).toBeInstanceOf(AgentMMR);
      expect(loaded.getAgentId()).toBe('agent-load');
    });

    it('should fall back to new AgentMMR when CID is not found', async () => {
      const mmr = await registry.registerAgent('agent-missing', 'nonexistent-cid');
      expect(mmr).toBeInstanceOf(AgentMMR);
      expect(mmr.getAgentId()).toBe('agent-missing');
      expect(mmr.getSize()).toBe(0);
    });

    it('should fall back to new AgentMMR when retrieve throws', async () => {
      const failStorage: IDepinStorage = {
        providerName: 'fail-storage',
        uploadJSON: jest.fn(),
        uploadBytes: jest.fn(),
        retrieve: jest.fn(async () => { throw new Error('network error'); }),
        exists: jest.fn(async () => false),
        isHealthy: jest.fn(async () => false),
        getUrl: jest.fn(),
      };
      const failRegistry = new AgentMMRRegistry(failStorage);
      const mmr = await failRegistry.registerAgent('agent-err', 'bad-cid');
      expect(mmr).toBeInstanceOf(AgentMMR);
      expect(mmr.getSize()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // processAgentEpoch
  // ---------------------------------------------------------------------------

  describe('processAgentEpoch', () => {
    it('should throw if agent is not registered', async () => {
      await expect(
        registry.processAgentEpoch('unregistered', [Buffer.alloc(32)], 1)
      ).rejects.toThrow('not registered');
    });

    it('should return root and depinCid after processing', async () => {
      await registry.registerAgent('agent-ep');
      const vectors = [
        createHash('sha256').update('hello').digest(),
        createHash('sha256').update('world').digest(),
      ];
      const result = await registry.processAgentEpoch('agent-ep', vectors, 1);

      expect(result.root).toBeInstanceOf(Buffer);
      expect(result.root.length).toBe(32);
      expect(result.depinCid).toBeTruthy();
      expect(typeof result.depinCid).toBe('string');
    });

    it('should upload serialized data (base64 JSON) to DePIN storage', async () => {
      await registry.registerAgent('agent-serial');
      const vec = createHash('sha256').update('data').digest();
      const { depinCid } = await registry.processAgentEpoch('agent-serial', [vec], 1);

      // Retrieve and verify the stored JSON has base64-encoded fields
      const raw = await storage.retrieve(depinCid);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!.toString());
      expect(parsed.agentId).toBe('agent-serial');
      expect(parsed.version).toBe('1.0');
      // peaks should be base64 strings
      expect(Array.isArray(parsed.mmrState.peaks)).toBe(true);
      if (parsed.mmrState.peaks.length > 0) {
        expect(typeof parsed.mmrState.peaks[0]).toBe('string');
      }
      // rootHistory roots should be base64 strings
      expect(parsed.rootHistory.length).toBeGreaterThan(0);
      expect(typeof parsed.rootHistory[0].root).toBe('string');
    });

    it('should update the stored CID after each epoch', async () => {
      await registry.registerAgent('agent-multi');
      const v1 = createHash('sha256').update('epoch1').digest();
      const { depinCid: cid1 } = await registry.processAgentEpoch('agent-multi', [v1], 1);

      const v2 = createHash('sha256').update('epoch2').digest();
      const { depinCid: cid2 } = await registry.processAgentEpoch('agent-multi', [v2], 2);

      expect(cid1).not.toBe(cid2);
      expect(registry.getAgentCID('agent-multi')).toBe(cid2);
    });
  });

  // ---------------------------------------------------------------------------
  // getAgent / getAgentCID / listAgents
  // ---------------------------------------------------------------------------

  describe('getAgent', () => {
    it('should return AgentMMR for registered agent', async () => {
      await registry.registerAgent('a1');
      expect(registry.getAgent('a1')).toBeInstanceOf(AgentMMR);
    });

    it('should return null for unknown agent', () => {
      expect(registry.getAgent('unknown')).toBeNull();
    });
  });

  describe('getAgentCID', () => {
    it('should return null before any epoch is processed', async () => {
      await registry.registerAgent('a2');
      expect(registry.getAgentCID('a2')).toBeNull();
    });

    it('should return CID after epoch processing', async () => {
      await registry.registerAgent('a3');
      const v = createHash('sha256').update('x').digest();
      await registry.processAgentEpoch('a3', [v], 1);
      expect(registry.getAgentCID('a3')).toBeTruthy();
    });

    it('should return null for unknown agent', () => {
      expect(registry.getAgentCID('nope')).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('should return empty array initially', () => {
      expect(registry.listAgents()).toEqual([]);
    });

    it('should return registered agent IDs', async () => {
      await registry.registerAgent('x');
      await registry.registerAgent('y');
      await registry.registerAgent('z');
      const list = registry.listAgents();
      expect(list).toContain('x');
      expect(list).toContain('y');
      expect(list).toContain('z');
      expect(list.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Health checks
  // ---------------------------------------------------------------------------

  describe('checkStorageHealth', () => {
    it('should delegate to storage.isHealthy()', async () => {
      const result = await registry.checkStorageHealth();
      expect(result).toBe(true);
    });

    it('should return false when storage is unhealthy', async () => {
      const unhealthy: IDepinStorage = {
        providerName: 'unhealthy',
        uploadJSON: jest.fn(),
        uploadBytes: jest.fn(),
        retrieve: jest.fn(async () => null),
        exists: jest.fn(async () => false),
        isHealthy: jest.fn(async () => false),
        getUrl: jest.fn(),
      };
      const reg = new AgentMMRRegistry(unhealthy);
      expect(await reg.checkStorageHealth()).toBe(false);
    });
  });

  describe('checkIPFSConnection', () => {
    it('should be an alias for checkStorageHealth', async () => {
      const result = await registry.checkIPFSConnection();
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Serialization roundtrip
  // ---------------------------------------------------------------------------

  describe('serialization roundtrip', () => {
    it('should preserve data integrity through store -> retrieve cycle', async () => {
      // Create agent and process two epochs
      await registry.registerAgent('rt-agent');
      const v1 = createHash('sha256').update('leaf-1').digest();
      const v2 = createHash('sha256').update('leaf-2').digest();
      const v3 = createHash('sha256').update('leaf-3').digest();

      await registry.processAgentEpoch('rt-agent', [v1, v2], 1);
      const { root: root2, depinCid } = await registry.processAgentEpoch('rt-agent', [v3], 2);

      // Load into a fresh registry from the CID
      const reg2 = new AgentMMRRegistry(storage);
      const loaded = await reg2.registerAgent('rt-agent', depinCid);

      // Verify the loaded MMR has the same agent ID
      expect(loaded.getAgentId()).toBe('rt-agent');

      // Verify the state was loaded (size should match)
      // The loaded MMR should have the same state as the original after 2 epochs
      const original = registry.getAgent('rt-agent')!;
      expect(loaded.getState().size).toBe(original.getState().size);
    });
  });
});
