import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — before importing the router
// ---------------------------------------------------------------------------

// Mock admin auth — we test both pass-through and rejection
const mockVerifyAdminAuth = jest.fn((_req: any, _res: any, next: () => void) => next());

jest.mock('../../middleware/adminAuth', () => ({
  verifyAdminAuth: (req: any, res: any, next: () => void) =>
    mockVerifyAdminAuth(req, res, next),
}));

// Mock DB pool (adminAuth imports it)
jest.mock('../../../../engine/src/shared/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

// The route file uses a lazy require('../../../engine/src/compute/agent/agentDeploymentService')
// which resolves to a non-standard path. We mock at the path that resolves from the
// route file's location (routes/agent/ -> 3 ups -> gateway-lite/engine/...).
// Using { virtual: true } because the physical file lives elsewhere.
const mockDeployAgent = jest.fn();
const mockPreviewAgent = jest.fn();
const mockListDeployments = jest.fn();
const mockGetCapabilities = jest.fn();
const mockGetAgentStatus = jest.fn();
const mockGetAgentLogs = jest.fn();
const mockTerminateAgent = jest.fn();

const mockServiceObject = {
  deployAgent: mockDeployAgent,
  previewAgent: mockPreviewAgent,
  listDeployments: mockListDeployments,
  getCapabilities: mockGetCapabilities,
  getAgentStatus: mockGetAgentStatus,
  getAgentLogs: mockGetAgentLogs,
  terminateAgent: mockTerminateAgent,
};

// Mock at BOTH possible resolution paths — the route's lazy require resolves
// relative to the route file, and Jest resolves mock paths relative to the test file.
// Path from route file (routes/agent): ../../../engine = gateway-lite/engine
jest.mock('../../../engine/src/compute/agent/agentDeploymentService', () => ({
  getAgentDeploymentService: () => mockServiceObject,
}), { virtual: true });

// Also mock at the correct physical path in case ts-jest resolves it differently
jest.mock('../../../../engine/src/compute/agent/agentDeploymentService', () => ({
  getAgentDeploymentService: () => mockServiceObject,
}));

import { agentDeployRouter } from '../agent/agentDeployRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentDeployRouter);
  return app;
}

/** Simulate admin auth rejection (401) */
function rejectAdmin() {
  mockVerifyAdminAuth.mockImplementation((_req: any, res: any) => {
    res.status(401).json({ error: 'Unauthorized', message: 'Admin authentication required.' });
  });
}

/** Reset admin auth to pass-through */
function allowAdmin() {
  mockVerifyAdminAuth.mockImplementation((_req: any, _res: any, next: () => void) => next());
}

