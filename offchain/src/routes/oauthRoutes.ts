import express from 'express';
import { NangoService, SUPPORTED_PROVIDERS } from '../services/oauth/nangoService';
import { verifyPrivyToken, PrivyRequest } from '../middleware/privyAuth';
import { verifyHmacSignature, HmacRequest } from '../middleware/hmacAuth';
import { verifyAdminAuth, AdminRequest } from '../middleware/adminAuth';

const router = express.Router();
const nangoService = new NangoService();

/**
 * All routes require Privy authentication except callback and providers
 */
router.use((req, res, next) => {
  // Skip auth for callback and providers endpoints (public endpoints)
  if (req.path === '/callback' || req.path === '/providers') {
    return next();
  }
  return verifyPrivyToken(req as PrivyRequest, res, next);
});

/**
 * GET /api/oauth/providers
 * List available OAuth providers with their configuration status
 * Returns providers with a 'configured' field indicating if they're set up in Nango
 */
router.get('/providers', async (req, res) => {
  try {
    // Get providers with their Nango configuration status
    const providers = await nangoService.getConfiguredProviders();
    
    // Separate into configured and unconfigured
    const configuredProviders = providers.filter(p => p.configured);
    const unconfiguredProviders = providers.filter(p => !p.configured);
    
    res.json({
      providers: configuredProviders,
      availableProviders: unconfiguredProviders.map(({ configured, ...p }) => p),
      totalConfigured: configuredProviders.length,
      totalAvailable: providers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching providers:', error);
    // Fallback to static list if Nango check fails
    res.json({
      providers: SUPPORTED_PROVIDERS.map(p => ({ ...p, configured: false })),
      availableProviders: SUPPORTED_PROVIDERS,
      totalConfigured: 0,
      totalAvailable: SUPPORTED_PROVIDERS.length,
      timestamp: new Date().toISOString(),
      warning: 'Unable to verify Nango configuration. Showing all potential providers.'
    });
  }
});

/**
 * GET /api/oauth/connections
 * List user's active OAuth connections
 */
router.get('/connections', async (req: PrivyRequest, res) => {
  try {
    const privyUserId = req.user!.privyUserId;
    const connections = await nangoService.listConnections(privyUserId);
    
    res.json({
      connections,
      count: connections.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error listing connections:', error);
    res.status(500).json({ 
      error: 'Failed to list connections',
      message: error.message 
    });
  }
});

/**
 * GET /api/oauth/connections/:provider/stats
 * Get usage statistics for a specific connection
 */
router.get('/connections/:provider/stats', async (req: PrivyRequest, res) => {
  try {
    const { provider } = req.params;
    const privyUserId = req.user!.privyUserId;
    
    const stats = await nangoService.getConnectionStats(privyUserId, provider);
    
    res.json({
      provider,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching connection stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      message: error.message 
    });
  }
});

/**
 * POST /api/oauth/:provider/initiate
 * Initiate OAuth flow for a provider
 */
router.post('/:provider/initiate', async (req: PrivyRequest, res) => {
  try {
    const { provider } = req.params;
    const privyUserId = req.user!.privyUserId;
    const userId = req.user!.userId;
    
    // Validate provider is supported
    const supportedProvider = SUPPORTED_PROVIDERS.find(p => p.id === provider);
    if (!supportedProvider) {
      return res.status(400).json({
        error: 'Unsupported provider',
        message: `Provider '${provider}' is not supported`,
        supportedProviders: SUPPORTED_PROVIDERS.map(p => p.id)
      });
    }
    
    const { authUrl, state, connectionId } = await nangoService.initiateOAuthFlow(
      privyUserId,
      userId,
      provider
    );
    
    res.json({
      authUrl,
      state,
      connectionId,
      provider: supportedProvider.name,
      scopes: supportedProvider.requiredScopes,
      expiresIn: 300 // 5 minutes
    });
  } catch (error: any) {
    console.error('Error initiating OAuth flow:', error);
    res.status(500).json({ 
      error: 'Failed to initiate OAuth flow',
      message: error.message 
    });
  }
});

/**
 * GET /api/oauth/callback
 * Handle OAuth callback from provider
 * This endpoint is called by the OAuth provider, not directly by the user
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;
    
    // Handle OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError, error_description);
      return res.redirect(`/dashboard?oauth_error=${oauthError}&message=${error_description || 'OAuth flow failed'}`);
    }
    
    // Validate required parameters
    if (!code || !state) {
      return res.redirect('/dashboard?oauth_error=invalid_request&message=Missing code or state parameter');
    }
    
    const result = await nangoService.handleOAuthCallback(
      code as string,
      state as string
    );
    
    // Redirect to dashboard with success message
    res.redirect(`/dashboard?oauth_success=${result.provider}&provider=${result.provider}`);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.redirect(`/dashboard?oauth_error=callback_failed&message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/oauth/:privyUserId/:provider/token
 * Get access token for n8n workflow
 * PROTECTED BY HMAC SIGNATURE
 */
router.get('/:privyUserId/:provider/token', verifyHmacSignature, async (req: HmacRequest, res) => {
  try {
    const { privyUserId, provider } = req.params;
    const { connectionId } = req.query as { connectionId?: string };
    
    const { token, expiresAt, metadata } = await nangoService.getAccessToken(
      privyUserId,
      provider,
      connectionId
    );
    
    res.json({
      token,
      expiresAt: expiresAt?.toISOString(),
      provider,
      tokenType: metadata?.tokenType || 'Bearer',
      scopes: metadata?.scopes
    });
  } catch (error: any) {
    const { provider: providerParam } = req.params;
    console.error('Error getting access token:', error);
    
    if (error.message.includes('No') && error.message.includes('connection found')) {
      return res.status(404).json({ 
        error: 'Connection not found',
        message: `User has not connected their ${providerParam} account`,
        action: 'initiate_oauth'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get access token',
      message: error.message 
    });
  }
});

/**
 * POST /api/oauth/:privyUserId/:provider/proxy
 * Proxy API call through Nango
 * Alternative approach where Nango makes the API call instead of n8n
 */
router.post('/:privyUserId/:provider/proxy', async (req, res) => {
  try {
    const { privyUserId, provider } = req.params;
    const { endpoint, method, data, n8nWorkflowId, n8nExecutionId } = req.body;
    
    // Validate required fields
    if (!endpoint || !method) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'endpoint and method are required'
      });
    }
    
    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (!validMethods.includes(method.toUpperCase())) {
      return res.status(400).json({
        error: 'Invalid HTTP method',
        message: `Method must be one of: ${validMethods.join(', ')}`
      });
    }
    
    const { connectionId } = req.body;

    const result = await nangoService.proxyApiCall(
      privyUserId,
      provider,
      endpoint,
      method.toUpperCase(),
      data,
      n8nWorkflowId,
      n8nExecutionId,
      connectionId
    );
    
    res.json({
      success: true,
      data: result,
      provider,
      endpoint,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error proxying API call:', error);
    
    // Handle rate limit errors specially
    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: error.message,
        retryAfter: error.resetAt
      });
    }
    
    res.status(error.statusCode || 500).json({ 
      error: 'Failed to proxy API call',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/oauth/:provider
 * Revoke OAuth connection for authenticated user
 */
router.delete('/:provider', async (req: PrivyRequest, res) => {
  try {
    const { provider } = req.params;
    const privyUserId = req.user!.privyUserId;
    const { connectionId } = req.body as { connectionId?: string };
    
    await nangoService.revokeConnection(privyUserId, provider, connectionId);
    
    res.json({
      success: true,
      message: `${provider} connection revoked successfully`,
      provider,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error revoking connection:', error);
    res.status(500).json({ 
      error: 'Failed to revoke connection',
      message: error.message 
    });
  }
});

/**
 * POST /api/oauth/:provider/sync
 * Sync (upsert) a Nango connection into `user_oauth_connections`.
 *
 * Use this after the Nango-hosted OAuth flow completes successfully.
 * This endpoint is authenticated via Privy (same as other protected routes).
 */
router.post('/:provider/sync', async (req: PrivyRequest, res) => {
  try {
    const { provider } = req.params;
    const privyUserId = req.user!.privyUserId;
    const userId = req.user!.userId;

    const { connectionId } = req.body;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({
        error: 'connectionId required',
        message: 'Provide the Nango connectionId used during /initiate (connection_id query param sent to Nango)'
      });
    }

    const result = await nangoService.syncConnectionFromNango(privyUserId, userId, provider, connectionId);

    res.json({
      ...result,
      // backward + forward compatible: surface profile at top level
      profile: result.profile,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error syncing connection:', error);

    // If Nango doesn't have the connection yet
    if (error.message?.toLowerCase().includes('no nango connection')) {
      return res.status(404).json({
        error: 'Connection not found in Nango',
        message: error.message,
        action: 'complete_oauth'
      });
    }

    res.status(500).json({
      error: 'Failed to sync connection',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/admin/anomalies
 * Check for usage anomalies (admin endpoint)
 * REQUIRES ADMIN AUTHENTICATION
 */
router.get('/admin/anomalies', verifyAdminAuth, async (req: AdminRequest, res) => {
  try {
    
    const anomalies = await nangoService.checkAnomalies();
    
    res.json({
      anomalies,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error checking anomalies:', error);
    res.status(500).json({ 
      error: 'Failed to check anomalies',
      message: error.message 
    });
  }
});

/**
 * POST /api/oauth/admin/cleanup
 * Cleanup expired OAuth states (admin endpoint)
 * REQUIRES ADMIN AUTHENTICATION
 */
router.post('/admin/cleanup', verifyAdminAuth, async (req: AdminRequest, res) => {
  try {
    
    const cleanedCount = await nangoService.cleanupExpiredStates();
    
    res.json({
      success: true,
      cleanedStates: cleanedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error cleaning up states:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup states',
      message: error.message 
    });
  }
});

export const oauthRouter = router;
