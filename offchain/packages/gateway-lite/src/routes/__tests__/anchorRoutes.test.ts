import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — before importing the router
// ---------------------------------------------------------------------------

const mockGetByAgent = jest.fn();
const mockGetById = jest.fn();
const mockGetLineage = jest.fn();
const mockGetByCID = jest.fn();
const mockVerify = jest.fn();

jest.mock('../../../../engine/src/anchoring', () => ({
  getAnchorRegistry: () => ({
    getByAgent: mockGetByAgent,
    getById: mockGetById,
    getLineage: mockGetLineage,
    getByCID: mockGetByCID,
  }),
  getAnchorVerifier: () => ({
    verify: mockVerify,
  }),
}));

import { anchorRouter } from '../core/anchorRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(anchorRouter);
  return app;
}

const SAMPLE_ANCHOR = {
  anchor_id: 'anchor-001',
  agent_passport_id: 'agent-1',
  artifact_type: 'epoch_bundle',
  cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  content_hash: 'abc123',
  created_at: '2026-03-14T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Anchor Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  // =========================================================================
  // GET /v1/anchors
  // =========================================================================
  describe('GET /v1/anchors', () => {
    it('should return anchors for an agent', async () => {
      mockGetByAgent.mockResolvedValue([SAMPLE_ANCHOR]);

      const res = await request(buildApp())
        .get('/v1/anchors?agent_passport_id=agent-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].anchor_id).toBe('anchor-001');
    });

    it('should return 400 when agent_passport_id is missing', async () => {
      const res = await request(buildApp()).get('/v1/anchors');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Missing');
    });

    it('should pass artifact_type and limit to registry', async () => {
      mockGetByAgent.mockResolvedValue([]);

      await request(buildApp())
        .get('/v1/anchors?agent_passport_id=agent-1&artifact_type=epoch_bundle&limit=10');

      expect(mockGetByAgent).toHaveBeenCalledWith('agent-1', {
        artifact_type: 'epoch_bundle',
        limit: 10,
      });
    });
  });

  // =========================================================================
  // GET /v1/anchors/:anchor_id
  // =========================================================================
  describe('GET /v1/anchors/:anchor_id', () => {
    it('should return an anchor by ID', async () => {
      mockGetById.mockResolvedValue(SAMPLE_ANCHOR);

      const res = await request(buildApp()).get('/v1/anchors/anchor-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.anchor_id).toBe('anchor-001');
    });

    it('should return 404 when anchor not found', async () => {
      mockGetById.mockResolvedValue(null);

      const res = await request(buildApp()).get('/v1/anchors/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  // =========================================================================
  // GET /v1/anchors/:anchor_id/lineage
  // =========================================================================
  describe('GET /v1/anchors/:anchor_id/lineage', () => {
    it('should return lineage chain', async () => {
      mockGetLineage.mockResolvedValue([SAMPLE_ANCHOR]);

      const res = await request(buildApp()).get('/v1/anchors/anchor-001/lineage');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 500 on service error', async () => {
      mockGetLineage.mockRejectedValue(new Error('DB down'));

      const res = await request(buildApp()).get('/v1/anchors/anchor-001/lineage');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // POST /v1/anchors/:anchor_id/verify
  // =========================================================================
  describe('POST /v1/anchors/:anchor_id/verify', () => {
    it('should verify an anchor', async () => {
      mockVerify.mockResolvedValue({ valid: true, cid: SAMPLE_ANCHOR.cid });

      const res = await request(buildApp())
        .post('/v1/anchors/anchor-001/verify');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
    });

    it('should return 500 on verification error', async () => {
      mockVerify.mockRejectedValue(new Error('Provider unreachable'));

      const res = await request(buildApp())
        .post('/v1/anchors/anchor-001/verify');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // GET /v1/anchors/cid/:cid
  // =========================================================================
  describe('GET /v1/anchors/cid/:cid', () => {
    it('should return anchor by CID', async () => {
      mockGetByCID.mockResolvedValue(SAMPLE_ANCHOR);

      const res = await request(buildApp())
        .get(`/v1/anchors/cid/${SAMPLE_ANCHOR.cid}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cid).toBe(SAMPLE_ANCHOR.cid);
    });

    it('should return 404 when CID not found', async () => {
      mockGetByCID.mockResolvedValue(null);

      const res = await request(buildApp())
        .get('/v1/anchors/cid/bafyunknown');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('CID not found');
    });
  });
});