const VALID_DEPLOY_INPUT = {
  name: 'my-agent',
  owner: 'wallet-123',
  descriptor: { runtime: 'node', entry: 'index.js' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Deploy Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowAdmin();
  });

  // =========================================================================
  // POST /v1/agents/deploy
  // =========================================================================
  describe('POST /v1/agents/deploy', () => {
    it('should return 401 without admin auth', async () => {
      rejectAdmin();

      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send(VALID_DEPLOY_INPUT);

      expect(res.status).toBe(401);
    });

    it('should deploy successfully with valid input', async () => {
      mockDeployAgent.mockResolvedValue({
        success: true,
        passport_id: 'pass-1',
        deployment_id: 'dep-1',
      });

      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send(VALID_DEPLOY_INPUT);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.deployment.passport_id).toBe('pass-1');
      expect(mockDeployAgent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-agent', owner: 'wallet-123' })
      );
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send({ owner: 'w1', descriptor: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('should return 400 when owner is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send({ name: 'a', descriptor: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('owner');
    });

    it('should return 400 when descriptor is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send({ name: 'a', owner: 'w1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('descriptor');
    });

    it('should return 400 when service returns success=false', async () => {
      mockDeployAgent.mockResolvedValue({
        success: false,
        error: 'No deployer available',
      });

      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send(VALID_DEPLOY_INPUT);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 when service throws', async () => {
      mockDeployAgent.mockRejectedValue(new Error('infra explosion'));

      const res = await request(buildApp())
        .post('/v1/agents/deploy')
        .send(VALID_DEPLOY_INPUT);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('infra explosion');
    });
  });

  // =========================================================================
  // GET /v1/agents/:passportId/status
  // =========================================================================
  describe('GET /v1/agents/:passportId/status', () => {
    it('should return deployment status', async () => {
      mockGetAgentStatus.mockResolvedValue({
        passport_id: 'pass-1',
        state: 'running',
        url: 'https://my-agent.railway.app',
      });

      const res = await request(buildApp()).get('/v1/agents/pass-1/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status.state).toBe('running');
    });

    it('should return 404 when deployment not found', async () => {
      mockGetAgentStatus.mockResolvedValue(null);

      const res = await request(buildApp()).get('/v1/agents/nonexistent/status');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Deployment not found');
    });
  });

  // =========================================================================
  // GET /v1/agents/:passportId/logs
  // =========================================================================
  describe('GET /v1/agents/:passportId/logs', () => {
    it('should return logs with default tail', async () => {
      mockGetAgentLogs.mockResolvedValue(['line1', 'line2']);

      const res = await request(buildApp()).get('/v1/agents/pass-1/logs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs).toEqual(['line1', 'line2']);
      expect(mockGetAgentLogs).toHaveBeenCalledWith('pass-1', 100);
    });

    it('should pass custom tail parameter', async () => {
      mockGetAgentLogs.mockResolvedValue([]);

      await request(buildApp()).get('/v1/agents/pass-1/logs?tail=50');

      expect(mockGetAgentLogs).toHaveBeenCalledWith('pass-1', 50);
    });
  });

  // =========================================================================
  // POST /v1/agents/:passportId/terminate
  // =========================================================================
  describe('POST /v1/agents/:passportId/terminate', () => {
    it('should return 401 without admin auth', async () => {
      rejectAdmin();

      const res = await request(buildApp()).post('/v1/agents/pass-1/terminate');

      expect(res.status).toBe(401);
    });

    it('should terminate successfully', async () => {
      mockTerminateAgent.mockResolvedValue({ success: true });

      const res = await request(buildApp()).post('/v1/agents/pass-1/terminate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('pass-1');
    });

    it('should return 400 when termination fails', async () => {
      mockTerminateAgent.mockResolvedValue({
        success: false,
        error: 'Already terminated',
      });

      const res = await request(buildApp()).post('/v1/agents/pass-1/terminate');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Already terminated');
    });
  });

  // =========================================================================
  // GET /v1/agents/deployments (list)
  // =========================================================================
  describe('GET /v1/agents/deployments', () => {
    it('should return 401 without admin auth', async () => {
      rejectAdmin();

      const res = await request(buildApp()).get('/v1/agents/deployments');

      expect(res.status).toBe(401);
    });

    it('should list deployments', async () => {
      mockListDeployments.mockResolvedValue([
        { passport_id: 'p1', state: 'running' },
      ]);

      const res = await request(buildApp()).get('/v1/agents/deployments');

      expect(res.status).toBe(200);
      expect(res.body.deployments).toHaveLength(1);
    });

    it('should pass query filters', async () => {
      mockListDeployments.mockResolvedValue([]);

      await request(buildApp()).get(
        '/v1/agents/deployments?tenant_id=t1&status=running&target=railway'
      );

      expect(mockListDeployments).toHaveBeenCalledWith({
        tenant_id: 't1',
        status: 'running',
        target: 'railway',
      });
    });
  });

  // =========================================================================
  // GET /v1/agents/capabilities
  // =========================================================================
  describe('GET /v1/agents/capabilities', () => {
    it('should return capabilities (no auth required)', async () => {
      rejectAdmin(); // should not matter — capabilities is public
      mockGetCapabilities.mockReturnValue({
        adapters: ['langchain', 'crewai'],
        targets: ['docker', 'railway'],
      });

      const res = await request(buildApp()).get('/v1/agents/capabilities');

      expect(res.status).toBe(200);
      expect(res.body.capabilities.targets).toContain('railway');
    });
  });

  // =========================================================================
  // POST /v1/agents/preview
  // =========================================================================
  describe('POST /v1/agents/preview', () => {
    it('should return 401 without admin auth', async () => {
      rejectAdmin();

      const res = await request(buildApp())
        .post('/v1/agents/preview')
        .send({ descriptor: { runtime: 'node' } });

      expect(res.status).toBe(401);
    });

    it('should return 400 when descriptor is missing', async () => {
      const res = await request(buildApp())
        .post('/v1/agents/preview')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('descriptor');
    });

    it('should return preview result', async () => {
      mockPreviewAgent.mockResolvedValue({
        dockerfile: 'FROM node:20',
        files: ['index.js'],
      });

      const res = await request(buildApp())
        .post('/v1/agents/preview')
        .send({ descriptor: { runtime: 'node' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.preview.dockerfile).toBeDefined();
    });
  });
});
