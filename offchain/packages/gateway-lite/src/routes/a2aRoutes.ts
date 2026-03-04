// offchain/packages/gateway-lite/src/routes/a2aRoutes.ts
// A2A Protocol routes for agent discovery and task management.

import express from 'express';
import { verifyAdminAuth } from '../middleware/adminAuth';

// Lazy imports to avoid circular deps
function getDeploymentService() {
  const { getAgentDeploymentService } = require('../../../engine/src/agent/agentDeploymentService');
  return getAgentDeploymentService();
}

function getA2AModules() {
  const agentCard = require('../../../engine/src/agent/a2a/agentCard');
  const a2aServer = require('../../../engine/src/agent/a2a/a2aServer');
  const a2aClient = require('../../../engine/src/agent/a2a/a2aClient');
  return { agentCard, a2aServer, a2aClient };
}

export const a2aRouter = express.Router();

/**
 * GET /v1/a2a/:passportId/agent.json
 * A2A Agent Card — standard discovery endpoint
 */
a2aRouter.get('/v1/a2a/:passportId/agent.json', async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const service = getDeploymentService();
    const deployment = await service.getDeployment(passportId);

    if (!deployment) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { agentCard } = getA2AModules();
    const baseUrl = deployment.a2a_endpoint?.replace('/.well-known/agent.json', '')
      || `${req.protocol}://${req.get('host')}/v1/a2a/${passportId}`;

    const card = agentCard.generateAgentCard(passportId, deployment.config, baseUrl);
    return res.json(card);
  } catch (error) {
    console.error('Error in GET /v1/a2a/:passportId/agent.json:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/a2a/:passportId/tasks/send
 * Send a task to an A2A agent
 */
a2aRouter.post('/v1/a2a/:passportId/tasks/send', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const { message } = req.body || {};

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!message || !message.parts) {
      return res.status(400).json({ success: false, error: 'Missing message with parts' });
    }

    const { a2aServer, a2aClient } = getA2AModules();

    // Create A2A task
    const task = a2aServer.createA2ATask(message, { agent_passport_id: passportId });

    // Update to working state
    a2aServer.updateTaskState(task, 'working');

    // Extract text and look up deployment
    const text = a2aServer.extractText(message);
    const service = getDeploymentService();
    const deployment = await service.getDeployment(passportId);

    if (!deployment) {
      a2aServer.updateTaskState(task, 'failed', 'Agent not found');
      return res.json(task);
    }

    // If agent has a deployment URL, forward the request via A2A client
    if (deployment.a2a_endpoint) {
      const agentUrl = deployment.a2a_endpoint.replace('/.well-known/agent.json', '');
      const result = await a2aClient.sendTask(agentUrl, text);
      if (result) return res.json(result);
    }

    // Fallback: mark as completed with a message
    a2aServer.updateTaskState(task, 'completed');
    a2aServer.addTaskArtifact(task, `Task forwarded to agent ${passportId}`);
    return res.json(task);
  } catch (error) {
    console.error('Error in POST /v1/a2a/:passportId/tasks/send:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/a2a/discover
 * Discover an external A2A agent by URL
 */
a2aRouter.post('/v1/a2a/discover', verifyAdminAuth, async (req, res) => {
  try {
    const { agent_url, auth_token } = req.body || {};

    if (!agent_url) {
      return res.status(400).json({ success: false, error: 'Missing required field: agent_url' });
    }

    // C2 SSRF protection: validate URL is HTTPS and not internal
    try {
      const parsed = new URL(agent_url);
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ success: false, error: 'Only HTTPS URLs are allowed' });
      }
      const hostname = parsed.hostname;
      // Block internal/private IPs
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.startsWith('192.168.') ||
        hostname === '169.254.169.254' ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local')
      ) {
        return res.status(400).json({ success: false, error: 'Internal/private URLs are not allowed' });
      }
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    const { a2aClient } = getA2AModules();
    const card = await a2aClient.discoverAgent(agent_url, { auth_token });

    if (!card) {
      return res.status(404).json({ success: false, error: 'Agent not found or invalid card' });
    }

    return res.json({ success: true, agent_card: card });
  } catch (error) {
    console.error('Error in POST /v1/a2a/discover:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
