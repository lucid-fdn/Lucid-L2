/**
 * Session Service - Unified User Resolution
 * 
 * This service resolves Privy user IDs to internal user IDs (profiles.id)
 * using the serverless app team's schema: profiles + identity_links
 * 
 * Now uses the shared database pool from lib/db/pool.ts to prevent
 * connection pool exhaustion across services.
 * 
 * FLOW:
 * 1. Check if Privy ID exists in identity_links
 * 2. If exists: Return the linked profiles.id
 * 3. If NOT exists: Create new profile + identity_link atomically (JIT provisioning)
 * 
 * This ensures both extension and web app use the SAME user records.
 */

import crypto from 'crypto';
import pool, { getClient } from '../../../../engine/src/db/pool';
import { logger } from '../../../../engine/src/lib/logger';

// Types
export interface UserProfile {
  id: string;
  handle: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface IdentityLink {
  id: string;
  user_id: string;
  provider: string;
  external_id: string;
  created_at: Date;
}

export interface ResolvedUser {
  userId: string;
  profile: UserProfile;
  isNewUser: boolean;
}

/**
 * Generate a unique handle for new users
 * Format: lucid_<random_suffix>
 */
function generateHandle(): string {
  const suffix = Math.random().toString(36).substring(2, 10);
  return `lucid_${suffix}`;
}

/**
 * Resolve a Privy user ID to an internal user ID (profiles.id)
 * 
 * This is the core function that implements JIT user provisioning:
 * - If the Privy ID already exists in identity_links, return the linked user_id
 * - If NOT, create a new profile + identity_link atomically
 * 
 * @param privyUserId - The Privy user ID (from JWT claims)
 * @param email - Optional email from Privy (used for new user creation)
 * @param avatarUrl - Optional avatar URL from Privy
 * @returns The internal user ID (profiles.id)
 */
export async function resolveInternalUserId(
  privyUserId: string,
  email?: string | null,
  avatarUrl?: string | null
): Promise<ResolvedUser> {
  const client = await getClient();
  
  try {
    // STEP 1: Check if Privy ID exists in identity_links
    const linkResult = await client.query(
      `SELECT il.user_id, p.*
       FROM identity_links il
       JOIN profiles p ON p.id = il.user_id
       WHERE il.provider = 'privy' AND il.external_id = $1`,
      [privyUserId]
    );

    // STEP 2: If found, return existing user
    if (linkResult.rows.length > 0) {
      const row = linkResult.rows[0];
      logger.info('✅ Existing user found for Privy ID:', privyUserId, '→', row.user_id);
      
      // Update last_login_at
      await client.query(
        'UPDATE profiles SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
        [row.user_id]
      );
      
      return {
        userId: row.user_id,
        profile: {
          id: row.user_id,
          handle: row.handle,
          email: row.email,
          name: row.name,
          avatar_url: row.avatar_url,
          bio: row.bio,
          created_at: row.created_at,
          updated_at: row.updated_at
        },
        isNewUser: false
      };
    }

    // STEP 3: If NOT found, create new user atomically
    logger.info('🆕 Creating new user for Privy ID:', privyUserId);
    
    await client.query('BEGIN');
    
    try {
      const userId = crypto.randomUUID();
      const handle = generateHandle();
      
      // Create profile
      const profileResult = await client.query(
        `INSERT INTO profiles (id, handle, email, avatar_url, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
         RETURNING *`,
        [userId, handle, email, avatarUrl]
      );
      
      // Create identity_link
      await client.query(
        `INSERT INTO identity_links (user_id, provider, external_id, created_at)
         VALUES ($1, 'privy', $2, NOW())`,
        [userId, privyUserId]
      );
      
      await client.query('COMMIT');
      
      const profile = profileResult.rows[0];
      logger.info('✅ New user created:', userId, 'with handle:', handle);
      
      return {
        userId,
        profile: {
          id: profile.id,
          handle: profile.handle,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          created_at: profile.created_at,
          updated_at: profile.updated_at
        },
        isNewUser: true
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Get user profile by internal user ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const client = await getClient();
  
  try {
    const result = await client.query(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      handle: row.handle,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } finally {
    client.release();
  }
}

/**
 * Get user profile by Privy user ID
 * (convenience wrapper around resolveInternalUserId)
 */
export async function getUserByPrivyId(privyUserId: string): Promise<ResolvedUser | null> {
  try {
    return await resolveInternalUserId(privyUserId);
  } catch (error) {
    logger.error('Error getting user by Privy ID:', error);
    return null;
  }
}

/**
 * Link an additional identity provider to an existing user
 */
export async function linkIdentity(
  userId: string,
  provider: string,
  externalId: string
): Promise<IdentityLink> {
  const client = await getClient();
  
  try {
    const result = await client.query(
      `INSERT INTO identity_links (user_id, provider, external_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider, external_id) DO UPDATE SET user_id = $1
       RETURNING *`,
      [userId, provider, externalId]
    );
    
    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      provider: row.provider,
      external_id: row.external_id,
      created_at: row.created_at
    };
  } finally {
    client.release();
  }
}

/**
 * Get all identity links for a user
 */
export async function getUserIdentities(userId: string): Promise<IdentityLink[]> {
  const client = await getClient();
  
  try {
    const result = await client.query(
      'SELECT * FROM identity_links WHERE user_id = $1',
      [userId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      provider: row.provider,
      external_id: row.external_id,
      created_at: row.created_at
    }));
  } finally {
    client.release();
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'handle' | 'email' | 'name' | 'avatar_url' | 'bio'>>
): Promise<UserProfile | null> {
  const client = await getClient();
  
  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.handle !== undefined) {
      setClauses.push(`handle = $${paramIndex++}`);
      values.push(updates.handle);
    }
    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.avatar_url !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex++}`);
      values.push(updates.avatar_url);
    }
    if (updates.bio !== undefined) {
      setClauses.push(`bio = $${paramIndex++}`);
      values.push(updates.bio);
    }
    
    values.push(userId);
    
    const result = await client.query(
      `UPDATE profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      handle: row.handle,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } finally {
    client.release();
  }
}

// Export pool for advanced use cases (now re-exports the shared pool)
export { pool as sessionPool };