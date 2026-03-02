import { Nango } from '@nangohq/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { fetchProviderProfile, normalizeProfile, NormalizedProfile } from './providerProfileService';

type ProxyProfileConfig = {
  endpoint: string;
  method: 'GET';
  normalize: (data: any) => NormalizedProfile;
};

function safeString(v: any): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v;
  return null;
}

const PROVIDER_PROFILE_ENDPOINTS: Record<string, ProxyProfileConfig> = {
  twitter: {
    endpoint: '/2/users/me?user.fields=profile_image_url,name,username',
    method: 'GET',
    normalize: (resp: any) => {
      const data = resp?.data || resp;
      return {
        username: safeString(data?.username),
        displayName: safeString(data?.name),
        email: null,
        avatarUrl: safeString(data?.profile_image_url)
      };
    }
  },
  github: {
    endpoint: '/user',
    method: 'GET',
    normalize: (resp: any) => {
      const data = resp?.data || resp;
      return {
        username: safeString(data?.login),
        displayName: safeString(data?.name),
        email: safeString(data?.email),
        avatarUrl: safeString(data?.avatar_url)
      };
    }
  },
  slack: {
    endpoint: '/users.identity',
    method: 'GET',
    normalize: (resp: any) => {
      const data = resp?.data || resp;
      const user = data?.user || data;
      return {
        username: safeString(user?.name),
        displayName: safeString(user?.name),
        email: safeString(user?.email),
        avatarUrl: safeString(user?.image_192 || user?.image_72 || user?.image_48)
      };
    }
  },
  notion: {
    endpoint: '/v1/users/me',
    method: 'GET',
    normalize: (resp: any) => {
      const data = resp?.data || resp;
      return {
        username: safeString(data?.name),
        displayName: safeString(data?.name),
        email: null,
        avatarUrl: safeString(data?.avatar_url)
      };
    }
  },
  google: {
    endpoint: '/oauth2/v2/userinfo',
    method: 'GET',
    normalize: (resp: any) => {
      const data = resp?.data || resp;
      return {
        username: safeString(data?.email),
        displayName: safeString(data?.name),
        email: safeString(data?.email),
        avatarUrl: safeString(data?.picture)
      };
    }
  }
};

// Type-safe wrapper for Nango credentials
interface NangoCredentials {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string | number;
  token_type?: string;
  scopes?: string[];
  [key: string]: any;
}

export interface OAuthProvider {
  id: string;
  name: string;
  icon: string;
  requiredScopes: string[];
  category: 'social' | 'exchange' | 'communication' | 'other';
}

// Map external provider IDs to Nango integration IDs
// This allows backward compatibility when Nango provider names change
export const PROVIDER_TO_NANGO_MAP: Record<string, string> = {
  'twitter': 'twitter-v2',  // Twitter now uses OAuth 2.0 (twitter-v2)
};

export const SUPPORTED_PROVIDERS: OAuthProvider[] = [
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: '/icons/twitter.svg',
    requiredScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    category: 'social'
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '/icons/discord.svg',
    requiredScopes: ['identify', 'guilds', 'messages.write'],
    category: 'communication'
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    icon: '/icons/telegram.svg',
    requiredScopes: [],
    category: 'communication'
  },
  {
    id: 'binance',
    name: 'Binance',
    icon: '/icons/binance.svg',
    requiredScopes: ['read', 'trade'],
    category: 'exchange'
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    icon: '/icons/coinbase.svg',
    requiredScopes: ['wallet:accounts:read', 'wallet:transactions:send'],
    category: 'exchange'
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '/icons/github.svg',
    requiredScopes: ['repo', 'user'],
    category: 'other'
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '/icons/slack.svg',
    requiredScopes: ['chat:write', 'channels:read'],
    category: 'communication'
  }
];

interface RateLimitConfig {
  window: number; // milliseconds
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  twitter: { window: 3600000, maxRequests: 300 },
  discord: { window: 3600000, maxRequests: 50 },
  telegram: { window: 3600000, maxRequests: 100 },
  binance: { window: 3600000, maxRequests: 1200 },
  coinbase: { window: 3600000, maxRequests: 600 },
  github: { window: 3600000, maxRequests: 5000 },
  slack: { window: 3600000, maxRequests: 100 }
};

