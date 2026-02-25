// offchain/src/__tests__/passportService.test.ts
// Tests for Passport Store, Manager, and Routes

import { PassportStore, resetPassportStore } from '../storage/passportStore';
import { PassportManager, resetPassportManager } from '../services/passportManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Sample valid metadata for testing
const validModelMeta = {
  schema_version: '1.0',
  model_passport_id: 'placeholder', // Will be replaced with actual ID
  format: 'safetensors',
  runtime_recommended: 'vllm',
  hf: {
    repo_id: 'meta-llama/Llama-2-7b-hf',
    revision: 'main',
  },
  context_length: 4096,
  quantizations: ['fp16', 'int8'],
  requirements: {
    min_vram_gb: 16,
    gpu_classes: ['a100', 'h100'],
  },
};

const validComputeMeta = {
  schema_version: '1.0',
  compute_passport_id: 'placeholder', // Will be replaced with actual ID
  provider_type: 'cloud',
  regions: ['us-east-1', 'eu-west-1'],
  hardware: {
    gpu: 'NVIDIA A100 80GB',
    vram_gb: 80,
    arch: 'ampere',
  },
  runtimes: [
    { name: 'vllm', version: '0.2.0' },
    { name: 'tgi', version: '1.0.0' },
  ],
  capabilities: {
    supports_streaming: true,
    supports_attestation: false,
  },
  endpoints: {
    inference_url: 'https://compute.example.com/v1/inference',
  },
};

// Valid Solana wallet address for testing
const VALID_OWNER = '5ZiE3vAkrdXBgyFL7KqG3RoEGBws4CjRcXVbABDLZTgE';
const VALID_OWNER_2 = 'DjPi1LtwrXJMAh2AUvuUMajCpMJEKg8N1J8fU4L2Xr9D';

