// offchain/src/__tests__/passportSearch.test.ts
// Tests for Passport Search & Discovery functionality

import {
  SearchQueryBuilder,
  query,
  applyAdvancedFilters,
  calculateRelevanceScore,
  sortByRelevance,
  generateFacets,
  buildSearchResult,
  modelsForCompute,
  computeForModel,
} from '../storage/searchQueryBuilder';
import { PassportStore, Passport, PassportType } from '../storage/passportStore';
import { PassportManager, getPassportManager, resetPassportManager } from '../services/passportManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, '../../data/test-search');

describe('SearchQueryBuilder', () => {
  describe('Fluent API', () => {
    it('should build filters with type', () => {
      const builder = query().type('model');
      const filters = builder.build();
      expect(filters.type).toEqual(['model']);
    });

    it('should build filters with multiple types', () => {
      const builder = query().type('model', 'compute');
      const filters = builder.build();
      expect(filters.type).toEqual(['model', 'compute']);
    });

    it('should build filters with owner', () => {
      const builder = query().owner('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV');
      const filters = builder.build();
      expect(filters.owner).toBe('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV');
    });

    it('should build filters with tags', () => {
      const builder = query().tags(['llm', 'vllm'], 'any');
      const filters = builder.build();
      expect(filters.tags).toEqual(['llm', 'vllm']);
      expect(filters.tag_match).toBe('any');
    });

    it('should build filters with search', () => {
      const builder = query().search('llama');
      const filters = builder.build();
      expect(filters.search).toBe('llama');
    });

    it('should build filters for models', () => {
      const builder = query()
        .type('model')
        .runtime('vllm')
        .format('safetensors')
        .maxVramRequirement(48);
      const filters = builder.build();
      expect(filters.type).toEqual(['model']);
      expect(filters.runtime).toBe('vllm');
      expect(filters.format).toBe('safetensors');
      expect(filters.min_vram_max).toBe(48);
    });

    it('should build filters for compute', () => {
      const builder = query()
        .type('compute')
        .regions('us-east-1', 'eu-west-1')
        .runtimes('vllm', 'tgi')
        .providerType('cloud')
        .minVram(80)
        .gpu('A100');
      const filters = builder.build();
      expect(filters.type).toEqual(['compute']);
      expect(filters.regions).toEqual(['us-east-1', 'eu-west-1']);
      expect(filters.runtimes).toEqual(['vllm', 'tgi']);
      expect(filters.provider_type).toBe('cloud');
      expect(filters.min_vram_gb).toBe(80);
      expect(filters.gpu).toBe('A100');
    });

    it('should build pagination', () => {
      const builder = query().paginate(2, 50);
      const filters = builder.build();
      expect(filters.page).toBe(2);
      expect(filters.per_page).toBe(50);
    });

    it('should build sorting', () => {
      const builder = query().sortBy('updated_at', 'asc');
      const filters = builder.build();
      expect(filters.sort_by).toBe('updated_at');
      expect(filters.sort_order).toBe('asc');
    });

    it('should convert to PassportFilters', () => {
      const builder = query()
        .type('model')
        .owner('owner123')
        .status('active')
        .paginate(1, 20);
      const pf = builder.toPassportFilters();
      expect(pf.type).toBe('model');
      expect(pf.owner).toBe('owner123');
      expect(pf.status).toBe('active');
    });
  });
});

