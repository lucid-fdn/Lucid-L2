/**
 * Tests for MMRService (services/receipt/mmrService.ts)
 *
 * Validates agent lifecycle, epoch processing, and DePIN integration.
 * Solana calls are fully mocked — no network access.
 */
import { createHash } from 'crypto';

// =============================================================================
// Mock Solana dependencies BEFORE importing MMRService
// =============================================================================

const solanaClientMock = {
  initSolana: jest.fn(() => ({
    methods: {
      commitEpoch: jest.fn(() => ({
        accounts: jest.fn(() => ({
          rpc: jest.fn(async () => 'mock_solana_sig_' + Date.now()),
        })),
      })),
    },
  })),
  getKeypair: jest.fn(() => ({
    publicKey: { toBase58: () => 'MockPublicKey11111111111111111111111111111111' },
  })),
};

const solanaGasMock = {
  calculateGasCost: jest.fn((type: string, count: number) => ({
    iGas: type === 'single' ? 1 : 2,
    mGas: count * 5,
    total: (type === 'single' ? 1 : 2) + count * 5,
  })),
};

// Mock both proxy paths and engine paths (engine code uses different import paths)
jest.mock('../solana/client', () => solanaClientMock);
jest.mock('../../packages/engine/src/chain/solana/client', () => solanaClientMock);
jest.mock('../solana/gas', () => solanaGasMock);
jest.mock('../../packages/engine/src/chain/solana/gas', () => solanaGasMock);

// Mock the DePIN storage so AgentMMRRegistry uses in-memory storage
function createDepinMock() {
  const { createHash: ch } = require('crypto');
  const store = new Map<string, Buffer>();

  const mockStorage = {
    providerName: 'mmr-test-mock',
    uploadJSON: jest.fn(async (data: unknown) => {
      const json = JSON.stringify(data, null, 2);
      const buf = Buffer.from(json, 'utf-8');
      const cid = ch('sha256').update(buf).digest('hex');
      store.set(cid, buf);
      return { cid, url: `mock://${cid}`, provider: 'mmr-test-mock', sizeBytes: buf.length };
    }),
    uploadBytes: jest.fn(async (data: Buffer) => {
      const cid = ch('sha256').update(data).digest('hex');
      store.set(cid, data);
      return { cid, url: `mock://${cid}`, provider: 'mmr-test-mock', sizeBytes: data.length };
    }),
    retrieve: jest.fn(async (cid: string) => store.get(cid) ?? null),
    exists: jest.fn(async (cid: string) => store.has(cid)),
    isHealthy: jest.fn(async () => true),
    getUrl: jest.fn((cid: string) => `mock://${cid}`),
  };

  return {
    getEvolvingStorage: jest.fn(() => mockStorage),
    getPermanentStorage: jest.fn(() => mockStorage),
    resetDepinStorage: jest.fn(() => store.clear()),
    __mockStorage: mockStorage,
    __store: store,
  };
}

const depinMock = createDepinMock();
jest.mock('../storage/depin', () => depinMock);
jest.mock('../../packages/engine/src/storage/depin', () => depinMock);

import { MMRService, getMMRService, MMRCommitResult, AgentEpochData } from '../services/receipt/mmrService';

// =============================================================================
// TESTS
// =============================================================================

