import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — before importing the router
// ---------------------------------------------------------------------------

const mockCreatePassport = jest.fn();
const mockGetPassport = jest.fn();
const mockUpdatePassport = jest.fn();
const mockDeletePassport = jest.fn();
const mockListPassports = jest.fn();
const mockGetCount = jest.fn();
const mockGetPendingSync = jest.fn();
const mockSyncToChain = jest.fn();
const mockUpdatePricing = jest.fn();
const mockUpdateEndpoints = jest.fn();
const mockSearchModels = jest.fn();
const mockSearchCompute = jest.fn();

jest.mock('../../../../engine/src/identity/passport/passportManager', () => ({
  getPassportManager: () => ({
    createPassport: mockCreatePassport,
    getPassport: mockGetPassport,
    updatePassport: mockUpdatePassport,
    deletePassport: mockDeletePassport,
    listPassports: mockListPassports,
    getCount: mockGetCount,
    getPendingSync: mockGetPendingSync,
    syncToChain: mockSyncToChain,
    updatePricing: mockUpdatePricing,
    updateEndpoints: mockUpdateEndpoints,
    searchModels: mockSearchModels,
    searchCompute: mockSearchCompute,
  }),
}));

import { passportRouter } from '../core/passportRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(passportRouter);
  return app;
}

