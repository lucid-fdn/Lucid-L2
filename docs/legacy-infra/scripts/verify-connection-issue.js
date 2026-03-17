#!/usr/bin/env node

/**
 * Verify Connection Issue
 * 
 * This script checks:
 * 1. Nango's _nango_connections table for the actual connection
 * 2. user_oauth_connections table for the metadata
 * 3. Verifies if the frontend developer's analysis is correct
 */

const { Pool } = require('pg');

// Database connection (using Supabase pooler)
const pool = new Pool({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.kwihlcnapmkaivijyiif',
  password: 'Tk5JbpMcX!qdEvE',
  ssl: { rejectUnauthorized: false }
});

const TEST_USER_ID = process.env.TEST_USER_ID || 'did:privy:cmi2zxrhi01gal70cm2n2xke5';

async function main() {
  console.log('='.repeat(80));
  console.log('VERIFYING OAUTH CONNECTION ISSUE');
  console.log('='.repeat(80));
  console.log(`\nTest User ID: ${TEST_USER_ID}\n`);
  console.log(`Tip: override with TEST_USER_ID env var, e.g. TEST_USER_ID=did:privy:xxx node verify-connection-issue.js\n`);
  
  try {
    // 1. Check Nango _nango_connections table
    console.log('Step 1: Checking Nango _nango_connections table...\n');
    
    const nangoQuery = `
      SELECT 
        id,
        connection_id,
        provider_config_key,
        environment_id,
        created_at,
        updated_at,
        deleted,
        credentials_iv,
        credentials_tag,
        connection_config
      FROM nango._nango_connections
      WHERE connection_id LIKE $1
      ORDER BY created_at DESC
    `;
    
    const nangoResult = await pool.query(nangoQuery, [`${TEST_USER_ID}%`]);
    
    if (nangoResult.rows.length === 0) {
      console.log('❌ NO connections found in Nango _nango_connections table');
      console.log('   This means the OAuth flow did not complete successfully.\n');
    } else {
      console.log(`✅ Found ${nangoResult.rows.length} connection(s) in Nango:\n`);
      
      for (const row of nangoResult.rows) {
        console.log(`  Connection ID: ${row.connection_id}`);
        console.log(`  Provider: ${row.provider_config_key}`);
        console.log(`  Environment: ${row.environment_id} (1=prod, 2=dev)`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Updated: ${row.updated_at}`);
        console.log(`  Deleted: ${row.deleted}`);
        console.log(`  Has Credentials: ${row.credentials_iv ? 'Yes' : 'No'}`);
        console.log('');
      }
    }
    
    // 2. Check user_oauth_connections table
    console.log('Step 2: Checking user_oauth_connections table...\n');
    
    const userConnectionsQuery = `
      SELECT 
        id,
        privy_user_id,
        user_id,
        provider,
        nango_connection_id,
        nango_integration_id,
        provider_account_id,
        provider_account_name,
        provider_account_email,
        scopes,
        created_at,
        last_used_at,
        expires_at,
        revoked_at
      FROM user_oauth_connections
      WHERE privy_user_id LIKE $1
      ORDER BY created_at DESC
    `;
    
    const userResult = await pool.query(userConnectionsQuery, [`${TEST_USER_ID}%`]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ NO connections found in user_oauth_connections table');
      console.log('   This is the issue! The connection exists in Nango but not in our metadata table.\n');
    } else {
      console.log(`✅ Found ${userResult.rows.length} connection(s) in user_oauth_connections:\n`);
      
      for (const row of userResult.rows) {
        console.log(`  ID: ${row.id}`);
        console.log(`  Privy User ID: ${row.privy_user_id}`);
        console.log(`  User ID: ${row.user_id}`);
        console.log(`  Provider: ${row.provider}`);
        console.log(`  Nango Connection ID: ${row.nango_connection_id}`);
        console.log(`  Nango Integration ID: ${row.nango_integration_id}`);
        console.log(`  Provider Account Name: ${row.provider_account_name || 'N/A'}`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Last Used: ${row.last_used_at || 'Never'}`);
        console.log(`  Revoked: ${row.revoked_at || 'No'}`);
        console.log('');
      }
    }
    
    // 3. Check oauth_states table (temporary state tokens)
    console.log('Step 3: Checking oauth_states table (for pending/expired states)...\n');
    console.log('Note: with Option A (Nango-hosted callback + POST /api/oauth/:provider/sync), oauth_states may remain and can be cleaned up periodically.\n');
    
    const statesQuery = `
      SELECT 
        id,
        state,
        privy_user_id,
        user_id,
        provider,
        created_at,
        expires_at
      FROM oauth_states
      WHERE privy_user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const statesResult = await pool.query(statesQuery, [TEST_USER_ID]);
    
    if (statesResult.rows.length === 0) {
      console.log('ℹ️  No OAuth states found (this is normal if OAuth was completed/expired)\n');
    } else {
      console.log(`Found ${statesResult.rows.length} OAuth state(s):\n`);
      
      for (const row of statesResult.rows) {
        const isExpired = new Date(row.expires_at) < new Date();
        console.log(`  State: ${row.state}`);
        console.log(`  Provider: ${row.provider}`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Expires: ${row.expires_at} ${isExpired ? '(EXPIRED)' : '(VALID)'}`);
        console.log('');
      }
    }
    
    // 4. Analysis & Verdict
    console.log('='.repeat(80));
    console.log('ANALYSIS & VERDICT');
    console.log('='.repeat(80));
    console.log('');
    
    const hasNangoConnection = nangoResult.rows.length > 0;
    const hasUserConnection = userResult.rows.length > 0;
    
    if (hasNangoConnection && !hasUserConnection) {
      console.log('🎯 ISSUE CONFIRMED:');
      console.log('   - OAuth connection EXISTS in Nango');
      console.log('   - But NOT stored in user_oauth_connections table');
      console.log('');
      console.log('📋 CONNECTION ID FORMAT:');
      const nangoConnectionId = nangoResult.rows[0].connection_id;
      console.log(`   Nango stores as: ${nangoConnectionId}`);
      console.log('');
      
      if (nangoConnectionId.includes('-twitter')) {
        console.log('✅ Frontend developer was PARTIALLY CORRECT:');
        console.log('   - Yes, Nango uses compound IDs: {userId}-{provider}');
        console.log('   - But NO, the query pattern is NOT the issue');
        console.log('');
        console.log('❌ The REAL issue:');
        console.log('   - The OAuth callback handler failed to insert into user_oauth_connections');
        console.log('   - Likely reasons:');
        console.log('     1. Silent error in handleOAuthCallback() upsert');
        console.log('     2. State token validation failed');
        console.log('     3. Nango getConnection() call failed during callback');
        console.log('');
      }
      
      console.log('🔧 RECOMMENDED FIX:');
      console.log('   1. Add error throwing (not just logging) in handleOAuthCallback()');
      console.log('   2. Increase wait time from 2s to 5s for Nango processing');
      console.log('   3. Add retry logic for Nango getConnection()');
      console.log('   4. Manually insert the missing record (temporary fix)');
      console.log('');
      
      // Generate manual insert SQL
      console.log('🛠️  MANUAL FIX SQL:');
      console.log('');
      console.log(`INSERT INTO user_oauth_connections (
  privy_user_id,
  user_id,
  provider,
  nango_connection_id,
  nango_integration_id,
  scopes,
  created_at
) VALUES (
  '${TEST_USER_ID}',
  '${TEST_USER_ID}',  -- Update if different
  'twitter',
  '${nangoConnectionId}',
  'twitter-v2',
  ARRAY['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  NOW()
)
ON CONFLICT (privy_user_id, provider) 
DO UPDATE SET
  nango_connection_id = EXCLUDED.nango_connection_id,
  revoked_at = NULL;`);
      console.log('');
      
    } else if (!hasNangoConnection && !hasUserConnection) {
      console.log('❌ NO CONNECTION FOUND ANYWHERE:');
      console.log('   - OAuth flow did not complete in Nango');
      console.log('   - Check if callback URL is correct');
      console.log('   - Check Twitter app settings');
      console.log('');
    } else if (hasNangoConnection && hasUserConnection) {
      console.log('✅ CONNECTION EXISTS IN BOTH TABLES:');
      console.log('   - Everything is working correctly');
      console.log('   - The issue might be with a different user/connection');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
