/**
 * Supabase Client Wrapper
 * 
 * Provides typed database access for credential management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Credential, CredentialUsage } from '../types/providers';

// Database types
export interface Database {
  public: {
    Tables: {
      credentials: {
        Row: {
          id: string;
          user_id: string;
          service: string;
          name: string;
          auth_type: 'oauth' | 'api_key' | 'manual';
          nango_connection_id: string | null;
          metadata: Record<string, any> | null;
          encrypted_data: string | null;
          is_active: boolean;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['credentials']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['credentials']['Insert']>;
      };
      credential_usage: {
        Row: {
          id: string;
          credential_id: string;
          workflow_id: string | null;
          workflow_name: string | null;
          execution_id: string | null;
          success: boolean;
          error_message: string | null;
          used_at: string;
          metadata: Record<string, any> | null;
        };
        Insert: Omit<Database['public']['Tables']['credential_usage']['Row'], 'id' | 'used_at'>;
        Update: Partial<Database['public']['Tables']['credential_usage']['Insert']>;
      };
      oauth_providers: {
        Row: {
          id: string;
          provider_key: string;
          provider_name: string;
          integration_id: string;
          auth_type: string;
          default_scopes: string[] | null;
          icon_url: string | null;
          description: string | null;
          is_enabled: boolean;
          metadata: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_PUBLIC_URL || 'http://localhost:8000';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY environment variable is required');
}

export const supabase: SupabaseClient<Database> = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

/**
 * Create a new credential
 */
export async function createCredential(data: {
  userId: string;
  service: string;
  name: string;
  authType: 'oauth' | 'api_key' | 'manual';
  nangoConnectionId?: string;
  metadata?: Record<string, any>;
  encryptedData?: string;
}): Promise<{ data: Credential | null; error: string | null }> {
  try {
    const { data: credential, error } = await supabase
      .from('credentials')
      .insert({
        user_id: data.userId,
        service: data.service,
        name: data.name,
        auth_type: data.authType,
        nango_connection_id: data.nangoConnectionId || null,
        metadata: data.metadata || null,
        encrypted_data: data.encryptedData || null,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error creating credential:', error);
      return { data: null, error: error.message };
    }

    console.log('[Supabase] Credential created:', credential.id);

    return {
      data: mapCredential(credential),
      error: null
    };
  } catch (error) {
    console.error('[Supabase] Unexpected error creating credential:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to create credential'
    };
  }
}

/**
 * Get credential by ID
 */
export async function getCredential(
  credentialId: string,
  userId: string
): Promise<{ data: Credential | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: mapCredential(data), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get credential'
    };
  }
}

/**
 * List user's credentials
 */
export async function listCredentials(
  userId: string,
  filters?: { service?: string; authType?: string }
): Promise<{ data: Credential[]; error: string | null }> {
  try {
    let query = supabase
      .from('credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (filters?.service) {
      query = query.eq('service', filters.service);
    }

    if (filters?.authType) {
      query = query.eq('auth_type', filters.authType);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return {
      data: data.map(mapCredential),
      error: null
    };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : 'Failed to list credentials'
    };
  }
}

/**
 * Update credential
 */
export async function updateCredential(
  credentialId: string,
  userId: string,
  updates: {
    name?: string;
    metadata?: Record<string, any>;
    isActive?: boolean;
  }
): Promise<{ data: Credential | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('credentials')
      .update({
        name: updates.name,
        metadata: updates.metadata,
        is_active: updates.isActive
      })
      .eq('id', credentialId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: mapCredential(data), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to update credential'
    };
  }
}

/**
 * Delete credential (soft delete - marks as inactive)
 */
export async function deleteCredential(
  credentialId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('credentials')
      .update({ is_active: false })
      .eq('id', credentialId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete credential'
    };
  }
}

/**
 * Record credential usage
 */
export async function recordCredentialUsage(data: {
  credentialId: string;
  workflowId?: string;
  workflowName?: string;
  executionId?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('credential_usage')
      .insert({
        credential_id: data.credentialId,
        workflow_id: data.workflowId || null,
        workflow_name: data.workflowName || null,
        execution_id: data.executionId || null,
        success: data.success,
        error_message: data.errorMessage || null,
        metadata: data.metadata || null
      });

    if (error) {
      console.error('[Supabase] Error recording usage:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record usage'
    };
  }
}

/**
 * Get credential usage history
 */
export async function getCredentialUsage(
  credentialId: string,
  userId: string,
  limit: number = 50
): Promise<{ data: CredentialUsage[]; error: string | null }> {
  try {
    // First verify the credential belongs to the user
    const { data: credential } = await getCredential(credentialId, userId);
    if (!credential) {
      return { data: [], error: 'Credential not found' };
    }

    const { data, error } = await supabase
      .from('credential_usage')
      .select('*')
      .eq('credential_id', credentialId)
      .order('used_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return {
      data: data.map(mapCredentialUsage),
      error: null
    };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : 'Failed to get usage history'
    };
  }
}

/**
 * Get OAuth providers from database
 */
export async function getOAuthProviders() {
  try {
    const { data, error } = await supabase
      .from('oauth_providers')
      .select('*')
      .eq('is_enabled', true)
      .order('provider_name');

    if (error) {
      return { data: [], error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : 'Failed to get providers'
    };
  }
}

// Helper functions to map database rows to TypeScript types

function mapCredential(row: Database['public']['Tables']['credentials']['Row']): Credential {
  return {
    id: row.id,
    userId: row.user_id,
    service: row.service,
    name: row.name,
    authType: row.auth_type,
    nangoConnectionId: row.nango_connection_id || undefined,
    metadata: row.metadata || undefined,
    encryptedData: row.encrypted_data || undefined,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapCredentialUsage(row: Database['public']['Tables']['credential_usage']['Row']): CredentialUsage {
  return {
    id: row.id,
    credentialId: row.credential_id,
    workflowId: row.workflow_id || undefined,
    workflowName: row.workflow_name || undefined,
    executionId: row.execution_id || undefined,
    success: row.success,
    errorMessage: row.error_message || undefined,
    usedAt: new Date(row.used_at),
    metadata: row.metadata || undefined
  };
}

export default {
  createCredential,
  getCredential,
  listCredentials,
  updateCredential,
  deleteCredential,
  recordCredentialUsage,
  getCredentialUsage,
  getOAuthProviders
};