const SAMPLE_PASSPORT = {
  passport_id: 'pass-001',
  type: 'model',
  owner: 'wallet-abc',
  name: 'My Model',
  status: 'active',
  metadata: { arch: 'transformer' },
  created_at: '2026-03-12T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Passport Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  // =========================================================================
  // POST /v1/passports — create
  // =========================================================================
  describe('POST /v1/passports', () => {
    const VALID_INPUT = {
      type: 'model',
      owner: 'wallet-abc',
      metadata: { arch: 'transformer' },
      name: 'My Model',
    };

    it('should create a passport successfully', async () => {
      mockCreatePassport.mockResolvedValue({
        ok: true,
        data: SAMPLE_PASSPORT,
      });

      const res = await request(buildApp())
        .post('/v1/passports')
        .send(VALID_INPUT);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.passport_id).toBe('pass-001');
      expect(res.body.passport.type).toBe('model');
    });

    it('should return 400 when type is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/passports')
        .send({ owner: 'w', metadata: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('should return 400 when owner is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/passports')
        .send({ type: 'model', metadata: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('owner');
    });

    it('should return 400 when metadata is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/passports')
        .send({ type: 'model', owner: 'w' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('metadata');
    });

    it('should return 400 when schema validation fails', async () => {
      mockCreatePassport.mockResolvedValue({
        ok: false,
        error: 'schema validation failed: missing arch',
        details: ['arch is required'],
      });

      const res = await request(buildApp())
        .post('/v1/passports')
        .send(VALID_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('schema validation');
    });

    it('should return 422 for non-schema validation errors', async () => {
      mockCreatePassport.mockResolvedValue({
        ok: false,
        error: 'duplicate passport',
      });

      const res = await request(buildApp())
        .post('/v1/passports')
        .send(VALID_INPUT);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 when service throws', async () => {
      mockCreatePassport.mockRejectedValue(new Error('db write failed'));

      const res = await request(buildApp())
        .post('/v1/passports')
        .send(VALID_INPUT);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db write failed');
    });
  });

  // =========================================================================
  // GET /v1/passports/:passport_id — get by ID
  // =========================================================================
  describe('GET /v1/passports/:passport_id', () => {
    it('should return a passport when found', async () => {
      mockGetPassport.mockResolvedValue({ ok: true, data: SAMPLE_PASSPORT });

      const res = await request(buildApp()).get('/v1/passports/pass-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.passport.passport_id).toBe('pass-001');
    });

    it('should return 404 when not found', async () => {
      mockGetPassport.mockResolvedValue({ ok: false, error: 'Passport not found' });

      const res = await request(buildApp()).get('/v1/passports/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/passports — list
  // =========================================================================
  describe('GET /v1/passports', () => {
    it('should return paginated list', async () => {
      mockListPassports.mockResolvedValue({
        items: [SAMPLE_PASSPORT],
        pagination: { total: 1, page: 1, per_page: 20, total_pages: 1 },
      });

      const res = await request(buildApp()).get('/v1/passports');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.passports).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should pass query filters to manager', async () => {
      mockListPassports.mockResolvedValue({
        items: [],
        pagination: { total: 0, page: 1, per_page: 10, total_pages: 0 },
      });

      await request(buildApp()).get(
        '/v1/passports?type=model&owner=w1&status=active&page=2&per_page=10&sort_by=name&sort_order=asc'
      );

      expect(mockListPassports).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'model',
          owner: 'w1',
          status: 'active',
          page: 2,
          per_page: 10,
          sort_by: 'name',
          sort_order: 'asc',
        })
      );
    });

    it('should handle comma-separated type filter', async () => {
      mockListPassports.mockResolvedValue({
        items: [],
        pagination: { total: 0, page: 1, per_page: 20, total_pages: 0 },
      });

      await request(buildApp()).get('/v1/passports?type=model,compute');

      expect(mockListPassports).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ['model', 'compute'],
        })
      );
    });
  });

  // =========================================================================
  // PATCH /v1/passports/:passport_id — update
  // =========================================================================
  describe('PATCH /v1/passports/:passport_id', () => {
    it('should update a passport', async () => {
      mockUpdatePassport.mockResolvedValue({ ok: true, data: { ...SAMPLE_PASSPORT, name: 'Updated' } });

      const res = await request(buildApp())
        .patch('/v1/passports/pass-001')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.passport.name).toBe('Updated');
    });

    it('should return 400 when no update fields provided', async () => {
      const res = await request(buildApp())
        .patch('/v1/passports/pass-001')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No update fields');
    });

    it('should return 404 when passport not found', async () => {
      mockUpdatePassport.mockResolvedValue({ ok: false, error: 'Passport not found' });

      const res = await request(buildApp())
        .patch('/v1/passports/nonexistent')
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });

    it('should return 403 when not authorized', async () => {
      mockUpdatePassport.mockResolvedValue({ ok: false, error: 'Not authorized to update' });

      const res = await request(buildApp())
        .patch('/v1/passports/pass-001')
        .set('X-Owner-Address', 'wrong-wallet')
        .send({ name: 'x' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // DELETE /v1/passports/:passport_id
  // =========================================================================
  describe('DELETE /v1/passports/:passport_id', () => {
    it('should soft-delete a passport', async () => {
      mockDeletePassport.mockResolvedValue({ ok: true });

      const res = await request(buildApp()).delete('/v1/passports/pass-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(true);
    });

    it('should return 404 when not found', async () => {
      mockDeletePassport.mockResolvedValue({ ok: false, error: 'Passport not found' });

      const res = await request(buildApp()).delete('/v1/passports/nonexistent');

      expect(res.status).toBe(404);
    });

    it('should return 403 when not authorized', async () => {
      mockDeletePassport.mockResolvedValue({ ok: false, error: 'Not authorized' });

      const res = await request(buildApp())
        .delete('/v1/passports/pass-001')
        .set('X-Owner-Address', 'wrong-wallet');

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /v1/passports/stats
  // =========================================================================
  describe('GET /v1/passports/stats', () => {
    it('should return statistics', async () => {
      mockGetCount.mockResolvedValue(5);

      const res = await request(buildApp()).get('/v1/passports/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.total).toBe(5);
      expect(res.body.stats.by_type).toBeDefined();
      expect(res.body.stats.by_status).toBeDefined();
      // getCount is called 9 times (total + 5 types + 3 statuses)
      expect(mockGetCount).toHaveBeenCalledTimes(9);
    });
  });

  // =========================================================================
  // PATCH /v1/passports/:passport_id/pricing
  // =========================================================================
  describe('PATCH /v1/passports/:passport_id/pricing', () => {
    it('should update pricing', async () => {
      mockUpdatePricing.mockResolvedValue({ ok: true, data: SAMPLE_PASSPORT });

      const res = await request(buildApp())
        .patch('/v1/passports/pass-001/pricing')
        .send({ price_per_request: 100 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUpdatePricing).toHaveBeenCalledWith(
        'pass-001',
        { price_per_request: 100 },
        undefined
      );
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(buildApp())
        .patch('/v1/passports/pass-001/pricing')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('pricing fields');
    });
  });

  // =========================================================================
  // PATCH /v1/passports/:passport_id/endpoints
  // =========================================================================
  describe('PATCH /v1/passports/:passport_id/endpoints', () => {
    it('should update endpoints', async () => {
      mockUpdateEndpoints.mockResolvedValue({ ok: true, data: SAMPLE_PASSPORT });

      const res = await request(buildApp())
        .patch('/v1/passports/pass-001/endpoints')
        .send({ inference_url: 'https://api.example.com/v1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(buildApp())
        .patch('/v1/passports/pass-001/endpoints')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('endpoint fields');
    });
  });

  // =========================================================================
  // GET /v1/models — model search
  // =========================================================================
  describe('GET /v1/models', () => {
    it('should return model search results', async () => {
      mockSearchModels.mockResolvedValue({
        items: [SAMPLE_PASSPORT],
        pagination: { total: 1, page: 1, per_page: 20, total_pages: 1 },
      });

      const res = await request(buildApp()).get('/v1/models');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.models).toHaveLength(1);
    });

    it('should pass model-specific filters', async () => {
      mockSearchModels.mockResolvedValue({
        items: [],
        pagination: { total: 0, page: 1, per_page: 20, total_pages: 0 },
      });

      await request(buildApp()).get('/v1/models?runtime=vllm&format=safetensors&max_vram=48&available=true');

      expect(mockSearchModels).toHaveBeenCalledWith(
        expect.objectContaining({
          runtime: 'vllm',
          format: 'safetensors',
          max_vram: 48,
          available: true,
        })
      );
    });
  });

  // =========================================================================
  // POST /v1/passports/:passport_id/sync
  // =========================================================================
  describe('POST /v1/passports/:passport_id/sync', () => {
    it('should sync passport to chain', async () => {
      mockSyncToChain.mockResolvedValue({ ok: true, data: { pda: 'pda1', tx: 'tx1' } });

      const res = await request(buildApp()).post('/v1/passports/pass-001/sync');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.on_chain_pda).toBe('pda1');
    });

    it('should return 404 when passport not found', async () => {
      mockSyncToChain.mockResolvedValue({ ok: false, error: 'Passport not found' });

      const res = await request(buildApp()).post('/v1/passports/nonexistent/sync');

      expect(res.status).toBe(404);
    });

    it('should return 503 when sync handler unavailable', async () => {
      mockSyncToChain.mockResolvedValue({ ok: false, error: 'No on-chain sync handler configured' });

      const res = await request(buildApp()).post('/v1/passports/pass-001/sync');

      expect(res.status).toBe(503);
    });
  });
});
