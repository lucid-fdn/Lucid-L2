import { evaluatePolicy } from '../services/policyEngine';

describe('policyEngine.evaluatePolicy', () => {
  test('allows when regions overlap and no constraints violated', () => {
    const policy = {
      policy_version: '1.0',
      allow_regions: ['eu'],
      residency_required: false,
      attestation: { attestation_required: false, require_cc_on: false },
      latency: { p95_ms_budget: 2500 },
      cost: { max_price_per_1k_tokens_usd: 1.0 },
      privacy: { store_inputs: false, redact_pii: false },
    };
    const compute = {
      schema_version: '1.0',
      compute_passport_id: 'passport_compute_xyz',
      provider_type: 'cloud',
      regions: ['eu'],
      residency_supported: true,
      hardware: { gpu: 'A100', vram_gb: 80 },
      runtimes: [{ name: 'vllm', version: '0.6.0' }],
      capabilities: { supports_streaming: true, supports_attestation: true, supports_cc_on: true },
      network: { p95_ms_estimate: 1200 },
      pricing: { price_per_1k_tokens_estimate: 0.2 },
      endpoints: { inference_url: 'http://localhost:8000' },
    };

    const r = evaluatePolicy({ policy, computeMeta: compute });
    expect(r.allowed).toBe(true);
    expect(r.reasons).toHaveLength(0);
    expect(r.policy_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('denies when region not allowed', () => {
    const policy = { policy_version: '1.0', allow_regions: ['eu'] };
    const compute = {
      schema_version: '1.0',
      compute_passport_id: 'passport_compute_xyz',
      provider_type: 'cloud',
      regions: ['us'],
      hardware: { gpu: 'A100', vram_gb: 80 },
      runtimes: [{ name: 'vllm' }],
      endpoints: { inference_url: 'http://localhost:8000' },
    };

    const r = evaluatePolicy({ policy, computeMeta: compute });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('REGION_NOT_ALLOWED');
  });

  test('returns INVALID_POLICY when policy is null or undefined', () => {
    const compute = {
      schema_version: '1.0',
      compute_passport_id: 'passport_compute_xyz',
      provider_type: 'cloud',
      regions: ['eu'],
      hardware: { gpu: 'A100', vram_gb: 80 },
      runtimes: [{ name: 'vllm' }],
      endpoints: { inference_url: 'http://localhost:8000' },
    };

    const r1 = evaluatePolicy({ policy: null as any, computeMeta: compute });
    expect(r1.allowed).toBe(false);
    expect(r1.reasons).toContain('INVALID_POLICY');

    const r2 = evaluatePolicy({ policy: undefined as any, computeMeta: compute });
    expect(r2.allowed).toBe(false);
    expect(r2.reasons).toContain('INVALID_POLICY');
  });

  test('returns INVALID_POLICY when policy_version is missing', () => {
    const policy = { allow_regions: ['eu'] }; // no policy_version
    const compute = {
      schema_version: '1.0',
      compute_passport_id: 'passport_compute_xyz',
      provider_type: 'cloud',
      regions: ['eu'],
      hardware: { gpu: 'A100', vram_gb: 80 },
      runtimes: [{ name: 'vllm' }],
      endpoints: { inference_url: 'http://localhost:8000' },
    };

    const r = evaluatePolicy({ policy: policy as any, computeMeta: compute });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('INVALID_POLICY');
  });
});
