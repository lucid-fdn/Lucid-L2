// offchain/packages/gateway-lite/src/routes/agentDeployRoutes.ts
// REST API routes for the agent deployment pipeline.

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';
import { logger } from '../../../../engine/src/shared/lib/logger';

// Lazy import to avoid circular deps — matches codebase convention for engine imports
function getService() {
  const { getAgentDeploymentService } = require('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
  return getAgentDeploymentService();
}

export const agentDeployRouter = express.Router();

type ExternalDeploymentRef = {
  provider: string;
  provider_deployment_id: string;
  deployment_url?: string | null;
};

type ResolvedDeploymentHandle = ExternalDeploymentRef & {
  deployment_id?: string | null;
  actual_state?: string | null;
};

function parseExternalDeploymentRef(req: express.Request): ExternalDeploymentRef | null {
  const bodyRef = req.body?.controlPlaneRef;
  const provider =
    (typeof bodyRef?.provider === 'string' ? bodyRef.provider : null) ??
    (typeof req.query.provider === 'string' ? req.query.provider : null);
  const providerDeploymentId =
    (typeof bodyRef?.providerDeploymentId === 'string' ? bodyRef.providerDeploymentId : null) ??
    (typeof req.query.providerDeploymentId === 'string' ? req.query.providerDeploymentId : null);
  const deploymentUrl =
    (typeof bodyRef?.deploymentUrl === 'string' ? bodyRef.deploymentUrl : null) ??
    (typeof req.query.deploymentUrl === 'string' ? req.query.deploymentUrl : null);

  if (!provider || !providerDeploymentId) return null;
  return {
    provider,
    provider_deployment_id: providerDeploymentId,
    deployment_url: deploymentUrl,
  };
}

async function resolveDeploymentHandle(
  req: express.Request,
  passportId: string,
): Promise<ResolvedDeploymentHandle | null> {
  const externalRef = parseExternalDeploymentRef(req);
  if (externalRef) {
    return {
      ...externalRef,
      deployment_id: null,
      actual_state: 'unknown',
    };
  }

  const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
  const store = getDeploymentStore();
  const deployment = await store.getActiveByAgent(passportId);
  if (!deployment || !deployment.provider_deployment_id) return null;

  return {
    provider: deployment.provider,
    provider_deployment_id: deployment.provider_deployment_id,
    deployment_url: deployment.deployment_url || null,
    deployment_id: deployment.deployment_id,
    actual_state: deployment.actual_state,
  };
}

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

    if (!parseExternalDeploymentRef(req)) {
      const service = getService();
      const status = await service.getAgentStatus(passportId);

      if (!status) {
        return res.status(404).json({ success: false, error: 'Deployment not found' });
      }

      return res.json({ success: true, status });
    }

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }
    const { getDeployer } = await import('../../../../engine/src/compute/providers');
    const deployer = getDeployer(deployment.provider);
    const status = await deployer.status(deployment.provider_deployment_id);

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

    if (!parseExternalDeploymentRef(req)) {
      const service = getService();
      const logs = await service.getAgentLogs(passportId, tail);
      return res.json({ success: true, logs });
    }

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }
    const { getDeployer } = await import('../../../../engine/src/compute/providers');
    const deployer = getDeployer(deployment.provider);
    const logs = await deployer.logs(deployment.provider_deployment_id, { tail });

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

    if (!parseExternalDeploymentRef(req)) {
      const service = getService();
      const result = await service.terminateAgent(passportId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, message: `Agent ${passportId} terminated` });
    }

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }
    const { getDeployer } = await import('../../../../engine/src/compute/providers');
    const deployer = getDeployer(deployment.provider);
    await deployer.terminate(deployment.provider_deployment_id);

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
    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
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
  const { getRolloutManager } = require('../../../../engine/src/compute/control-plane/rollout');
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

/* ================================================================== */
/*  Provider Capabilities & Extended Operations                        */
/* ================================================================== */

/**
 * GET /v1/agents/:passportId/capabilities
 * Returns grouped provider capabilities for this deployment.
 */