describe('applyAdvancedFilters', () => {
  const modelPassport: Passport = {
    passport_id: 'model_1',
    type: 'model',
    owner: 'owner1',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
    metadata: {
      model_passport_id: 'model_1',
      model_name: 'llama-7b',
      runtime_recommended: 'vllm',
      format: 'safetensors',
      requirements: { min_vram_gb: 16 },
      required_runtimes: ['vllm'],
    },
    name: 'Llama 7B',
    description: 'A large language model',
    tags: ['llm', 'llama'],
  };

  const computePassport: Passport = {
    passport_id: 'compute_1',
    type: 'compute',
    owner: 'owner2',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
    metadata: {
      compute_passport_id: 'compute_1',
      provider_type: 'cloud',
      regions: ['us-east-1', 'eu-west-1'],
      runtimes: [{ name: 'vllm', version: '0.3.0' }, { name: 'tgi', version: '1.0' }],
      hardware: { gpu: 'NVIDIA A100 80GB', vram_gb: 80 },
    },
    name: 'AWS Cloud Compute',
    description: 'High-performance GPU compute',
    tags: ['gpu', 'cloud'],
  };

  const passports = [modelPassport, computePassport];

  it('should filter models by runtime', () => {
    const result = applyAdvancedFilters(passports, { runtime: 'vllm' });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('model_1');
  });

  it('should filter models by format', () => {
    const result = applyAdvancedFilters(passports, { format: 'safetensors' });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('model_1');
  });

  it('should filter models by max VRAM', () => {
    const result = applyAdvancedFilters(passports, { min_vram_max: 24 });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('model_1');
  });

  it('should exclude models requiring too much VRAM', () => {
    const result = applyAdvancedFilters(passports, { min_vram_max: 8 });
    expect(result).toHaveLength(0);
  });

  it('should filter compute by regions', () => {
    const result = applyAdvancedFilters(passports, { regions: ['us-east-1'] });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });

  it('should filter compute by runtimes', () => {
    const result = applyAdvancedFilters(passports, { runtimes: ['tgi'] });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });

  it('should filter compute by provider type', () => {
    const result = applyAdvancedFilters(passports, { provider_type: 'cloud' });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });

  it('should filter compute by min VRAM', () => {
    const result = applyAdvancedFilters(passports, { min_vram_gb: 48 });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });

  it('should filter compute by GPU', () => {
    const result = applyAdvancedFilters(passports, { gpu: 'A100' });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });

  it('should handle GPU partial match', () => {
    const result = applyAdvancedFilters(passports, { gpu: 'nvidia' });
    expect(result).toHaveLength(1);
    expect(result[0].passport_id).toBe('compute_1');
  });
});

describe('calculateRelevanceScore', () => {
  const passport: Passport = {
    passport_id: 'p1',
    type: 'model',
    owner: 'owner1',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
    metadata: { model_name: 'llama-7b' },
    name: 'Llama 7B Chat Model',
    description: 'A conversational AI model based on LLaMA architecture',
    tags: ['llm', 'chat', 'llama'],
  };

  it('should return 0 for empty query', () => {
    expect(calculateRelevanceScore(passport, '')).toBe(0);
  });

  it('should give high score for exact name match', () => {
    const score = calculateRelevanceScore(passport, 'Llama 7B Chat Model');
    expect(score).toBeGreaterThan(100);
  });

  it('should give good score for name contains query', () => {
    const score = calculateRelevanceScore(passport, 'llama');
    expect(score).toBeGreaterThan(50);
  });

  it('should give score for description match', () => {
    const score = calculateRelevanceScore(passport, 'conversational');
    expect(score).toBeGreaterThan(20);
  });

  it('should give score for tag match', () => {
    const score = calculateRelevanceScore(passport, 'chat');
    expect(score).toBeGreaterThan(15);
  });

  it('should accumulate scores for multiple term matches', () => {
    const singleScore = calculateRelevanceScore(passport, 'llama');
    const multiScore = calculateRelevanceScore(passport, 'llama chat model');
    expect(multiScore).toBeGreaterThan(singleScore);
  });
});

