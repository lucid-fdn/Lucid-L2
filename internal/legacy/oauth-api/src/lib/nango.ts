/**
 * Nango Client Wrapper
 * 
 * Provides a typed wrapper around the Nango SDK with error handling and logging
 */

import Nango from '@nangohq/node';
import { getProvider, validateProvider } from '../types/providers';

// Initialize Nango client
const nangoConfig = {
  host: process.env.NANGO_SERVER_URL || 'http://localhost:3003',
  secretKey: process.env.NANGO_SECRET_KEY || '',
};

if (!nangoConfig.secretKey) {
  throw new Error('NANGO_SECRET_KEY environment variable is required');
}

export const nango = new Nango(nangoConfig);

/**
 * Get authorization URL for OAuth flow
 */
export async function getAuthorizationURL(
  providerKey: string,
  userId: string,
  redirectUri?: string
): Promise<{ url: string; error?: string }> {
  try {
    const validation = validateProvider(providerKey);
    if (!validation.valid || !validation.provider) {
      return {
        url: '',
        error: validation.error || 'Invalid provider'
      };
    }

    const provider = validation.provider;
    
    if (provider.type !== 'oauth') {
      return {
        url: '',
        error: `Provider '${providerKey}' does not support OAuth`
      };
    }

    const authUrl = await nango.auth.getAuthorizationURL({
      integrationId: provider.integrationId,
      connectionId: userId,
      redirectUri: redirectUri || `${process.env.FRONTEND_APP_URL}/oauth/callback`,
      scopes: provider.scopes
    });

    console.log(`[Nango] Authorization URL generated for ${providerKey}:`, authUrl);

    return { url: authUrl };
  } catch (error) {
    console.error(`[Nango] Error generating authorization URL:`, error);
    return {
      url: '',
      error: error instanceof Error ? error.message : 'Failed to generate authorization URL'
    };
  }
}

/**
 * Get connection details from Nango
 */
export async function getConnection(providerKey: string, connectionId: string) {
  try {
    const validation = validateProvider(providerKey);
    if (!validation.valid || !validation.provider) {
      throw new Error(validation.error || 'Invalid provider');
    }

    const connection = await nango.getConnection(
      validation.provider.integrationId,
      connectionId
    );

    console.log(`[Nango] Connection retrieved for ${providerKey}:`, {
      connectionId,
      hasCredentials: !!connection.credentials
    });

    return connection;
  } catch (error) {
    console.error(`[Nango] Error getting connection:`, error);
    throw error;
  }
}

/**
 * Get access token for a connection (automatically refreshed by Nango)
 */
export async function getToken(
  providerKey: string,
  connectionId: string
): Promise<{ accessToken: string; expiresAt?: string; error?: string }> {
  try {
    const validation = validateProvider(providerKey);
    if (!validation.valid || !validation.provider) {
      return {
        accessToken: '',
        error: validation.error || 'Invalid provider'
      };
    }

    const connection = await nango.getConnection(
      validation.provider.integrationId,
      connectionId
    );

    if (!connection.credentials?.access_token) {
      return {
        accessToken: '',
        error: 'No access token found in connection'
      };
    }

    console.log(`[Nango] Token retrieved for ${providerKey}:`, {
      connectionId,
      expiresAt: connection.credentials.expires_at
    });

    return {
      accessToken: connection.credentials.access_token,
      expiresAt: connection.credentials.expires_at
    };
  } catch (error) {
    console.error(`[Nango] Error getting token:`, error);
    return {
      accessToken: '',
      error: error instanceof Error ? error.message : 'Failed to get token'
    };
  }
}

/**
 * Delete a connection (revoke OAuth)
 */
export async function deleteConnection(providerKey: string, connectionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = validateProvider(providerKey);
    if (!validation.valid || !validation.provider) {
      return {
        success: false,
        error: validation.error || 'Invalid provider'
      };
    }

    await nango.deleteConnection(
      validation.provider.integrationId,
      connectionId
    );

    console.log(`[Nango] Connection deleted for ${providerKey}:`, connectionId);

    return { success: true };
  } catch (error) {
    console.error(`[Nango] Error deleting connection:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete connection'
    };
  }
}

/**
 * List all connections for a user
 */
export async function listConnections(userId: string) {
  try {
    // Note: Nango doesn't have a direct "list by user" method
    // We need to query our own database for this
    console.warn('[Nango] listConnections should query Supabase instead');
    return [];
  } catch (error) {
    console.error(`[Nango] Error listing connections:`, error);
    throw error;
  }
}

/**
 * Test connection validity
 */
export async function testConnection(
  providerKey: string,
  connectionId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tokenResult = await getToken(providerKey, connectionId);
    
    if (tokenResult.error || !tokenResult.accessToken) {
      return {
        valid: false,
        error: tokenResult.error || 'No access token'
      };
    }

    // Token exists and is valid (Nango handles refresh automatically)
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Connection test failed'
    };
  }
}

/**
 * Get connection metadata
 */
export async function getConnectionMetadata(
  providerKey: string,
  connectionId: string
): Promise<Record<string, any> | null> {
  try {
    const connection = await getConnection(providerKey, connectionId);
    
    return {
      providerConfigKey: connection.provider_config_key,
      connectionId: connection.connection_id,
      createdAt: connection.created_at,
      credentials: {
        type: connection.credentials?.type,
        expiresAt: connection.credentials?.expires_at
      },
      connectionConfig: connection.connection_config
    };
  } catch (error) {
    console.error(`[Nango] Error getting connection metadata:`, error);
    return null;
  }
}

export default {
  getAuthorizationURL,
  getConnection,
  getToken,
  deleteConnection,
  listConnections,
  testConnection,
  getConnectionMetadata
};
