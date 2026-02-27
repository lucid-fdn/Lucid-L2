import { matchComputeForModel } from '../services/passport/matchingEngine';
import { getComputeRegistry } from '../services/compute/computeRegistry';

describe('matchingEngine.matchComputeForModel', () => {
  test('selects healthy compatible compute and rejects incompatible', () => {
    const policy = { policy_version: '1.0', allow_regions: ['eu'] };
    const model_meta = {
      schema_version: '1.0',
      model_passport_id: 'passport_model_abc',
      format: 'safetensors',
      runtime_recommended: 'vllm',
      context_length: 4096,
      requirements: { min_vram_gb: 40 },
    };

    const good = {
      schema_version: '1.0',
      compute_passport_id: 'passport_compute_good',
      provider_type: 'cloud',
      regions: ['eu'],
      residency_supported: true,
      hardware: { gpu: 'A100', vram_gb: 80 },
      runtimes: [{ name: 'vllm' }],
      network: { p95_ms_estimate: 1200 },
      pricing: { price_per_1k_tokens_estimate: 0.2 },
      endpoints: { inference_url: 'http://localhost:8000' },
    };

    const badRegion = {
      ...good,
      compute_passport_id: 'passport_compute_bad_region',
      regions: ['us'],
    };

    const reg = getComputeRegistry();
    reg.upsertHeartbeat({ compute_passport_id: 'passport_compute_good', status: 'healthy' });
    reg.upsertHeartbeat({ compute_passport_id: 'passport_compute_bad_region', status: 'healthy' });

    const { match, explain } = matchComputeForModel({
      model_meta,
      policy,
      compute_catalog: [badRegion, good],
      require_live_healthy: true,
    });

    expect(match?.compute_passport_id).toBe('passport_compute_good');
    expect(explain.rejected.find((r) => r.compute_passport_id === 'passport_compute_bad_region')?.reasons).toContain(
      'REGION_NOT_ALLOWED'
    );
  });
});
