// offchain/src/__tests__/deprecationDetector.test.ts
// Unit tests for DeprecationDetector

import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock syncStateManager
const mockAssetIndex: Record<string, any> = {};
jest.mock('../services/hf/syncStateManager', () => ({
  getSyncStateManager: jest.fn(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    getAssetIndex: jest.fn(() => mockAssetIndex),
    removeAssetIndexEntry: jest.fn((key: string) => {
      delete mockAssetIndex[key];
    }),
  })),
  SyncStateManager: jest.fn(),
}));
// Dual-path: gateway-lite imports ./syncStateManager relative to its own file
jest.mock('../../packages/gateway-lite/src/integrations/hf/syncStateManager', () =>
  require('../services/hf/syncStateManager'));

// Mock hfBridgeService
jest.mock('../services/hf/hfBridgeService', () => ({
  getHFBridgeService: jest.fn(() => ({})),
  HFBridgeService: jest.fn(),
}));
// Dual-path: gateway-lite imports ./hfBridgeService relative to its own file
jest.mock('../../packages/gateway-lite/src/integrations/hf/hfBridgeService', () =>
  require('../services/hf/hfBridgeService'));

// Mock passportSyncService
const mockUpdatePassportStatus = jest.fn().mockResolvedValue('mock-tx-id');
jest.mock('../services/passport/passportSyncService', () => ({
  getPassportSyncService: jest.fn(() => ({
    updatePassportStatus: mockUpdatePassportStatus,
  })),
  PassportSyncService: jest.fn(),
}));
// Dual-path: gateway-lite deprecationDetector imports from ../../../../engine/src/passport/passportSyncService
jest.mock('../../packages/engine/src/passport/passportSyncService', () =>
  require('../services/passport/passportSyncService'));

describe('DeprecationDetector', () => {
  let DeprecationDetector: any;
  let getDeprecationDetector: any;

  beforeAll(() => {
    const mod = require('../services/hf/deprecationDetector');
    DeprecationDetector = mod.DeprecationDetector;
    getDeprecationDetector = mod.getDeprecationDetector;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear asset index
    Object.keys(mockAssetIndex).forEach(key => delete mockAssetIndex[key]);
  });

  describe('detectAndRevoke', () => {
    it('should return zeros when asset index is empty', async () => {
      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(0);
      expect(result.revoked).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it('should not revoke assets that still exist on HuggingFace', async () => {
      mockAssetIndex['hf-meta-llama/Llama-2-7b'] = {
        hfId: 'hf-meta-llama/Llama-2-7b',
        onChainPDA: 'somePDA123',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'abc123',
      };

      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(1);
      expect(result.revoked).toBe(0);
      expect(mockUpdatePassportStatus).not.toHaveBeenCalled();
    });

    it('should revoke assets deleted from HuggingFace', async () => {
      mockAssetIndex['hf-deleted-model/old'] = {
        hfId: 'hf-deleted-model/old',
        onChainPDA: 'deletedPDA456',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'def456',
      };

      mockedAxios.head.mockResolvedValue({ status: 404 } as any);

      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(1);
      expect(result.revoked).toBe(1);
      expect(result.details[0].hfId).toBe('hf-deleted-model/old');
      expect(result.details[0].reason).toContain('deleted');
      expect(mockUpdatePassportStatus).toHaveBeenCalledWith('deletedPDA456', 3); // REVOKED
    });

    it('should not revoke on network errors (conservative approach)', async () => {
      mockAssetIndex['hf-network-issue/model'] = {
        hfId: 'hf-network-issue/model',
        onChainPDA: 'networkPDA789',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'ghi789',
      };

      mockedAxios.head.mockRejectedValue(new Error('ECONNREFUSED'));

      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(1);
      expect(result.revoked).toBe(0);
      expect(mockUpdatePassportStatus).not.toHaveBeenCalled();
    });

    it('should handle mixed results (some exist, some deleted)', async () => {
      mockAssetIndex['hf-model-a'] = {
        hfId: 'hf-model-a',
        onChainPDA: 'pdaA',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'hashA',
      };
      mockAssetIndex['hf-model-b'] = {
        hfId: 'hf-model-b',
        onChainPDA: 'pdaB',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'hashB',
      };
      mockAssetIndex['hf-model-c'] = {
        hfId: 'hf-model-c',
        onChainPDA: 'pdaC',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'hashC',
      };

      mockedAxios.head
        .mockResolvedValueOnce({ status: 200 } as any) // model-a exists
        .mockResolvedValueOnce({ status: 404 } as any) // model-b deleted
        .mockResolvedValueOnce({ status: 200 } as any); // model-c exists

      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(3);
      expect(result.revoked).toBe(1);
      expect(result.details[0].hfId).toBe('hf-model-b');
    });

    it('should construct correct API URLs for different asset types', async () => {
      mockAssetIndex['hf-space-gradio/demo'] = {
        hfId: 'hf-space-gradio/demo',
        onChainPDA: 'spacePDA',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'spaceHash',
      };
      mockAssetIndex['hf-dataset-huggingface/squad'] = {
        hfId: 'hf-dataset-huggingface/squad',
        onChainPDA: 'datasetPDA',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'datasetHash',
      };
      mockAssetIndex['hf-meta-llama/Llama-2'] = {
        hfId: 'hf-meta-llama/Llama-2',
        onChainPDA: 'modelPDA',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'modelHash',
      };

      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      const detector = new DeprecationDetector();
      await detector.detectAndRevoke();

      const calls = mockedAxios.head.mock.calls;
      const urls = calls.map(c => c[0]);

      expect(urls).toContain('https://huggingface.co/api/spaces/gradio/demo');
      expect(urls).toContain('https://huggingface.co/api/datasets/huggingface/squad');
      expect(urls).toContain('https://huggingface.co/api/models/meta-llama/Llama-2');
    });

    it('should count errors when updatePassportStatus fails', async () => {
      mockAssetIndex['hf-fail-model'] = {
        hfId: 'hf-fail-model',
        onChainPDA: 'failPDA',
        lastModified: '2024-01-01',
        version: '1.0.0',
        contentHash: 'failHash',
      };

      mockedAxios.head.mockResolvedValue({ status: 404 } as any);
      mockUpdatePassportStatus.mockResolvedValueOnce(null); // Simulate failure

      const detector = new DeprecationDetector();
      const result = await detector.detectAndRevoke();

      expect(result.checked).toBe(1);
      expect(result.revoked).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('singleton', () => {
    it('should return singleton instance', () => {
      jest.resetModules();

      // Re-mock everything for clean module
      jest.doMock('../services/hf/syncStateManager', () => ({
        getSyncStateManager: jest.fn(() => ({
          load: jest.fn(), save: jest.fn(), getAssetIndex: jest.fn(() => ({})),
          removeAssetIndexEntry: jest.fn(),
        })),
      }));
      jest.doMock('../services/hf/hfBridgeService', () => ({ getHFBridgeService: jest.fn(() => ({})) }));
      jest.doMock('../services/passport/passportSyncService', () => ({ getPassportSyncService: jest.fn(() => ({})) }));

      const mod = require('../services/hf/deprecationDetector');
      const inst1 = mod.getDeprecationDetector();
      const inst2 = mod.getDeprecationDetector();
      expect(inst1).toBe(inst2);
    });
  });
});
