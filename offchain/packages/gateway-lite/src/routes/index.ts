// Routes barrel — grouped by domain

// Core settlement routes
export { lucidLayerRouter } from './core/lucidLayerRoutes';
export { passportRouter } from './core/passportRoutes';
export { shareRouter } from './core/shareRoutes';
export { receiptRouter } from './core/receiptRoutes';
export { epochRouter } from './core/epochRoutes';
export { matchingRouter } from './core/matchingRoutes';
export { computeNodeRouter } from './core/computeNodeRoutes';
export { payoutRouter } from './core/payoutRoutes';
export { inferenceRouter } from './core/inferenceRoutes';
export { memoryRouter } from './core/memoryRoutes';
export { createAssetPaymentRouter } from './core/assetPaymentRoutes';
export { createPaymentConfigRouter } from './core/paymentConfigRoutes';
export { createSubscriptionRouter } from './core/subscriptionRoutes';

// Agent routes
export { agentDeployRouter } from './agent/agentDeployRoutes';
// WIP: marketplace moved to _wip/, needs DB persistence before ship
// export { agentMarketplaceRouter } from './agent/agentMarketplaceRoutes';
export { a2aRouter } from './agent/a2aRoutes';
export { agentWalletRouter } from './agent/agentWalletRoutes';
export { agentRevenueRouter } from './agent/agentRevenueRoutes';
export { agentMirrorRouter } from './agent/agentMirrorRoutes';

// Chain & identity routes
export { crossChainRouter } from './chain/crossChainRoutes';
export { escrowRouter } from './chain/escrowRoutes';
export { disputeRouter } from './chain/disputeRoutes';
export { erc7579Router } from './chain/erc7579Routes';
export { tbaRouter } from './chain/tbaRoutes';
export { paymasterRouter } from './chain/paymasterRoutes';
export { solanaRouter } from './chain/solanaRoutes';
export { identityBridgeRouter } from './chain/identityBridgeRoutes';
export { zkmlRouter } from './chain/zkmlRoutes';
export { reputationMarketplaceRouter } from './chain/reputationMarketplaceRoutes';

// System routes
export { healthRouter } from './system/healthRoutes';

// Contrib routes (non-settlement integrations)
export { hyperliquidRouter } from './contrib/hyperliquidRoutes';
export { oauthRouter } from './contrib/oauthRoutes';
export { oauthResourcesRouter } from './contrib/oauthResourcesRoutes';
