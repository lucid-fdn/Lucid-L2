// offchain/src/services/api.ts
// Thin barrel — imports domain-specific sub-routers and mounts them.
import express from 'express';
import { mmrApiRouter } from './routes/api/mmrRoutes';
import { agentOrchestratorApiRouter } from './routes/api/agentOrchestratorRoutes';
import { flowspecApiRouter } from './routes/api/flowspecRoutes';
import { toolApiRouter } from './routes/api/toolRoutes';
import { passportApiRouter } from './routes/api/passportApiRoutes';
import { n8nFlowApiRouter } from './routes/api/n8nFlowRoutes';
import { systemApiRouter } from './routes/api/systemApiRoutes';

export async function createApiRouter(): Promise<express.Router> {
  const router = express.Router();

  // Original MMR endpoints (/run, /batch)
  router.use('/', mmrApiRouter);

  // Privy wallet management endpoints
  const walletRoutes = await import('./routes/system/walletRoutes');
  router.use('/wallets', walletRoutes.default);

  // Reward system endpoints
  const rewardRoutes = await import('./routes/contrib/rewardRoutes');
  router.use('/rewards', rewardRoutes.default);

  // AI Agent endpoints (/agents/...)
  router.use('/agents', agentOrchestratorApiRouter);

  // FlowSpec endpoints (/flowspec/...)
  router.use('/flowspec', flowspecApiRouter);

  // System endpoints (/system/status)
  router.use('/', systemApiRouter);

  // MCP Tools endpoints (/tools/...)
  router.use('/tools', toolApiRouter);

  // Passport endpoints (/passports/...)
  router.use('/passports', passportApiRouter);

  // n8n Flow endpoints (/flow/...)
  router.use('/flow', n8nFlowApiRouter);

  return router;
}