export class NangoService {
  private nango: Nango;
  private supabase: SupabaseClient;
  private redis: Redis;
  private nangoHost: string;
  private nangoPublicUrl: string;
  private nangoPublicKey: string;
  private nangoSecretKey: string;
  
  constructor() {
    this.nangoSecretKey = process.env.NANGO_SECRET_KEY!;
    // Public key for OAuth connect URLs (required for browser-initiated flows)
    this.nangoPublicKey = process.env.NANGO_PUBLIC_KEY!;
    // Internal URL for server-to-server API calls (SDK, proxy, etc.)
    this.nangoHost = process.env.NANGO_API_URL || 'http://localhost:3003';
    // Public URL for browser redirects (OAuth authorization URLs)
    this.nangoPublicUrl = process.env.NANGO_PUBLIC_URL || this.nangoHost;
    
    this.nango = new Nango({
      secretKey: this.nangoSecretKey,
      host: this.nangoHost
    });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  /**
   * Get list of providers with their configuration status from Nango
   * Returns only providers that are actually configured in Nango
   * Uses direct database query to bypass Nango API authentication issues
   */
  async getConfiguredProviders(): Promise<(OAuthProvider & { configured: boolean })[]> {
    const cacheKey = 'nango:configured-providers';
    
    // Check cache first (5 minute TTL)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch all configured integrations from Nango database directly
    const configuredIntegrations: Set<string> = new Set();
    
    try {
      // Query the Nango database directly for PROD environment integrations
      // Environment ID 1 = prod, Environment ID 2 = dev
      // Using pg for direct query since supabase client doesn't expose nango schema

      const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'aws-1-eu-north-1.pooler.supabase.com',
        port: parseInt(process.env.POSTGRES_PORT || '6543'),
        database: process.env.POSTGRES_DB || 'postgres',
        user: process.env.POSTGRES_USER || 'postgres.kwihlcnapmkaivijyiif',
        password: process.env.POSTGRES_PASSWORD,
        ssl: { rejectUnauthorized: false }
      });
      
      try {
        const result = await pool.query(
          'SELECT unique_key, provider FROM nango._nango_configs WHERE environment_id = 1 AND deleted = false'
        );
        
        const configs = result.rows;
        console.log(`[NangoService] Fetched ${configs.length} integrations from Nango database (prod environment)`);
        
        configs.forEach((config: any) => {
          // Both unique_key and provider can identify the integration
          const key = config.unique_key || config.provider;
          if (key) {
            configuredIntegrations.add(key.toLowerCase());
            console.log(`[NangoService] Found configured integration: ${key}`);
          }
        });
      } finally {
        await pool.end();
      }
    } catch (error) {
      console.error('[NangoService] Error fetching Nango integrations from database:', error);
      
      // Fallback to Nango API as secondary option
      try {
        const response = await fetch(
          `${this.nangoHost}/config`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.nangoSecretKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const configs = data.configs || data || [];
          
          if (Array.isArray(configs)) {
            configs.forEach((config: any) => {
              const key = config.unique_key || config.provider_config_key || config.provider;
              if (key) {
                configuredIntegrations.add(key.toLowerCase());
              }
            });
          }
        }
      } catch (apiError) {
        console.error('[NangoService] API fallback also failed:', apiError);
      }
    }
    
    // Map SUPPORTED_PROVIDERS with their configuration status
    // Check both the provider ID and its mapped Nango integration ID (e.g., twitter -> twitter-v2)
    const configuredProviders = SUPPORTED_PROVIDERS.map(provider => {
      const nangoId = PROVIDER_TO_NANGO_MAP[provider.id] || provider.id;
      const isConfigured = configuredIntegrations.has(provider.id.toLowerCase()) || 
                          configuredIntegrations.has(nangoId.toLowerCase());
      return {
        ...provider,
        configured: isConfigured
      };
    });
    
    // Cache results for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(configuredProviders));
    