describe('PassportStore', () => {
  let store: PassportStore;
  let testDataDir: string;

  beforeEach(async () => {
    // Create a temp directory for test data
    testDataDir = path.join(os.tmpdir(), `passport-test-${Date.now()}`);
    fs.mkdirSync(testDataDir, { recursive: true });
    
    store = new PassportStore(testDataDir, 0); // Disable auto-save for tests
    await store.init();
  });

  afterEach(async () => {
    await store.shutdown();
    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('create', () => {
    it('should create a model passport', async () => {
      const passport = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
        name: 'Test Model',
        tags: ['llm', 'test'],
      });

      expect(passport).toBeDefined();
      expect(passport.passport_id).toMatch(/^passport_[a-f0-9]{32}$/);
      expect(passport.type).toBe('model');
      expect(passport.owner).toBe(VALID_OWNER);
      expect(passport.status).toBe('active');
      expect(passport.tags).toEqual(['llm', 'test']);
      expect(passport.created_at).toBeLessThanOrEqual(Date.now());
    });

    it('should create a compute passport', async () => {
      const passport = await store.create({
        type: 'compute',
        owner: VALID_OWNER,
        metadata: validComputeMeta,
        name: 'Test Compute',
        tags: ['gpu', 'a100'],
      });

      expect(passport.type).toBe('compute');
      expect(passport.metadata.provider_type).toBe('cloud');
    });

    it('should create passports with unique IDs', async () => {
      const p1 = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });
      const p2 = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      expect(p1.passport_id).not.toBe(p2.passport_id);
    });
  });

  describe('get', () => {
    it('should retrieve an existing passport', async () => {
      const created = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const retrieved = await store.get(created.passport_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.passport_id).toBe(created.passport_id);
    });

    it('should return null for non-existent passport', async () => {
      const result = await store.get('passport_nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update passport metadata', async () => {
      const created = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
        name: 'Original Name',
      });

      // Small delay to ensure updated_at is different
      await new Promise(resolve => setTimeout(resolve, 5));

      const updated = await store.update(created.passport_id, {
        name: 'Updated Name',
        tags: ['updated', 'test'],
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.tags).toEqual(['updated', 'test']);
      expect(updated!.updated_at).toBeGreaterThanOrEqual(created.updated_at);
    });

    it('should return null for non-existent passport', async () => {
      const result = await store.update('passport_nonexistent', { name: 'Test' });
      expect(result).toBeNull();
    });

    it('should preserve passport_id and created_at on update', async () => {
      const created = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const updated = await store.update(created.passport_id, {
        name: 'New Name',
      });

      expect(updated!.passport_id).toBe(created.passport_id);
      expect(updated!.created_at).toBe(created.created_at);
    });
  });

  describe('delete', () => {
    it('should soft delete a passport', async () => {
      const created = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await store.delete(created.passport_id);
      expect(result).toBe(true);

      const retrieved = await store.get(created.passport_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.status).toBe('revoked');
    });

    it('should return false for non-existent passport', async () => {
      const result = await store.delete('passport_nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('hardDelete', () => {
    it('should permanently remove a passport', async () => {
      const created = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await store.hardDelete(created.passport_id);
      expect(result).toBe(true);

      const retrieved = await store.get(created.passport_id);
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create test passports
      await store.create({ type: 'model', owner: VALID_OWNER, metadata: validModelMeta, name: 'Model A', tags: ['llm'] });
      await store.create({ type: 'model', owner: VALID_OWNER, metadata: validModelMeta, name: 'Model B', tags: ['llm', 'chat'] });
      await store.create({ type: 'compute', owner: VALID_OWNER, metadata: validComputeMeta, name: 'Compute A', tags: ['gpu'] });
      await store.create({ type: 'model', owner: VALID_OWNER_2, metadata: validModelMeta, name: 'Model C' });
    });

    it('should list all passports', async () => {
      const result = await store.list();
      expect(result.items.length).toBe(4);
      expect(result.pagination.total).toBe(4);
    });

    it('should filter by type', async () => {
      const result = await store.list({ type: 'model' });
      expect(result.items.length).toBe(3);
      expect(result.items.every(p => p.type === 'model')).toBe(true);
    });

    it('should filter by owner', async () => {
      const result = await store.list({ owner: VALID_OWNER });
      expect(result.items.length).toBe(3);
    });

    it('should filter by tags (match all)', async () => {
      const result = await store.list({ tags: ['llm', 'chat'], tag_match: 'all' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Model B');
    });

    it('should filter by tags (match any)', async () => {
      const result = await store.list({ tags: ['llm', 'gpu'], tag_match: 'any' });
      expect(result.items.length).toBe(3);
    });

    it('should support pagination', async () => {
      const page1 = await store.list({ per_page: 2, page: 1 });
      const page2 = await store.list({ per_page: 2, page: 2 });

      expect(page1.items.length).toBe(2);
      expect(page2.items.length).toBe(2);
      expect(page1.pagination.has_next).toBe(true);
      expect(page2.pagination.has_next).toBe(false);
    });

    it('should support full-text search', async () => {
      const result = await store.list({ search: 'Model A' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Model A');
    });

    it('should support sorting', async () => {
      const asc = await store.list({ type: 'model', sort_by: 'name', sort_order: 'asc' });
      expect(asc.items[0].name).toBe('Model A');

      const desc = await store.list({ type: 'model', sort_by: 'name', sort_order: 'desc' });
      expect(desc.items[0].name).toBe('Model C');
    });
  });

  describe('persistence', () => {
    it('should persist and reload data', async () => {
      const passport = await store.create({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
        name: 'Persistent Model',
      });

      await store.persist();

      // Create a new store instance pointing to same directory
      const newStore = new PassportStore(testDataDir, 0);
      await newStore.init();

      const retrieved = await newStore.get(passport.passport_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Persistent Model');

      await newStore.shutdown();
    });
  });
});

describe('PassportManager', () => {
  let manager: PassportManager;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(os.tmpdir(), `passport-manager-test-${Date.now()}`);
    fs.mkdirSync(testDataDir, { recursive: true });
    
    const store = new PassportStore(testDataDir, 0);
    manager = new PassportManager(store);
    await manager.init();
  });

  afterEach(async () => {
    await manager.shutdown();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    resetPassportManager();
  });

  describe('createPassport', () => {
    it('should create a model passport with valid metadata', async () => {
      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
        name: 'Test Model',
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.type).toBe('model');
    });

    it('should reject invalid passport type', async () => {
      const result = await manager.createPassport({
        type: 'invalid' as any,
        owner: VALID_OWNER,
        metadata: {},
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid passport type');
    });

    it('should reject invalid owner address', async () => {
      const result = await manager.createPassport({
        type: 'model',
        owner: 'invalid-address',
        metadata: validModelMeta,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid owner address');
    });

    it('should reject invalid model metadata', async () => {
      const invalidMeta = {
        schema_version: '1.0',
        model_passport_id: 'test',
        // Missing required fields: format, runtime_recommended
      };

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: invalidMeta,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('schema validation failed');
    });

    it('should reject format=api model passport without api_model_id', async () => {
      const apiMetaNoProvider = {
        schema_version: '1.0',
        model_passport_id: 'placeholder_placeholder',
        format: 'api',
        runtime_recommended: 'trustgate',
      };

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: apiMetaNoProvider,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('api_model_id');
    });

    it('should accept format=api model passport with valid api_model_id', async () => {
      const apiMetaWithProvider = {
        schema_version: '1.0',
        model_passport_id: 'placeholder_placeholder',
        format: 'api',
        runtime_recommended: 'trustgate',
        api_model_id: 'gpt-4o',
      };

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: apiMetaWithProvider,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.metadata.api_model_id).toBe('gpt-4o');
    });

    it('should reject format=api passport when model not in TrustGate catalog', async () => {
      const originalFetch = global.fetch;
      const { _resetTrustGateCatalogCache } = require('../services/passportManager');
      _resetTrustGateCatalogCache();

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'claude-3-sonnet-20240229', object: 'model' },
          ],
        }),
      }) as any;

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'model_test_invalid_xyz',
          format: 'api',
          runtime_recommended: 'trustgate',
          api_model_id: 'nonexistent-model-xyz',
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found in TrustGate');

      global.fetch = originalFetch;
      _resetTrustGateCatalogCache();
    });

    it('should accept format=api passport when model IS in TrustGate catalog', async () => {
      const originalFetch = global.fetch;
      const { _resetTrustGateCatalogCache } = require('../services/passportManager');
      _resetTrustGateCatalogCache();

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o', object: 'model' }],
        }),
      }) as any;

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'model_gpt4o_valid_test',
          format: 'api',
          runtime_recommended: 'trustgate',
          api_model_id: 'gpt-4o',
        },
      });

      expect(result.ok).toBe(true);

      global.fetch = originalFetch;
      _resetTrustGateCatalogCache();
    });

    it('should allow downloadable model even when not in TrustGate catalog', async () => {
      const originalFetch = global.fetch;
      const { _resetTrustGateCatalogCache } = require('../services/passportManager');
      _resetTrustGateCatalogCache();

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o', object: 'model' }],
        }),
      }) as any;

      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'model_custom_local_test',
          format: 'safetensors',
          runtime_recommended: 'vllm',
          requirements: { min_vram_gb: 16 },
        },
      });

      expect(result.ok).toBe(true);

      global.fetch = originalFetch;
      _resetTrustGateCatalogCache();
    });

    it('should update metadata passport_id to match generated ID', async () => {
      const result = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      expect(result.ok).toBe(true);
      expect(result.data!.metadata.model_passport_id).toBe(result.data!.passport_id);
    });
  });

  describe('getPassport', () => {
    it('should get an existing passport', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await manager.getPassport(created.data!.passport_id);
      expect(result.ok).toBe(true);
      expect(result.data!.passport_id).toBe(created.data!.passport_id);
    });

    it('should return error for non-existent passport', async () => {
      const result = await manager.getPassport('passport_nonexistent');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Passport not found');
    });
  });

  describe('updatePassport', () => {
    it('should update passport with valid data', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
        name: 'Original',
      });

      const result = await manager.updatePassport(created.data!.passport_id, {
        name: 'Updated',
        tags: ['new', 'tags'],
      });

      expect(result.ok).toBe(true);
      expect(result.data!.name).toBe('Updated');
    });

    it('should reject update from non-owner when ownership check enabled', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await manager.updatePassport(
        created.data!.passport_id,
        { name: 'Hacked' },
        VALID_OWNER_2 // Different owner
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not authorized');
    });

    it('should reject update to format=api without api_model_id', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: {
          schema_version: '1.0',
          model_passport_id: 'placeholder_placeholder',
          format: 'api',
          runtime_recommended: 'trustgate',
          api_model_id: 'gpt-4o',
        },
      });

      expect(created.ok).toBe(true);

      const result = await manager.updatePassport(created.data!.passport_id, {
        metadata: {
          schema_version: '1.0',
          model_passport_id: created.data!.passport_id,
          format: 'api',
          runtime_recommended: 'trustgate',
          // Missing api_model_id
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('api_model_id');
    });

    it('should preserve metadata passport_id on update', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const updatedMeta = { ...validModelMeta, context_length: 8192 };
      const result = await manager.updatePassport(created.data!.passport_id, {
        metadata: updatedMeta,
      });

      expect(result.ok).toBe(true);
      expect(result.data!.metadata.model_passport_id).toBe(created.data!.passport_id);
    });
  });

  describe('deletePassport', () => {
    it('should soft delete a passport', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await manager.deletePassport(created.data!.passport_id);
      expect(result.ok).toBe(true);

      const retrieved = await manager.getPassport(created.data!.passport_id);
      expect(retrieved.data!.status).toBe('revoked');
    });

    it('should reject delete from non-owner', async () => {
      const created = await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: validModelMeta,
      });

      const result = await manager.deletePassport(created.data!.passport_id, VALID_OWNER_2);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not authorized');
    });
  });

  describe('searchModels', () => {
    beforeEach(async () => {
      // Create test model passports
      await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: { ...validModelMeta, runtime_recommended: 'vllm', format: 'safetensors', requirements: { min_vram_gb: 16 } },
        name: 'VLLM Model',
        tags: ['production'],
      });
      await manager.createPassport({
        type: 'model',
        owner: VALID_OWNER,
        metadata: { ...validModelMeta, runtime_recommended: 'tgi', format: 'gguf', requirements: { min_vram_gb: 8 } },
        name: 'TGI Model',
        tags: ['development'],
      });
    });

    it('should filter models by runtime', async () => {
      const result = await manager.searchModels({ runtime: 'vllm' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('VLLM Model');
    });

    it('should filter models by format', async () => {
      const result = await manager.searchModels({ format: 'gguf' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('TGI Model');
    });

    it('should filter models by max VRAM', async () => {
      const result = await manager.searchModels({ max_vram: 10 });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('TGI Model');
    });
  });

  describe('searchCompute', () => {
    beforeEach(async () => {
      await manager.createPassport({
        type: 'compute',
        owner: VALID_OWNER,
        metadata: { ...validComputeMeta, regions: ['us-east-1'], hardware: { gpu: 'A100', vram_gb: 80 }, runtimes: [{ name: 'vllm' }] },
        name: 'US Compute',
      });
      await manager.createPassport({
        type: 'compute',
        owner: VALID_OWNER,
        metadata: { ...validComputeMeta, regions: ['eu-west-1'], hardware: { gpu: 'H100', vram_gb: 80 }, runtimes: [{ name: 'tgi' }] },
        name: 'EU Compute',
      });
    });

    it('should filter compute by region', async () => {
      const result = await manager.searchCompute({ regions: ['us-east-1'] });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('US Compute');
    });

    it('should filter compute by runtime', async () => {
      const result = await manager.searchCompute({ runtimes: ['tgi'] });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('EU Compute');
    });

    it('should filter compute by GPU', async () => {
      const result = await manager.searchCompute({ gpu: 'H100' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('EU Compute');
    });
  });

  describe('tool/dataset/agent passports', () => {
    it('should create tool passport with basic metadata', async () => {
      const result = await manager.createPassport({
        type: 'tool',
        owner: VALID_OWNER,
        metadata: {
          tool_name: 'web-scraper',
          description: 'Scrapes web pages',
          version: '1.0.0',
        },
        name: 'Web Scraper Tool',
      });

      expect(result.ok).toBe(true);
      expect(result.data!.type).toBe('tool');
    });

    it('should create dataset passport with basic metadata', async () => {
      const result = await manager.createPassport({
        type: 'dataset',
        owner: VALID_OWNER,
        metadata: {
          dataset_name: 'imagenet-subset',
          size_gb: 50,
          format: 'parquet',
        },
        name: 'ImageNet Subset',
      });

      expect(result.ok).toBe(true);
      expect(result.data!.type).toBe('dataset');
    });

    it('should create agent passport with basic metadata', async () => {
      const result = await manager.createPassport({
        type: 'agent',
        owner: VALID_OWNER,
        metadata: {
          agent_name: 'code-assistant',
          capabilities: ['code-generation', 'debugging'],
        },
        name: 'Code Assistant Agent',
      });

      expect(result.ok).toBe(true);
      expect(result.data!.type).toBe('agent');
    });
  });
});

describe('PassportRoutes Integration', () => {
  // Note: These are integration tests that require the Express app
  // They would typically be run with supertest
  
  // For now, we'll skip these and add them when needed
  describe.skip('POST /v1/passports', () => {
    it('should create a passport via API', () => {
      // Implementation with supertest
    });
  });

  describe.skip('GET /v1/passports/:id', () => {
    it('should get a passport via API', () => {
      // Implementation with supertest
    });
  });
});
