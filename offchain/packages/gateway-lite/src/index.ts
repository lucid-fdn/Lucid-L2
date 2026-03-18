// Copyright 2024-2026 Raijin Labs. Licensed under AGPL-3.0 — see LICENSE in this package.
import 'dotenv/config';
import { hijackConsole } from '../../engine/src/shared/lib/logger';
hijackConsole(); // Redirect console.* to structured JSON logging (must be first)

import express from 'express';
import { API_PORT } from '../../engine/src/shared/config/config';
import { validateEnvironmentOrThrow, printEnvironmentStatus } from '../../../src/utils/environmentValidator';

// --- Observability ---------------------------------------------------------
import { initSentry } from './lib/observability';
import { initTracing } from './lib/observability';

initSentry();
initTracing().catch((err) =>
  console.warn('[otel] Failed to initialize tracing:', err),
);
// ---------------------------------------------------------------------------

// Validate environment variables on startup
validateEnvironmentOrThrow();
printEnvironmentStatus();

// Import protocol adapters to trigger auto-registration
import './protocols/adapters';

// Import routes — grouped by domain
import { oauthRouter } from './routes/contrib/oauthRoutes';
import { oauthResourcesRouter } from './routes/contrib/oauthResourcesRoutes';
import { healthRouter } from './routes/system/healthRoutes';
import { hyperliquidRouter } from './routes/contrib/hyperliquidRoutes';
import { solanaRouter } from './routes/chain/solanaRoutes';
import { lucidLayerRouter } from './routes/core/lucidLayerRoutes';
import { passportRouter } from './routes/core/passportRoutes';
import { shareRouter } from './routes/core/shareRoutes';
import { createApiRouter } from './api';
import { identityBridgeRouter } from './routes/chain/identityBridgeRoutes';
import { reputationMarketplaceRouter } from './routes/chain/reputationMarketplaceRoutes';
import { tbaRouter } from './routes/chain/tbaRoutes';
import { escrowRouter } from './routes/chain/escrowRoutes';
import { disputeRouter } from './routes/chain/disputeRoutes';
import { paymasterRouter } from './routes/chain/paymasterRoutes';
import { erc7579Router } from './routes/chain/erc7579Routes';
import { zkmlRouter } from './routes/chain/zkmlRoutes';
import { agentDeployRouter } from './routes/agent/agentDeployRoutes';
import { launchRouter } from './routes/agent/launchRoutes';
import { a2aRouter } from './routes/agent/a2aRoutes';
import { agentWalletRouter } from './routes/agent/agentWalletRoutes';
import { agentRevenueRouter } from './routes/agent/agentRevenueRoutes';
import { agentMirrorRouter } from './routes/agent/agentMirrorRoutes';
import { createAssetPaymentRouter } from './routes/core/assetPaymentRoutes';
import { createPaymentConfigRouter } from './routes/core/paymentConfigRoutes';
import { createSubscriptionRouter } from './routes/core/subscriptionRoutes';

// Middleware & startup modules
import { applyMiddleware } from './middleware';
import { initializeBackgroundServices, registerShutdownHandlers } from './startup';

// ---------------------------------------------------------------------------
// Create Express app
// ---------------------------------------------------------------------------
const app = express();

// Apply all middleware (helmet, CORS, rate limits, body parsing, OpenAPI, Swagger)
applyMiddleware(app);

// Mount API routes (async router needs to be awaited)
(async () => {
  const apiRouter = await createApiRouter();
  app.use('/api', apiRouter);
})();

// Mount LucidLayer MVP routes (versioned)
app.use('/', lucidLayerRouter);

// Mount Passport CRUD routes (LucidLayer Phase 1)
app.use('/', passportRouter);

// Mount Share Token routes (fractional ownership)
app.use('/', shareRouter);

// Mount OAuth routes for Nango integration
app.use('/api/oauth', oauthRouter);
app.use('/api/oauth', oauthResourcesRouter);

// Mount Hyperliquid trading routes
app.use('/api/hyperliquid', hyperliquidRouter);

// Mount Solana blockchain routes
app.use('/api/solana', solanaRouter);

// Mount health check routes
app.use('/health', healthRouter);

// Preview / Phase 3 routes (gated behind env flag)
if (process.env.PREVIEW_ROUTES_ENABLED === 'true') {
  app.use('/', identityBridgeRouter);
  app.use('/', reputationMarketplaceRouter);
  app.use('/', tbaRouter);
  app.use('/', escrowRouter);
  app.use('/', disputeRouter);
  app.use('/', paymasterRouter);
  app.use('/', erc7579Router);
  app.use('/', zkmlRouter);
  console.log('[gateway-lite] Preview routes enabled (identity, reputation, TBA, escrow, dispute, paymaster, erc7579, zkml)');
}

// Mount Agent Deployment pipeline routes
app.use('/', agentDeployRouter);
app.use('/', launchRouter);
app.use('/', a2aRouter);
app.use('/', agentWalletRouter);
app.use('/', agentRevenueRouter);
app.use('/', agentMirrorRouter);

// Mount Asset Payment & Config routes
app.use('/v1/assets', createAssetPaymentRouter());
app.use('/v1/config', createPaymentConfigRouter());

// Mount Subscription route (x402-gated access)
app.use('/', createSubscriptionRouter());

// ---------------------------------------------------------------------------
// Background services + shutdown
// ---------------------------------------------------------------------------
initializeBackgroundServices(app);
registerShutdownHandlers();

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