describe('sortByRelevance', () => {
  const passports: Passport[] = [
    {
      passport_id: 'p1',
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {},
      name: 'GPT-4 Clone',
      description: 'An alternative model',
    },
    {
      passport_id: 'p2',
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {},
      name: 'Llama 2 70B',
      description: 'A large llama model',
      tags: ['llama', 'llm'],
    },
    {
      passport_id: 'p3',
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {},
      name: 'Mistral 7B',
      description: 'Efficient model',
    },
  ];

  it('should sort by relevance score descending', () => {
    const result = sortByRelevance(passports, 'llama');
    expect(result[0].passport.passport_id).toBe('p2');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('should include all passports even with 0 score', () => {
    const result = sortByRelevance(passports, 'llama');
    expect(result).toHaveLength(3);
  });
});

describe('generateFacets', () => {
  const passports: Passport[] = [
    {
      passport_id: 'm1',
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: { runtime_recommended: 'vllm' },
    },
    {
      passport_id: 'm2',
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: { runtime_recommended: 'vllm' },
    },
    {
      passport_id: 'c1',
      type: 'compute',
      owner: 'o2',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        regions: ['us-east-1', 'eu-west-1'],
        runtimes: [{ name: 'vllm' }, { name: 'tgi' }],
        provider_type: 'cloud',
      },
    },
    {
      passport_id: 'c2',
      type: 'compute',
      owner: 'o3',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        regions: ['us-east-1'],
        runtimes: [{ name: 'vllm' }],
        provider_type: 'depin',
      },
    },
  ];

  it('should count types', () => {
    const facets = generateFacets(passports);
    expect(facets!.types.model).toBe(2);
    expect(facets!.types.compute).toBe(2);
  });

  it('should count regions', () => {
    const facets = generateFacets(passports);
    expect(facets!.regions['us-east-1']).toBe(2);
    expect(facets!.regions['eu-west-1']).toBe(1);
  });

  it('should count runtimes', () => {
    const facets = generateFacets(passports);
    expect(facets!.runtimes.vllm).toBe(4); // 2 models + 2 compute
    expect(facets!.runtimes.tgi).toBe(1);
  });

  it('should count provider types', () => {
    const facets = generateFacets(passports);
    expect(facets!.provider_types.cloud).toBe(1);
    expect(facets!.provider_types.depin).toBe(1);
  });
});

