import request from 'supertest';
import express from 'express';
import { lucidLayerRouter } from '../../packages/gateway-lite/src/routes/core/lucidLayerRoutes';
import { getComputeRegistry } from '../../packages/gateway-lite/src/compute/computeRegistry';

describe('/v1/route', () => {
  const app = express();
  app.use(express.json());
  app.use('/', lucidLayerRouter);

  test('returns executable route with endpoint', async () => {
    const reg = getComputeRegistry();
    reg.upsertHeartbeat({ compute_passport_id: 'passport_compute_good', status: 'healthy' });

    const body = {
      request_id: 'req-1',
      policy: { policy_version: '1.0', allow_regions: ['eu'] },
      model_meta: {
        schema_version: '1.0',
        model_passport_id: 'passport_model_abc',
        format: 'safetensors',
        runtime_recommended: 'vllm',
        context_length: 4096,
        requirements: { min_vram_gb: 40 },
      },
      compute_catalog: [
        {
          schema_version: '1.0',
          compute_passport_id: 'passport_compute_good',
          provider_type: 'cloud',
          regions: ['eu'],
          hardware: { gpu: 'A100', vram_gb: 80 },
          runtimes: [{ name: 'vllm' }],
          endpoints: { inference_url: 'http://localhost:8000' },
        },
      ],
    };

    const r = await request(app).post('/v1/route').send(body);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.request_id).toBe('req-1');
    expect(r.body.route.endpoint).toBe('http://localhost:8000');
    expect(r.body.route.runtime).toBe('vllm');
    expect(r.body.route.policy_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