    console.log(`[NangoService] Configured providers: ${configuredProviders.filter(p => p.configured).map(p => p.id).join(', ') || 'none'}`);
    
    return configuredProviders;
  }
  
  /**
   * Get only providers that are actually configured in Nango
   */
  async getActiveProviders(): Promise<OAuthProvider[]> {
    const allProviders = await this.getConfiguredProviders();
    return allProviders.filter(p => p.configured).map(({ configured, ...provider }) => provider);
  }
  
  /**
   * Initiate OAuth flow for a user
   */
  async initiateOAuthFlow(
    privyUserId: string,
    userId: string,
    provider: string
  ): Promise<{ authUrl: string; state: string; connectionId: string }> {
    // Validate provider
    const supportedProvider = SUPPORTED_PROVIDERS.find(p => p.id === provider);
    if (!supportedProvider) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    
    // Generate state token for CSRF protection
    const state = crypto.randomUUID();
    
    // Connection ID format: {privyUserId}-{provider}-{uuid}
    // We need multiple accounts per provider per user.
    const connectionId = `${privyUserId}-${provider}-${crypto.randomUUID()}`;
    
    // Construct the Nango OAuth connect URL manually.
    // IMPORTANT: If you include a custom `state` param here, Nango will NOT persist it
    // through its OAuth callback flow (Nango uses its own internal state).
    //
    // That means our offchain `/api/oauth/callback` handler will never receive the
    // state we generate here, unless we own the callback URL.
    //
    // Current architecture:
    // - Browser goes to: {NANGO_PUBLIC_URL}/oauth/connect/{integrationId}
    // - Provider redirects to: {NANGO_PUBLIC_URL}/oauth/callback
    // - Nango completes OAuth and stores credentials in nango._nango_connections
    //
    // Therefore: we MUST NOT rely on our own state for callback unless we change the flow.
    const params = new URLSearchParams({
      connection_id: connectionId,
      public_key: this.nangoPublicKey,
    });
    
    // Do NOT append custom state here.
    // (If we want offchain-owned state, we must implement an offchain callback or a Nango webhook.)
    
    // Nango OAuth connect URL format: ${NANGO_PUBLIC_URL}/oauth/connect/${integrationId}
    // Use the public URL for browser redirects (not the internal API URL)
    // Map provider to Nango integration ID (e.g., 'twitter' -> 'twitter-v2')
    const nangoIntegrationId = PROVIDER_TO_NANGO_MAP[provider] || provider;
    const authUrl = `${this.nangoPublicUrl}/oauth/connect/${nangoIntegrationId}?${params.toString()}`;
    
    // Store state temporarily (10 min expiry - increased from 5 min for slower users)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.supabase
      .from('oauth_states')
      .insert({
        state,
        privy_user_id: privyUserId,
        user_id: userId,
        provider,
        expires_at: expiresAt.toISOString()
      });
    
    return { authUrl, state, connectionId };
  }
  
  /**
   * Sync a connection from Nango into our `user_oauth_connections` table.
   *
   * Use this after Nango has successfully created the connection (i.e. after the user completes
   * the Nango-hosted OAuth flow). This avoids relying on an offchain callback/state.
   */
  async syncConnectionFromNango(
    privyUserId: string,
    userId: string,
    provider: string,
    connectionId: string
  ): Promise<{ success: boolean; provider: string; privyUserId: string; profile?: NormalizedProfile; connectionId: string }> {
    const supportedProvider = SUPPORTED_PROVIDERS.find(p => p.id === provider);
    if (!supportedProvider) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const nangoIntegrationId = PROVIDER_TO_NANGO_MAP[provider] || provider;

    console.log('[NangoService] Syncing connection from Nango...', {
      privyUserId,
      provider,
      nangoIntegrationId,
      connectionId
    });

    // Fetch connection from Nango (Nango refreshes tokens automatically)
    const connection = await this.nango.getConnection(nangoIntegrationId, connectionId);
    if (!connection) {
      throw new Error(`No Nango connection found for ${provider}`);
    }

    const creds = connection.credentials as any;

    // Attempt to fetch provider profile right after OAuth sync.
    // Prefer Nango Proxy (more reliable than reading tokens directly), then fall back to direct fetch.
    let normalizedProfile: NormalizedProfile | null = null;

    // 1) Prefer proxy-based profile fetch
    try {
      const proxyCfg = PROVIDER_PROFILE_ENDPOINTS[provider];
      if (proxyCfg) {
        const proxyResp = await (this.nango as any).proxy({
          integrationId: nangoIntegrationId,
          connectionId,
          method: proxyCfg.method,
          endpoint: proxyCfg.endpoint
        });
        normalizedProfile = proxyCfg.normalize(proxyResp);
      }
    } catch (e: any) {
      console.warn('[NangoService] Proxy profile fetch failed (will try fallback):', e?.message || e);
    }

    // 2) Fallback to direct token-based profile fetch
    try {
      if (!normalizedProfile) {
        const accessToken = creds?.access_token;
        if (accessToken) {
          const rawProfile = await fetchProviderProfile(provider, accessToken);
          normalizedProfile = normalizeProfile(rawProfile);
        } else {
          console.warn('[NangoService] No access_token available in connection credentials; skipping fallback profile fetch');
        }
      }
    } catch (e: any) {
      // Do not fail sync if profile endpoint fails
      console.warn('[NangoService] Fallback profile fetch failed (continuing without profile):', e?.message || e);
    }

    // Store connection metadata (plus profile fields if available) in our database
    const { error: insertError } = await this.supabase
      .from('user_oauth_connections')
      .upsert({
        privy_user_id: privyUserId,
        user_id: userId,
        provider,
        // Nango connection_id is the compound ID, but the SDK also provides connection.id
        nango_connection_id: connection.connection_id || connection.id?.toString() || connectionId,
        nango_integration_id: nangoIntegrationId,
        provider_account_id: connection.metadata?.accountId,
        provider_account_name: connection.metadata?.accountName || connection.metadata?.username || normalizedProfile?.displayName || normalizedProfile?.username,
        provider_account_email: connection.metadata?.email || normalizedProfile?.email,
        provider_username: normalizedProfile?.username,
        provider_display_name: normalizedProfile?.displayName,
        provider_avatar_url: normalizedProfile?.avatarUrl,
        scopes: connection.metadata?.scopes || [],
        expires_at: creds?.expires_at ? new Date(creds.expires_at).toISOString() : null,
        revoked_at: null
      }, {
        onConflict: 'privy_user_id,provider,nango_connection_id'
      });

    if (insertError) {
      console.error('[NangoService] Error syncing connection into database:', insertError);
      throw new Error(`Failed to store connection: ${insertError.message}`);
    }

    // Clear token cache (force refresh next time)
    await this.redis.del(`token:${privyUserId}:${provider}`);

    console.log('[OAuth Sync API] ✅ Sync successful', {
      provider,
      connectionId,
      profile: normalizedProfile
        ? {
            username: normalizedProfile.username,
            displayName: normalizedProfile.displayName,
            avatarUrl: normalizedProfile.avatarUrl
          }
        : null
    });

    return {
      success: true,
      provider,
      privyUserId,
      connectionId,
      profile: normalizedProfile || undefined
    };
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; provider: string; privyUserId: string }> {
    console.log('[NangoService] Handling OAuth callback', { code: code?.substring(0, 10) + '...', state });
    
    // Verify state
    const { data: stateData, error: stateError } = await this.supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (stateError || !stateData) {
      console.error('[NangoService] State validation failed:', stateError);
      throw new Error('Invalid or expired state token');
    }
    
    console.log('[NangoService] State validated:', { 
      privyUserId: stateData.privy_user_id, 
      provider: stateData.provider 
    });
    
    const connectionId = `${stateData.privy_user_id}-${stateData.provider}`;
    
    // Map provider to Nango integration ID (e.g., 'twitter' -> 'twitter-v2')
    const nangoIntegrationId = PROVIDER_TO_NANGO_MAP[stateData.provider] || stateData.provider;
    
    console.log('[NangoService] Waiting for Nango to process OAuth callback...');
    
    // Wait longer for Nango to process (increased from 2s to 5s)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Retry logic for getConnection (Nango might need more time)
    let connection;
    let retries = 3;
    
    console.log('[NangoService] Fetching connection from Nango with retry logic...');
    
    while (retries > 0) {
      try {
        connection = await this.nango.getConnection(
          nangoIntegrationId,  // Use mapped integration ID
          connectionId
        );
        console.log('[NangoService] Successfully retrieved connection from Nango');
        break;
      } catch (error) {
        retries--;
        console.warn(`[NangoService] Failed to get connection (${retries} retries left):`, error);
        
        if (retries === 0) {
          console.error('[NangoService] All retries exhausted');
          throw new Error(`Failed to retrieve connection after multiple attempts: ${error}`);
        }
        
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!connection) {
      throw new Error('Failed to establish OAuth connection');
    }
    
    console.log('[NangoService] Storing connection metadata in database...');
    
    // Store connection metadata in our database (upsert on conflict)
    const creds = connection.credentials as any;
    const { error: insertError } = await this.supabase
      .from('user_oauth_connections')
      .upsert({
        privy_user_id: stateData.privy_user_id,
        user_id: stateData.user_id,
        provider: stateData.provider,
        nango_connection_id: connection.id?.toString() || connectionId,
        nango_integration_id: nangoIntegrationId,  // Use mapped integration ID
        provider_account_id: connection.metadata?.accountId,
        provider_account_name: connection.metadata?.accountName || connection.metadata?.username,
        provider_account_email: connection.metadata?.email,
        scopes: connection.metadata?.scopes || [],
        expires_at: creds?.expires_at ? new Date(creds.expires_at).toISOString() : null
      }, {
        onConflict: 'privy_user_id,provider'
      });
    
    if (insertError) {
      console.error('[NangoService] Error storing connection in database:', insertError);
      throw new Error(`Failed to store connection: ${insertError.message}`);
    }
    
    console.log('[NangoService] Connection successfully stored in database');
    
    // Cleanup state
    await this.supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);
    
    // Clear cache
    await this.redis.del(`token:${stateData.privy_user_id}:${stateData.provider}`);
    
    return { 
      success: true, 
      provider: stateData.provider,
      privyUserId: stateData.privy_user_id
    };
  }
  
  /**
   * Get OAuth access token for n8n workflow
   */
  async getAccessToken(
    privyUserId: string,
    provider: string,
    connectionId?: string
  ): Promise<{ token: string; expiresAt: Date | null; metadata?: any }> {
    // Check cache first
    const cacheKey = `token:${privyUserId}:${provider}:${connectionId || 'default'}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Check if connection exists in our database
    let query = this.supabase
      .from('user_oauth_connections')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider)
      .is('revoked_at', null);

    if (connectionId) {
      query = query.eq('nango_connection_id', connectionId);
    } else {
      // Backward compatibility: if not provided, return the most recently used connection.
      query = query.order('last_used_at', { ascending: false, nullsFirst: false })
                 .order('created_at', { ascending: false });
    }

    const { data: connection, error } = connectionId
      ? await query.single()
      : await query.limit(1).maybeSingle();
    
    if (error || !connection) {
      throw new Error(`No ${provider} connection found for user`);
    }
    
    // Get fresh token from Nango (handles refresh automatically)
    const nangoConnectionId = connection.nango_connection_id;
    const nangoConnection = await this.nango.getConnection(
      connection.nango_integration_id,
      nangoConnectionId
    );
    
    if (!nangoConnection || !nangoConnection.credentials) {
      throw new Error('Unable to retrieve access token');
    }
    
    // Update last used
    await this.supabase
      .from('user_oauth_connections')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', connection.id);
    
    // Use type assertion for credential access
    const creds = nangoConnection.credentials as any;
    const result = {
      token: creds.access_token,
      expiresAt: creds.expires_at ? new Date(creds.expires_at) : null,
      metadata: {
        refreshToken: creds.refresh_token,
        tokenType: creds.token_type || 'Bearer',
        scopes: creds.scopes || connection.scopes
      }
    };
    
    // Cache for 50 minutes (tokens usually valid for 1 hour)
    const ttl = result.expiresAt 
      ? Math.max(60, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000) - 600)
      : 3000; // 50 minutes default
    
    await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
    
    return result;
  }
  
  /**
   * Make proxied API call through Nango
   */
  async proxyApiCall(
    privyUserId: string,
    provider: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    data?: any,
    n8nWorkflowId?: string,
    n8nExecutionId?: string,
    connectionId?: string
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check rate limit
      const rateLimit = await this.checkRateLimit(privyUserId, provider);
      if (!rateLimit.allowed) {
        throw new Error(`Rate limit exceeded. Resets at ${rateLimit.resetAt?.toISOString()}`);
      }
      
      // Get connection
      let query = this.supabase
        .from('user_oauth_connections')
        .select('*')
        .eq('privy_user_id', privyUserId)
        .eq('provider', provider)
        .is('revoked_at', null);

      if (connectionId) {
        query = query.eq('nango_connection_id', connectionId);
      } else {
        query = query.order('last_used_at', { ascending: false, nullsFirst: false })
                     .order('created_at', { ascending: false });
      }

      const { data: connection, error } = connectionId
        ? await query.single()
        : await query.limit(1).maybeSingle();
      
      if (error || !connection) {
        throw new Error(`No ${provider} connection found`);
      }
      
      const nangoConnectionId = connection.nango_connection_id;
      
      // Make request through Nango proxy (use type assertion for SDK compatibility)
      const response = await (this.nango as any).proxy({
        integrationId: connection.nango_integration_id,
        connectionId: nangoConnectionId,
        method,
        endpoint,
        data
      });
      
      // Log successful usage
      await this.logUsage({
        connectionId: connection.id,
        privyUserId,
        provider,
        n8nWorkflowId,
        n8nExecutionId,
        endpoint,
        method,
        statusCode: 200,
        success: true,
        responseTimeMs: Date.now() - startTime
      });
      
      return response.data;
      
    } catch (error: any) {
      // Log error
      await this.logUsage({
        connectionId: null,
        privyUserId,
        provider,
        n8nWorkflowId,
        n8nExecutionId,
        endpoint,
        method,
        statusCode: error.statusCode || 500,
        success: false,
        errorMessage: error.message,
        responseTimeMs: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Check rate limit for user/provider combination
   */
  async checkRateLimit(
    privyUserId: string,
    provider: string
  ): Promise<{ allowed: boolean; remaining?: number; resetAt?: Date }> {
    const config = RATE_LIMITS[provider] || { window: 3600000, maxRequests: 100 };
    const windowStart = new Date(Math.floor(Date.now() / config.window) * config.window);
    
    // Query recent API calls
    const { count, error } = await this.supabase
      .from('oauth_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider)
      .eq('rate_limit_window', windowStart.toISOString());
    
    if (error) {
      console.error('Rate limit check failed:', error);
      return { allowed: true }; // Fail open
    }
    
    const requestCount = count || 0;
    const remaining = Math.max(0, config.maxRequests - requestCount);
    const resetAt = new Date(windowStart.getTime() + config.window);
    
    return {
      allowed: requestCount < config.maxRequests,
      remaining,
      resetAt
    };
  }
  
  /**
   * Revoke OAuth connection
   */
  async revokeConnection(
    privyUserId: string,
    provider: string,
    connectionId?: string
  ): Promise<void> {
    let query = this.supabase
      .from('user_oauth_connections')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider);

    if (connectionId) {
      query = query.eq('nango_connection_id', connectionId);
    } else {
      query = query.order('last_used_at', { ascending: false, nullsFirst: false })
                   .order('created_at', { ascending: false });
    }

    const { data: connection } = connectionId
      ? await query.single()
      : await query.limit(1).maybeSingle();
    
    if (!connection) {
      return; // Already gone
    }
    
    try {
      // Delete from Nango
      const nangoConnectionId = connection.nango_connection_id;
      await this.nango.deleteConnection(
        connection.nango_integration_id,
        nangoConnectionId
      );
    } catch (error) {
      console.error('Error deleting Nango connection:', error);
    }
    
    // Mark as revoked in our database
    await this.supabase
      .from('user_oauth_connections')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', connection.id);
    
    // Clear cache
    await this.redis.del(`token:${privyUserId}:${provider}`);
    await this.redis.del(`token:${privyUserId}:${provider}:${connectionId || 'default'}`);
  }
  
  /**
   * List user's active connections
   */
  async listConnections(privyUserId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('user_oauth_connections')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    
    if (error) {
      console.error('Error listing connections:', error);
      return [];
    }
    
    return (data || []).map(conn => ({
      id: conn.id,
      nangoConnectionId: conn.nango_connection_id,
      provider: conn.provider,
      providerAccountName: conn.provider_account_name,
      providerAccountEmail: conn.provider_account_email,
      providerUsername: conn.provider_username,
      providerDisplayName: conn.provider_display_name,
      providerAvatarUrl: conn.provider_avatar_url,
      scopes: conn.scopes,
      createdAt: conn.created_at,
      lastUsedAt: conn.last_used_at,
      expiresAt: conn.expires_at
    }));
  }
  
  /**
   * Get connection statistics
   */
  async getConnectionStats(privyUserId: string, provider: string): Promise<any> {
    // Get usage in last 24 hours
    const { data: recentUsage } = await this.supabase
      .from('oauth_usage_log')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    const totalCalls = recentUsage?.length || 0;
    const successfulCalls = recentUsage?.filter(u => u.success).length || 0;
    const failedCalls = totalCalls - successfulCalls;
    const avgResponseTime = recentUsage && recentUsage.length > 0
      ? recentUsage.reduce((sum, u) => sum + (u.response_time_ms || 0), 0) / recentUsage.length
      : 0;
    
    // Get rate limit status
    const rateLimit = await this.checkRateLimit(privyUserId, provider);
    
    return {
      last24Hours: {
        totalCalls,
        successfulCalls,
        failedCalls,
        avgResponseTime: Math.round(avgResponseTime)
      },
      rateLimit: {
        allowed: rateLimit.allowed,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt
      }
    };
  }
  
  /**
   * Log OAuth API usage
   */
  private async logUsage(details: {
    connectionId: string | null;
    privyUserId: string;
    provider: string;
    n8nWorkflowId?: string;
    n8nExecutionId?: string;
    endpoint: string;
    method: string;
    statusCode: number;
    success: boolean;
    errorMessage?: string;
    responseTimeMs: number;
  }): Promise<void> {
    const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000); // Hourly window
    
    await this.supabase
      .from('oauth_usage_log')
      .insert({
        connection_id: details.connectionId,
        privy_user_id: details.privyUserId,
        provider: details.provider,
        n8n_workflow_id: details.n8nWorkflowId,
        n8n_execution_id: details.n8nExecutionId,
        endpoint_called: details.endpoint,
        api_method: details.method,
        status_code: details.statusCode,
        success: details.success,
        error_message: details.errorMessage,
        response_time_ms: details.responseTimeMs,
        rate_limit_window: windowStart.toISOString()
      });
  }
  
  /**
   * Check for anomalies in OAuth usage
   */
  async checkAnomalies(): Promise<any> {
    // High frequency users
    const { data: highFreq } = await this.supabase
      .rpc('get_high_frequency_oauth_users', { 
        p_threshold: 100,
        p_window_minutes: 60 
      });
    
    // Failed requests
    const { data: failures } = await this.supabase
      .from('oauth_usage_log')
      .select('*')
      .eq('success', false)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .limit(100);
    
    return {
      highFrequencyUsers: highFreq || [],
      recentFailures: failures || [],
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Cleanup expired OAuth states (run periodically)
   */
  async cleanupExpiredStates(): Promise<number> {
    const { data, error } = await this.supabase
      .from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();
    
    if (error) {
      console.error('Error cleaning up expired states:', error);
      return 0;
    }
    
    return data?.length || 0;
  }
}