describe('buildSearchResult', () => {
  const passports: Passport[] = [];
  
  // Generate 25 test passports
  for (let i = 0; i < 25; i++) {
    passports.push({
      passport_id: `p${i}`,
      type: 'model',
      owner: 'o1',
      status: 'active',
      created_at: Date.now() - i * 1000,
      updated_at: Date.now() - i * 1000,
      metadata: { runtime_recommended: 'vllm' },
      name: `Model ${i}`,
    });
  }

  it('should paginate results', () => {
    const result = buildSearchResult(passports, { page: 1, per_page: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(result.total_pages).toBe(3);
    expect(result.has_next).toBe(true);
    expect(result.has_prev).toBe(false);
  });

  it('should return second page', () => {
    const result = buildSearchResult(passports, { page: 2, per_page: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(2);
    expect(result.has_next).toBe(true);
    expect(result.has_prev).toBe(true);
  });

  it('should return last page with remaining items', () => {
    const result = buildSearchResult(passports, { page: 3, per_page: 10 });
    expect(result.items).toHaveLength(5);
    expect(result.has_next).toBe(false);
    expect(result.has_prev).toBe(true);
  });

  it('should include facets when requested', () => {
    const result = buildSearchResult(passports, {}, true);
    expect(result.facets).toBeDefined();
    expect(result.facets!.types.model).toBe(25);
  });
});

describe('Predefined Queries', () => {
  describe('modelsForCompute', () => {
    it('should create query for models compatible with compute', () => {
      const computePassport: Passport = {
        passport_id: 'c1',
        type: 'compute',
        owner: 'o1',
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          hardware: { vram_gb: 80 },
          runtimes: [{ name: 'vllm' }, { name: 'tgi' }],
        },
      };

      const builder = modelsForCompute(computePassport);
      const filters = builder.build();
      
      expect(filters.type).toEqual(['model']);
      expect(filters.status).toEqual(['active']);
      expect(filters.min_vram_max).toBe(80);
      expect(filters.runtime).toBe('vllm');
    });
  });

  describe('computeForModel', () => {
    it('should create query for compute compatible with model', () => {
      const modelPassport: Passport = {
        passport_id: 'm1',
        type: 'model',
        owner: 'o1',
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          requirements: { min_vram_gb: 48 },
          runtime_recommended: 'vllm',
        },
      };

      const builder = computeForModel(modelPassport);
      const filters = builder.build();
      
      expect(filters.type).toEqual(['compute']);
      expect(filters.status).toEqual(['active']);
      expect(filters.min_vram_gb).toBe(48);
      expect(filters.runtimes).toEqual(['vllm']);
    });
  });
});

describe('PassportManager Search Integration', () => {
  let manager: PassportManager;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(os.tmpdir(), `passport-search-test-${Date.now()}`);
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

  it('should search models via manager', async () => {

    // Create test model passports (schema requires schema_version, model_passport_id >= 10 chars, no additionalProperties)
    const r1 = await manager.createPassport({
      type: 'model',
      owner: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      metadata: {
        schema_version: '1.0',
        model_passport_id: 'test_model_vllm_001',
        runtime_recommended: 'vllm',
        format: 'safetensors',
        requirements: { min_vram_gb: 16 },
      },
      name: 'Test vLLM Model',
      tags: ['test', 'vllm'],
    });
    expect(r1.ok).toBe(true);

    const r2 = await manager.createPassport({
      type: 'model',
      owner: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      metadata: {
        schema_version: '1.0',
        model_passport_id: 'test_model_tgi_002',
        runtime_recommended: 'tgi',
        format: 'safetensors',
        requirements: { min_vram_gb: 24 },
      },
      name: 'Test TGI Model',
      tags: ['test', 'tgi'],
    });
    expect(r2.ok).toBe(true);

    // Search by runtime
    const vllmResults = await manager.searchModels({ runtime: 'vllm' });
    expect(vllmResults.items.length).toBe(1);
    expect(vllmResults.items[0].metadata.runtime_recommended).toBe('vllm');

    // Search by max VRAM
    const lowVramResults = await manager.searchModels({ max_vram: 20 });
    expect(lowVramResults.items.length).toBe(1);
    expect(lowVramResults.items[0].metadata.requirements.min_vram_gb).toBe(16);
  });

  it('should search compute via manager', async () => {
    // Create test compute passports (schema requires schema_version, compute_passport_id >= 10 chars)
    const c1 = await manager.createPassport({
      type: 'compute',
      owner: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      metadata: {
        schema_version: '1.0',
        compute_passport_id: 'compute_aws_a100_001',
        provider_type: 'cloud',
        regions: ['us-east-1'],
        runtimes: [{ name: 'vllm', version: '0.3.0' }],
        hardware: { gpu: 'NVIDIA A100', vram_gb: 80 },
        endpoints: { inference_url: 'http://example.com/v1' },
      },
      name: 'AWS A100 Compute',
      tags: ['aws', 'a100'],
    });
    expect(c1.ok).toBe(true);

    const c2 = await manager.createPassport({
      type: 'compute',
      owner: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      metadata: {
        schema_version: '1.0',
        compute_passport_id: 'compute_depin_h100_001',
        provider_type: 'depin',
        regions: ['eu-west-1'],
        runtimes: [{ name: 'tgi', version: '1.0' }],
        hardware: { gpu: 'NVIDIA H100', vram_gb: 80 },
        endpoints: { inference_url: 'http://example2.com/v1' },
      },
      name: 'DePIN H100 Compute',
      tags: ['depin', 'h100'],
    });
    expect(c2.ok).toBe(true);

    // Search by region
    const usResults = await manager.searchCompute({ regions: ['us-east-1'] });
    expect(usResults.items.length).toBe(1);
    expect(usResults.items[0].metadata.regions).toContain('us-east-1');

    // Search by runtime
    const tgiResults = await manager.searchCompute({ runtimes: ['tgi'] });
    expect(tgiResults.items.length).toBe(1);

    // Search by provider type
    const depinResults = await manager.searchCompute({ provider_type: 'depin' });
    expect(depinResults.items.length).toBe(1);

    // Search by GPU
    const h100Results = await manager.searchCompute({ gpu: 'H100' });
    expect(h100Results.items.length).toBe(1);
  });
});
