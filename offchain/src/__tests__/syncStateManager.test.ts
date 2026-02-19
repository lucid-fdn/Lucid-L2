// offchain/src/__tests__/syncStateManager.test.ts
// Unit tests for SyncStateManager (asset index, spaces state, metrics)

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SyncStateManager', () => {
  let SyncStateManager: any;
  let testDir: string;
  let stateFileName: string;

  beforeAll(() => {
    const mod = require('../services/syncStateManager');
    SyncStateManager = mod.SyncStateManager;
  });

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `sync-state-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    stateFileName = path.join(testDir, 'sync-state.json');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper: create a manager that writes to our test dir
  function createManager(): any {
    // SyncStateManager constructor joins with process.cwd()
    // We override stateFilePath by accessing the private field
    const manager = new SyncStateManager();
    // Override the internal path to use our temp dir
    (manager as any).stateFilePath = stateFileName;
    return manager;
  }

  describe('basic state management', () => {
    it('should create with default state', () => {
      const manager = createManager();
      expect(manager).toBeDefined();

      const state = manager.getState();
      expect(state.models).toBeDefined();
      expect(state.datasets).toBeDefined();
      expect(state.spaces).toBeDefined();
      expect(state.assetIndex).toBeDefined();
    });

    it('should save and load state', async () => {
      const manager = createManager();
      manager.updateModels({ total: 100, synced: 50, failed: 5 });
      await manager.save();

      expect(fs.existsSync(stateFileName)).toBe(true);

      const manager2 = createManager();
      await manager2.load();

      const state = manager2.getState();
      expect(state.models.total).toBe(100);
      expect(state.models.synced).toBe(50);
      expect(state.models.failed).toBe(5);
    });
  });

  describe('asset index', () => {
    let manager: any;

    beforeEach(() => {
      manager = createManager();
    });

    it('should set and get asset index entries', () => {
      manager.setAssetIndexEntry('hf-model-a', {
        hfId: 'hf-model-a',
        lastModified: '2024-01-15T00:00:00Z',
        onChainPDA: 'pdaA123',
        version: '1.0.0',
        contentHash: 'hash123',
      });

      const entry = manager.getAssetIndexEntry('hf-model-a');
      expect(entry).toBeDefined();
      expect(entry.hfId).toBe('hf-model-a');
      expect(entry.onChainPDA).toBe('pdaA123');
      expect(entry.version).toBe('1.0.0');
    });

    it('should return undefined for non-existent entries', () => {
      const entry = manager.getAssetIndexEntry('nonexistent');
      expect(entry).toBeUndefined();
    });

    it('should remove asset index entries', () => {
      manager.setAssetIndexEntry('hf-to-delete', {
        hfId: 'hf-to-delete',
        lastModified: '2024-01-01',
        onChainPDA: 'deletePDA',
        version: '1.0.0',
        contentHash: 'deleteHash',
      });

      expect(manager.getAssetIndexEntry('hf-to-delete')).toBeDefined();

      manager.removeAssetIndexEntry('hf-to-delete');
      expect(manager.getAssetIndexEntry('hf-to-delete')).toBeUndefined();
    });

    it('should get full asset index', () => {
      manager.setAssetIndexEntry('hf-a', {
        hfId: 'hf-a', lastModified: '2024-01-01', onChainPDA: 'pdaA', version: '1.0.0', contentHash: 'hashA',
      });
      manager.setAssetIndexEntry('hf-b', {
        hfId: 'hf-b', lastModified: '2024-01-02', onChainPDA: 'pdaB', version: '2.0.0', contentHash: 'hashB',
      });

      const index = manager.getAssetIndex();
      expect(Object.keys(index)).toHaveLength(2);
      expect(index['hf-a']).toBeDefined();
      expect(index['hf-b']).toBeDefined();
    });

    it('should persist asset index across save/load', async () => {
      manager.setAssetIndexEntry('hf-persist', {
        hfId: 'hf-persist',
        lastModified: '2024-06-15T12:00:00Z',
        onChainPDA: 'persistPDA',
        version: '3.1.0',
        contentHash: 'persistHash',
      });

      await manager.save();

      const manager2 = createManager();
      await manager2.load();

      const entry = manager2.getAssetIndexEntry('hf-persist');
      expect(entry).toBeDefined();
      expect(entry.version).toBe('3.1.0');
      expect(entry.onChainPDA).toBe('persistPDA');
    });
  });

  describe('spaces state', () => {
    let manager: any;

    beforeEach(() => {
      manager = createManager();
    });

    it('should track spaces sync progress', () => {
      manager.updateSpaces({ total: 50, synced: 45, failed: 5 });

      const progress = manager.getProgress();
      expect(progress.spaces.synced).toBe(45);
      expect(progress.spaces.total).toBe(50);
    });

    it('should update spaces incrementally', () => {
      manager.updateSpaces({ total: 100, synced: 10 });
      manager.updateSpaces({ synced: 50 });

      const state = manager.getState();
      expect(state.spaces.total).toBe(100);
      expect(state.spaces.synced).toBe(50);
    });
  });

  describe('metrics and progress', () => {
    let manager: any;

    beforeEach(() => {
      manager = createManager();
    });

    it('should calculate progress across all types', () => {
      manager.updateModels({ total: 100, synced: 90 });
      manager.updateDatasets({ total: 50, synced: 45 });
      manager.updateSpaces({ total: 30, synced: 25 });

      const progress = manager.getProgress();
      expect(progress.overall.synced).toBe(160);
      expect(progress.overall.total).toBe(180);
    });

    it('should include spaces in progress report', () => {
      manager.updateSpaces({ total: 100, synced: 95 });

      const progress = manager.getProgress();
      expect(progress.spaces).toBeDefined();
      expect(progress.spaces.synced).toBe(95);
      expect(progress.spaces.total).toBe(100);
      expect(progress.spaces.progress).toBe('95.0%');
    });

    it('should calculate throughput metrics', () => {
      manager.updateModels({ total: 100, synced: 50 });
      manager.updateDatasets({ total: 50, synced: 25 });
      manager.updateSpaces({ total: 30, synced: 15 });

      manager.calculateMetrics();

      const state = manager.getState();
      // Throughput should be defined (>= 0)
      expect(state.statistics.throughput).toBeDefined();
    });

    it('should track failed assets', () => {
      manager.addFailedAsset('bad-model', 'model', 'Network error');
      manager.addFailedAsset('bad-dataset', 'dataset', 'Parse error');

      const progress = manager.getProgress();
      expect(progress.failed).toBe(2);
    });

    it('should track failed asset retries', () => {
      manager.addFailedAsset('retry-model', 'model', 'Error 1');
      manager.addFailedAsset('retry-model', 'model', 'Error 2');

      const retryable = manager.getRetryableAssets(3);
      expect(retryable).toHaveLength(1);
      expect(retryable[0].attempts).toBe(2);
      expect(retryable[0].error).toBe('Error 2');
    });

    it('should remove failed assets after successful retry', () => {
      manager.addFailedAsset('fixed-model', 'model', 'Error');
      manager.removeFailedAsset('fixed-model', 'model');

      const progress = manager.getProgress();
      expect(progress.failed).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      const manager = createManager();
      manager.updateModels({ total: 100, synced: 50 });
      manager.setAssetIndexEntry('test', {
        hfId: 'test', lastModified: '', onChainPDA: '', version: '', contentHash: '',
      });

      manager.reset();

      const state = manager.getState();
      expect(state.models.total).toBe(0);
      expect(state.models.synced).toBe(0);
      expect(Object.keys(state.assetIndex)).toHaveLength(0);
    });
  });
});