agentDeployRouter.get('/v1/agents/:passportId/capabilities', async (req, res) => {
  try {
    const { passportId } = req.params;
    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { getProviderCapabilities } = await import('../../../../engine/src/compute/control-plane/reconciler/provider-sync');
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);

    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }

    const capabilities = getProviderCapabilities(deployment.provider);

    return res.json({
      success: true,
      provider: deployment.provider,
      deploymentMode: 'managed',
      capabilities,
    });
  } catch (error: any) {
    logger.error('Error in GET /v1/agents/:passportId/capabilities:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /v1/agents/:passportId/metrics
 * Returns deployment metrics (CPU, memory, disk, network).
 */
agentDeployRouter.get('/v1/agents/:passportId/metrics', async (req, res) => {
  try {
    const { passportId } = req.params;
    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const { getProviderCapabilities } = await import('../../../../engine/src/compute/control-plane/reconciler/provider-sync');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'observability.metrics', deployer, 'metrics');

    const range = parseInt(req.query.range as string) || undefined;
    const granularity = req.query.granularity as 'minute' | 'hour' | 'day' | undefined;
    const metrics = await deployer.metrics!(deployment.provider_deployment_id, { range, granularity });

    return res.json({ success: true, metrics });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in GET /v1/agents/:passportId/metrics:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /v1/agents/:passportId/redeploy
 * Trigger a redeploy (rebuild + restart).
 */
agentDeployRouter.post('/v1/agents/:passportId/redeploy', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'lifecycle.redeploy', deployer, 'redeploy');

    const result = await deployer.redeploy!(deployment.provider_deployment_id);

    // Emit a restart-like lifecycle event. The control-plane event model
    // tracks redeploys under the existing restarted lifecycle type.
    return res.json({ success: true, result });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in POST /v1/agents/:passportId/redeploy:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /v1/agents/:passportId/env
 * Update environment variables (string = set/update, null = delete).
 */
agentDeployRouter.put('/v1/agents/:passportId/env', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const vars = req.body?.vars;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!vars || typeof vars !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing or invalid vars object in body' });
    }

    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const deployment = await resolveDeploymentHandle(req, passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'configuration.envUpdate', deployer, 'updateEnvVars');

    await deployer.updateEnvVars!(deployment.provider_deployment_id, vars);

    return res.json({ success: true, message: 'Environment variables updated' });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in PUT /v1/agents/:passportId/env:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /v1/agents/:passportId/domains
 * List domains for a deployment.
 */
agentDeployRouter.get('/v1/agents/:passportId/domains', async (req, res) => {
  try {
    const { passportId } = req.params;
    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }
    if (!deployment.provider_deployment_id) {
      return res.status(400).json({ success: false, error: 'Deployment has no provider ID' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'configuration.customDomains', deployer, 'listDomains');

    const domains = await deployer.listDomains!(deployment.provider_deployment_id);
    return res.json({ success: true, domains });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in GET /v1/agents/:passportId/domains:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /v1/agents/:passportId/domains
 * Add a custom domain.
 */
agentDeployRouter.post('/v1/agents/:passportId/domains', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const { domain } = req.body || {};

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid domain in body' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }
    if (!deployment.provider_deployment_id) {
      return res.status(400).json({ success: false, error: 'Deployment has no provider ID' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'configuration.customDomains', deployer, 'addDomain');

    const result = await deployer.addDomain!(deployment.provider_deployment_id, domain);
    return res.status(201).json({ success: true, domain: result });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in POST /v1/agents/:passportId/domains:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /v1/agents/:passportId/domains/:domain
 * Remove a custom domain.
 */
agentDeployRouter.delete('/v1/agents/:passportId/domains/:domain', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId, domain } = req.params;
    if (!passportId || !domain) {
      return res.status(400).json({ success: false, error: 'Missing passportId or domain parameter' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }
    if (!deployment.provider_deployment_id) {
      return res.status(400).json({ success: false, error: 'Deployment has no provider ID' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'configuration.customDomains', deployer, 'removeDomain');

    await deployer.removeDomain!(deployment.provider_deployment_id, domain);
    return res.json({ success: true, message: `Domain ${domain} removed` });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in DELETE /v1/agents/:passportId/domains/:domain:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /v1/agents/:passportId/healthcheck
 * Set healthcheck configuration.
 */
agentDeployRouter.put('/v1/agents/:passportId/healthcheck', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const config = req.body;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!config?.path || !config?.intervalSeconds || !config?.timeoutSeconds) {
      return res.status(400).json({ success: false, error: 'Missing healthcheck config (path, intervalSeconds, timeoutSeconds)' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }
    if (!deployment.provider_deployment_id) {
      return res.status(400).json({ success: false, error: 'Deployment has no provider ID' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'observability.healthcheckConfig', deployer, 'setHealthcheck');

    await deployer.setHealthcheck!(deployment.provider_deployment_id, {
      path: config.path,
      intervalSeconds: config.intervalSeconds,
      timeoutSeconds: config.timeoutSeconds,
    });

    return res.json({ success: true, message: 'Healthcheck configuration updated' });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in PUT /v1/agents/:passportId/healthcheck:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /v1/agents/:passportId/restart-policy
 * Set restart policy.
 */
agentDeployRouter.put('/v1/agents/:passportId/restart-policy', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const { policy } = req.body || {};

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!policy || !['always', 'on_failure', 'never'].includes(policy)) {
      return res.status(400).json({ success: false, error: 'Invalid restart policy (must be always, on_failure, or never)' });
    }

    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
    const { requireCapability } = await import('../../../../engine/src/compute/control-plane/agent/agentDeploymentService');
    const { getDeployer } = await import('../../../../engine/src/compute/providers');

    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'No active deployment found' });
    }
    if (!deployment.provider_deployment_id) {
      return res.status(400).json({ success: false, error: 'Deployment has no provider ID' });
    }

    const deployer = getDeployer(deployment.provider);
    requireCapability(deployment.provider, 'configuration.restartPolicy', deployer, 'setRestartPolicy');

    await deployer.setRestartPolicy!(deployment.provider_deployment_id, policy);

    return res.json({ success: true, message: `Restart policy set to ${policy}` });
  } catch (error: any) {
    if (error.name === 'UnsupportedCapabilityError') {
      return res.status(501).json({ success: false, error: error.message });
    }
    logger.error('Error in PUT /v1/agents/:passportId/restart-policy:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
