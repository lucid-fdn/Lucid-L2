// offchain/packages/gateway-lite/src/routes/agentDeployRoutes.ts
// REST API routes for the agent deployment pipeline.

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';
import { logger } from '../../../../engine/src/shared/lib/logger';

// Lazy import to avoid circular deps — matches codebase convention for engine imports
function getService() {
  const { getAgentDeploymentService } = require('../../../engine/src/compute/agent/agentDeploymentService');
  return getAgentDeploymentService();
}

export const agentDeployRouter = express.Router();

/**
 * POST /v1/agents/deploy
 * One-click agent deployment
 */
agentDeployRouter.post('/v1/agents/deploy', verifyAdminAuth, async (req, res) => {
  try {
    const { name, description, owner, descriptor, preferred_adapter, tags, list_on_marketplace } = req.body || {};

    if (!name) {
      return res.status(400).json({ success: false, error: 'Missing required field: name' });
    }
    if (!owner) {
      return res.status(400).json({ success: false, error: 'Missing required field: owner' });
    }
    if (!descriptor) {
      return res.status(400).json({ success: false, error: 'Missing required field: descriptor' });
    }

    const service = getService();
    const result = await service.deployAgent({
      name,
      description,
      owner,
      descriptor,
      preferred_adapter,
      tags,
      list_on_marketplace,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, ...result });
    }

    return res.status(201).json({ success: true, deployment: result });
  } catch (error) {
    logger.error('Error in POST /v1/agents/deploy:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/agents/preview
 * Generate agent code without deploying
 */
agentDeployRouter.post('/v1/agents/preview', verifyAdminAuth, async (req, res) => {
  try {
    const { name, owner, descriptor, preferred_adapter } = req.body || {};

    if (!descriptor) {
      return res.status(400).json({ success: false, error: 'Missing required field: descriptor' });
    }

    const service = getService();
    const result = await service.previewAgent({
      name: name || 'preview',
      owner: owner || 'preview',
      descriptor,
      preferred_adapter,
    });

    return res.json({ success: true, preview: result });
  } catch (error) {
    logger.error('Error in POST /v1/agents/preview:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/deployments
 * List all agent deployments
 */
agentDeployRouter.get('/v1/agents/deployments', verifyAdminAuth, async (req, res) => {
  try {
    const { tenant_id, status, target } = req.query;
    const service = getService();
    const deployments = await service.listDeployments({
      tenant_id: tenant_id as string,
      status: status as string,
      target: target as string,
    });

    return res.json({ success: true, deployments });
  } catch (error) {
    logger.error('Error in GET /v1/agents/deployments:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/capabilities
 * List available runtime adapters and deployment targets
 */
agentDeployRouter.get('/v1/agents/capabilities', async (_req, res) => {
  try {
    const service = getService();
    const capabilities = service.getCapabilities();
    return res.json({ success: true, capabilities });
  } catch (error) {
    logger.error('Error in GET /v1/agents/capabilities:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/:passportId/status
 * Get agent deployment status
 */
agentDeployRouter.get('/v1/agents/:passportId/status', async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const service = getService();
    const status = await service.getAgentStatus(passportId);

    if (!status) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    return res.json({ success: true, status });
  } catch (error) {
    logger.error('Error in GET /v1/agents/:passportId/status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/:passportId/logs
 * Get agent deployment logs
 */
agentDeployRouter.get('/v1/agents/:passportId/logs', async (req, res) => {
  try {
    const { passportId } = req.params;
    const tail = parseInt(req.query.tail as string) || 100;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const service = getService();
    const logs = await service.getAgentLogs(passportId, tail);

    return res.json({ success: true, logs });
  } catch (error) {
    logger.error('Error in GET /v1/agents/:passportId/logs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/agents/:passportId/terminate
 * Terminate a deployed agent
 */
agentDeployRouter.post('/v1/agents/:passportId/terminate', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const service = getService();
    const result = await service.terminateAgent(passportId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.json({ success: true, message: `Agent ${passportId} terminated` });
  } catch (error) {
    logger.error('Error in POST /v1/agents/:passportId/terminate:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/:passportId/events
 * Deployment event history (append-only audit log)
 */
agentDeployRouter.get('/v1/agents/:passportId/events', async (req, res) => {
  try {
    const { getDeploymentStore } = await import('../../../../engine/src/deployment/control-plane');
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(req.params.passportId);
    if (!deployment) return res.status(404).json({ success: false, error: 'No active deployment found' });
    const limit = parseInt(req.query.limit as string || '50', 10);
    const events = await store.getEvents(deployment.deployment_id, { limit });
    return res.json({ success: true, data: events });
  } catch (error: any) {
    logger.error('Error in GET /v1/agents/:passportId/events:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ================================================================== */
/*  Phase 3: Blue-Green Rollout Routes                                */
/* ================================================================== */

// Lazy import for RolloutManager to avoid circular deps
function getRollout() {
  const { getRolloutManager } = require('../../../../engine/src/deployment/rollout');
  return getRolloutManager();
}

/**
 * POST /v1/agents/:passportId/deploy/blue-green
 * Deploy a new version to the blue slot
 */
agentDeployRouter.post('/v1/agents/:passportId/deploy/blue-green', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const { descriptor } = req.body || {};

    if (!descriptor) {
      return res.status(400).json({ success: false, error: 'Missing required field: descriptor' });
    }

    const rollout = getRollout();
    const deployment = await rollout.deployBlueGreen(passportId, descriptor);

    return res.status(201).json({ success: true, data: deployment });
  } catch (error: any) {
    logger.error('Error in POST /v1/agents/:passportId/deploy/blue-green:', error);
    const status = error.message?.includes('already has an active blue') ? 409 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /v1/agents/:passportId/promote
 * Promote blue -> primary (atomic slot swap)
 */
agentDeployRouter.post('/v1/agents/:passportId/promote', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const rollout = getRollout();
    const result = await rollout.promote(passportId);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error in POST /v1/agents/:passportId/promote:', error);
    const status = error.message?.includes('No blue deployment') || error.message?.includes('No primary deployment') ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /v1/agents/:passportId/rollback
 * Rollback to previous revision (deploys as blue-green)
 */
agentDeployRouter.post('/v1/agents/:passportId/rollback', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const rollout = getRollout();
    const deployment = await rollout.rollback(passportId);

    return res.status(201).json({ success: true, data: deployment });
  } catch (error: any) {
    logger.error('Error in POST /v1/agents/:passportId/rollback:', error);
    const status = error.message?.includes('No previous revision') ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /v1/agents/:passportId/blue
 * Get blue slot deployment status
 */
agentDeployRouter.get('/v1/agents/:passportId/blue', async (req, res) => {
  try {
    const { passportId } = req.params;
    const rollout = getRollout();
    const deployment = await rollout.getBlueStatus(passportId);

    return res.json({ success: true, data: deployment });
  } catch (error: any) {
    logger.error('Error in GET /v1/agents/:passportId/blue:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /v1/agents/:passportId/blue/cancel
 * Cancel blue deployment without promoting
 */
agentDeployRouter.post('/v1/agents/:passportId/blue/cancel', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const rollout = getRollout();
    await rollout.cancelBlue(passportId);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Error in POST /v1/agents/:passportId/blue/cancel:', error);
    const status = error.message?.includes('No blue deployment') ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});
