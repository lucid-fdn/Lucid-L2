import request from 'supertest';
import express from 'express';
import { lucidLayerRouter } from '../routes/lucidLayerRoutes';

describe('receipts pipeline', () => {
  const app = express();
  app.use(express.json());
  app.use('/', lucidLayerRouter);

  let run_id: string;

  test('POST /v1/receipts creates receipt', async () => {
    // v0.2 requires extended fields for receipt validation
    const body = {
      model_passport_id: 'passport_model_abc',
      compute_passport_id: 'passport_compute_xyz',
      policy_hash: 'a'.repeat(64), // Must be valid 64-char hex
      runtime: 'vllm',
      tokens_in: 100,
      tokens_out: 200,
      ttft_ms: 120,
      p95_ms: 1200,
      // Required v0.2 fields
      execution_mode: 'byo_runtime',
      job_hash: 'b'.repeat(64),
      quote_hash: 'c'.repeat(64),
      outputs_hash: 'd'.repeat(64),
      runtime_hash: 'sha256:' + 'e'.repeat(64),
      gpu_fingerprint: 'NVIDIA-A100-40GB',
    };

    const r = await request(app).post('/v1/receipts').send(body);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.receipt.run_id).toBeDefined();
    expect(r.body.receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.receipt.receipt_signature).toBeDefined();
    expect(r.body.receipt.signer_pubkey).toBeDefined();
    expect(r.body.receipt.signer_type).toBe('orchestrator');
    expect(r.body.receipt._mmr_leaf_index).toBeDefined();
    run_id = r.body.receipt.run_id;
  });

  test('GET /v1/receipts/:id retrieves receipt', async () => {
    const r = await request(app).get(`/v1/receipts/${run_id}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.receipt.run_id).toBe(run_id);
  });

  test('GET /v1/receipts/:id/verify validates hash and signature', async () => {
    const r = await request(app).get(`/v1/receipts/${run_id}/verify`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.hash_valid).toBe(true);
    expect(r.body.signature_valid).toBe(true);
    expect(r.body.inclusion_valid).toBe(true);
    expect(r.body.expected_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.computed_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.expected_hash).toBe(r.body.computed_hash);
    expect(r.body.merkle_root).toMatch(/^[0-9a-f]{64}$/);
  });

  test('GET /v1/receipts/:id/proof returns inclusion proof', async () => {
    const r = await request(app).get(`/v1/receipts/${run_id}/proof`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.proof).toBeDefined();
    expect(r.body.proof.leaf).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.proof.root).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(r.body.proof.siblings)).toBe(true);
    expect(Array.isArray(r.body.proof.directions)).toBe(true);
  });

  test('GET /v1/signer/pubkey returns orchestrator public key', async () => {
    const r = await request(app).get('/v1/signer/pubkey');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.signer_type).toBe('orchestrator');
  });

  test('GET /v1/mmr/root returns root', async () => {
    const r = await request(app).get('/v1/mmr/root');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.root).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.leaf_count).toBeGreaterThanOrEqual(1);
  });
});
