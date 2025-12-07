import { Nango } from '@nangohq/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import Redis from 'ioredis';

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

export const SUPPORTED_PROVIDERS: OAuthProvider[] = [
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: '/icons/twitter.svg',
    requiredScopes: ['tweet.read', 'tweet.write', 'users.read'],
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
  private nangoSecretKey: string;
  
  constructor() {
    this.nangoSecretKey = process.env.NANGO_SECRET_KEY!;
    this.nangoHost = process.env.NANGO_API_URL || 'http://localhost:3003';
    
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
    let configuredIntegrations: Set<string> = new Set();
    
    try {
      // Query the Nango database directly for PROD environment integrations
      // Environment ID 1 = prod, Environment ID 2 = dev
      // Using pg for direct query since supabase client doesn't expose nango schema
      const { Pool } = require('pg');
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
    const configuredProviders = SUPPORTED_PROVIDERS.map(provider => ({
      ...provider,
      configured: configuredIntegrations.has(provider.id.toLowerCase())
    }));
    
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
  ): Promise<{ authUrl: string; state: string }> {
    // Validate provider
    const supportedProvider = SUPPORTED_PROVIDERS.find(p => p.id === provider);
    if (!supportedProvider) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    
    // Generate state token for CSRF protection
    const state = crypto.randomUUID();
    
    // Connection ID format: {privyUserId}-{provider}
    const connectionId = `${privyUserId}-${provider}`;
    
    // Get Nango auth URL (use type assertion for SDK compatibility)
    const authUrl = (this.nango as any).getAuthorizationUrl({
      integrationId: provider,
      connectionId,
      state
    });
    
    // Store state temporarily (5 min expiry)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.supabase
      .from('oauth_states')
      .insert({
        state,
        privy_user_id: privyUserId,
        user_id: userId,
        provider,
        expires_at: expiresAt.toISOString()
      });
    
    return { authUrl, state };
  }
  
  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; provider: string; privyUserId: string }> {
    // Verify state
    const { data: stateData, error: stateError } = await this.supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (stateError || !stateData) {
      throw new Error('Invalid or expired state token');
    }
    
    const connectionId = `${stateData.privy_user_id}-${stateData.provider}`;
    
    // Exchange code for tokens (Nango handles this automatically)
    // We just need to verify the connection was created
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for Nango to process
    
    const connection = await this.nango.getConnection(
      stateData.provider,
      connectionId
    );
    
    if (!connection) {
      throw new Error('Failed to establish OAuth connection');
    }
    
    // Store connection metadata in our database (upsert on conflict)
    const creds = connection.credentials as any;
    const { error: insertError } = await this.supabase
      .from('user_oauth_connections')
      .upsert({
        privy_user_id: stateData.privy_user_id,
        user_id: stateData.user_id,
        provider: stateData.provider,
        nango_connection_id: connection.id?.toString() || connectionId,
        nango_integration_id: stateData.provider,
        provider_account_id: connection.metadata?.accountId,
        provider_account_name: connection.metadata?.accountName || connection.metadata?.username,
        provider_account_email: connection.metadata?.email,
        scopes: connection.metadata?.scopes || [],
        expires_at: creds?.expires_at ? new Date(creds.expires_at).toISOString() : null
      }, {
        onConflict: 'privy_user_id,provider'
      });
    
    if (insertError) {
      console.error('Error storing connection:', insertError);
    }
    
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
    provider: string
  ): Promise<{ token: string; expiresAt: Date | null; metadata?: any }> {
    // Check cache first
    const cacheKey = `token:${privyUserId}:${provider}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Check if connection exists in our database
    const { data: connection, error } = await this.supabase
      .from('user_oauth_connections')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider)
      .is('revoked_at', null)
      .single();
    
    if (error || !connection) {
      throw new Error(`No ${provider} connection found for user`);
    }
    
    // Get fresh token from Nango (handles refresh automatically)
    const connectionId = `${privyUserId}-${provider}`;
    const nangoConnection = await this.nango.getConnection(
      connection.nango_integration_id,
      connectionId
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
    n8nExecutionId?: string
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check rate limit
      const rateLimit = await this.checkRateLimit(privyUserId, provider);
      if (!rateLimit.allowed) {
        throw new Error(`Rate limit exceeded. Resets at ${rateLimit.resetAt?.toISOString()}`);
      }
      
      // Get connection
      const { data: connection, error } = await this.supabase
        .from('user_oauth_connections')
        .select('*')
        .eq('privy_user_id', privyUserId)
        .eq('provider', provider)
        .is('revoked_at', null)
        .single();
      
      if (error || !connection) {
        throw new Error(`No ${provider} connection found`);
      }
      
      const connectionId = `${privyUserId}-${provider}`;
      
      // Make request through Nango proxy (use type assertion for SDK compatibility)
      const response = await (this.nango as any).proxy({
        integrationId: connection.nango_integration_id,
        connectionId,
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
    provider: string
  ): Promise<void> {
    const { data: connection } = await this.supabase
      .from('user_oauth_connections')
      .select('*')
      .eq('privy_user_id', privyUserId)
      .eq('provider', provider)
      .single();
    
    if (!connection) {
      return; // Already gone
    }
    
    try {
      // Delete from Nango
      const connectionId = `${privyUserId}-${provider}`;
      await this.nango.deleteConnection(
        connection.nango_integration_id,
        connectionId
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
      provider: conn.provider,
      providerAccountName: conn.provider_account_name,
      providerAccountEmail: conn.provider_account_email,
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