describe('MMRService', () => {
  let service: MMRService;

  beforeEach(() => {
    service = new MMRService();
  });

  // ---------------------------------------------------------------------------
  // initializeAgent
  // ---------------------------------------------------------------------------

  describe('initializeAgent', () => {
    it('should create a new agent', async () => {
      const mmr = await service.initializeAgent('agent-init');
      expect(mmr).toBeDefined();
      expect(mmr.getAgentId()).toBe('agent-init');
      expect(mmr.getSize()).toBe(0);
    });

    it('should load agent from DePIN CID when provided', async () => {
      // First create and process an epoch to get a real CID
      await service.initializeAgent('agent-cid');
      const result = await service.processAgentEpoch({
        agentId: 'agent-cid',
        vectors: ['hello-world'],
        epochNumber: 1,
      });

      // Create a fresh service and load from the CID
      const service2 = new MMRService();
      const loaded = await service2.initializeAgent('agent-cid', result.depinCid);
      expect(loaded).toBeDefined();
      expect(loaded.getAgentId()).toBe('agent-cid');
    });
  });

  // ---------------------------------------------------------------------------
  // processAgentEpoch
  // ---------------------------------------------------------------------------

  describe('processAgentEpoch', () => {
    it('should return MMRCommitResult with depinCid (not ipfsCid)', async () => {
      await service.initializeAgent('agent-proc');

      const epochData: AgentEpochData = {
        agentId: 'agent-proc',
        vectors: ['vector-1', 'vector-2'],
        epochNumber: 1,
      };

      const result = await service.processAgentEpoch(epochData);

      expect(result).toBeDefined();
      expect(result.mmrRoot).toBeInstanceOf(Buffer);
      expect(result.mmrRoot.length).toBe(32);
      expect(result.depinCid).toBeTruthy();
      expect(typeof result.depinCid).toBe('string');
      expect(result.transactionSignature).toBeTruthy();
      expect(result.epochNumber).toBe(1);
      expect(result.gasCost).toBeDefined();
      expect(result.gasCost.iGas).toBe(1);
      expect(result.gasCost.mGas).toBe(5);
      expect(result.gasCost.total).toBe(6);

      // Ensure there's no 'ipfsCid' field leaking through
      expect((result as any).ipfsCid).toBeUndefined();
    });

    it('should convert text vectors to SHA-256 hashes', async () => {
      await service.initializeAgent('agent-hash');
      const result = await service.processAgentEpoch({
        agentId: 'agent-hash',
        vectors: ['test-text'],
        epochNumber: 1,
      });

      // Verify root is non-zero (vectors were hashed and appended)
      const zeroRoot = Buffer.alloc(32);
      expect(result.mmrRoot.equals(zeroRoot)).toBe(false);
    });

    it('should throw for unregistered agent', async () => {
      await expect(
        service.processAgentEpoch({
          agentId: 'nonexistent',
          vectors: ['x'],
          epochNumber: 1,
        })
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getAgentDepinCID
  // ---------------------------------------------------------------------------

  describe('getAgentDepinCID', () => {
    it('should return CID after epoch processing', async () => {
      await service.initializeAgent('agent-depin');
      await service.processAgentEpoch({
        agentId: 'agent-depin',
        vectors: ['v1'],
        epochNumber: 1,
      });

      const cid = service.getAgentDepinCID('agent-depin');
      expect(cid).toBeTruthy();
      expect(typeof cid).toBe('string');
    });

    it('should return null for agent without processed epochs', async () => {
      await service.initializeAgent('agent-no-epoch');
      expect(service.getAgentDepinCID('agent-no-epoch')).toBeNull();
    });

    it('should return null for unknown agent', () => {
      expect(service.getAgentDepinCID('unknown')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getAgentStats
  // ---------------------------------------------------------------------------

  describe('getAgentStats', () => {
    it('should return null for unknown agent', async () => {
      const stats = await service.getAgentStats('ghost');
      expect(stats).toBeNull();
    });

    it('should return stats with depinCid field', async () => {
      await service.initializeAgent('agent-stats');
      await service.processAgentEpoch({
        agentId: 'agent-stats',
        vectors: ['s1', 's2'],
        epochNumber: 1,
      });

      const stats = await service.getAgentStats('agent-stats');
      expect(stats).not.toBeNull();
      expect(stats!.agentId).toBe('agent-stats');
      expect(stats!.mmrSize).toBeGreaterThan(0);
      expect(stats!.totalEpochs).toBe(1);
      expect(stats!.currentRoot).toBeTruthy();
      expect(stats!.depinCid).toBeTruthy();
      expect(stats!.lastUpdated).toBeGreaterThan(0);

      // Ensure there's no 'ipfsCid' leaking
      expect((stats as any).ipfsCid).toBeUndefined();
    });

    it('should show depinCid as null before any epoch', async () => {
      await service.initializeAgent('agent-stats-empty');
      const stats = await service.getAgentStats('agent-stats-empty');
      expect(stats!.depinCid).toBeNull();
      expect(stats!.totalEpochs).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // listAgents
  // ---------------------------------------------------------------------------

  describe('listAgents', () => {
    it('should return empty list initially', () => {
      expect(service.listAgents()).toEqual([]);
    });

    it('should return registered agent IDs', async () => {
      await service.initializeAgent('a');
      await service.initializeAgent('b');
      const list = service.listAgents();
      expect(list).toContain('a');
      expect(list).toContain('b');
      expect(list.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // checkStorageHealth
  // ---------------------------------------------------------------------------

  describe('checkStorageHealth', () => {
    it('should delegate to registry and return true', async () => {
      const health = await service.checkStorageHealth();
      expect(health).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  describe('getMMRService', () => {
    it('should return an instance of MMRService', () => {
      const instance = getMMRService();
      expect(instance).toBeInstanceOf(MMRService);
    });
  });
});
