#!/usr/bin/env node

/**
 * Fix Nango Twitter OAuth Callback URL
 * 
 * This script updates the callback URL for the twitter-v2 integration
 * in the Nango database to fix the redirectmeto.com proxy issue.
 * 
 * Problem: Nango is using https://redirectmeto.com/... as the callback URL
 * Solution: Update the integration to use the direct callback URL
 * 
 * Usage: node fix-nango-twitter-callback.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env file manually
function loadEnv(envPath) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (e) {
    console.log('Note: Could not load .env file:', e.message);
  }
}

// Try to load .env from parent directory
loadEnv(path.join(__dirname, '../.env'));

// Configuration
const CORRECT_CALLBACK_URL = 'https://api.lucid.foundation/nango/oauth/callback';
const CORRECT_SERVER_URL = 'https://api.lucid.foundation/nango';

// Database connection (using Supabase pooler)
// Values from infrastructure/.env
const pool = new Pool({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.kwihlcnapmkaivijyiif',
  password: 'Tk5JbpMcX!qdEvE',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('='.repeat(60));
  console.log('Nango Twitter OAuth Callback URL Fix');
  console.log('='.repeat(60));
  console.log(`\nTarget Callback URL: ${CORRECT_CALLBACK_URL}`);
  console.log(`Target Server URL: ${CORRECT_SERVER_URL}\n`);
  
  try {
    // 1. Check current twitter-v2 integration config
    console.log('Step 1: Checking current twitter-v2 configuration...\n');
    
    const checkQuery = `
      SELECT 
        id, 
        unique_key, 
        provider, 
        oauth_client_id,
        oauth_scopes,
        environment_id,
        created_at,
        updated_at
      FROM nango._nango_configs 
      WHERE unique_key = 'twitter-v2' 
         OR provider = 'twitter-v2'
      ORDER BY environment_id
    `;
    
    const checkResult = await pool.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      console.log('❌ No twitter-v2 integration found in Nango database.');
      console.log('\nYou may need to:');
      console.log('1. Create the twitter-v2 integration in Nango dashboard');
      console.log('2. Or reconfigure Nango with the correct environment variables');
      return;
    }
    
    console.log(`Found ${checkResult.rows.length} twitter-v2 integration(s):\n`);
    
    for (const row of checkResult.rows) {
      console.log(`  ID: ${row.id}`);
      console.log(`  Unique Key: ${row.unique_key}`);
      console.log(`  Provider: ${row.provider}`);
      console.log(`  OAuth Client ID: ${row.oauth_client_id || 'Not set'}`);
      console.log(`  Environment ID: ${row.environment_id} (1=prod, 2=dev)`);
      console.log(`  Created: ${row.created_at}`);
      console.log(`  Updated: ${row.updated_at}`);
      console.log('');
    }
    
    // 2. Check the _nango_environment_variables table
    console.log('Step 2: Checking Nango environment variables...\n');
    
    const envQuery = `
      SELECT name, value, environment_id
      FROM nango._nango_environment_variables 
      WHERE name IN ('NANGO_SERVER_URL', 'NANGO_CALLBACK_URL', 'NANGO_PUBLIC_URL')
      ORDER BY environment_id, name
    `;
    
    try {
      const envResult = await pool.query(envQuery);
      
      if (envResult.rows.length === 0) {
        console.log('⚠️  No Nango URL environment variables found in database.');
        console.log('   This is likely why redirectmeto.com is being used as a fallback.\n');
      } else {
        console.log('Current Nango URL environment variables:');
        for (const row of envResult.rows) {
          console.log(`  [Env ${row.environment_id}] ${row.name}: ${row.value}`);
        }
        console.log('');
      }
    } catch (envError) {
      console.log('⚠️  Could not query environment variables table:', envError.message);
    }
    
    // 3. Insert/Update the necessary environment variables
    console.log('Step 3: Setting correct callback URLs in Nango database...\n');
    
    // Try to insert/update environment variables for prod environment (id=1)
    const upsertEnvVars = `
      INSERT INTO nango._nango_environment_variables (name, value, environment_id, created_at, updated_at)
      VALUES 
        ('NANGO_SERVER_URL', $1, 1, NOW(), NOW()),
        ('NANGO_CALLBACK_URL', $2, 1, NOW(), NOW())
      ON CONFLICT (name, environment_id) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = NOW()
    `;
    
    try {
      await pool.query(upsertEnvVars, [CORRECT_SERVER_URL, CORRECT_CALLBACK_URL]);
      console.log('✅ Updated NANGO_SERVER_URL and NANGO_CALLBACK_URL for prod environment');
    } catch (upsertError) {
      console.log('⚠️  Could not update environment variables:', upsertError.message);
      console.log('   The _nango_environment_variables table may have a different schema.');
      console.log('   Try updating the callback URL through the Nango dashboard instead.');
    }
    
    // 4. Verify the update
    console.log('\nStep 4: Verifying the configuration...\n');
    
    try {
      const verifyResult = await pool.query(`
        SELECT name, value, environment_id
        FROM nango._nango_environment_variables 
        WHERE name IN ('NANGO_SERVER_URL', 'NANGO_CALLBACK_URL')
        AND environment_id = 1
        ORDER BY name
      `);
      
      if (verifyResult.rows.length > 0) {
        console.log('Current Nango URL configuration (prod environment):');
        for (const row of verifyResult.rows) {
          const isCorrect = (
            (row.name === 'NANGO_SERVER_URL' && row.value === CORRECT_SERVER_URL) ||
            (row.name === 'NANGO_CALLBACK_URL' && row.value === CORRECT_CALLBACK_URL)
          );
          console.log(`  ${row.name}: ${row.value} ${isCorrect ? '✅' : '❌'}`);
        }
      }
    } catch (verifyError) {
      console.log('Could not verify:', verifyError.message);
    }
    
    // 5. Print next steps
    console.log('\n' + '='.repeat(60));
    console.log('NEXT STEPS:');
    console.log('='.repeat(60));
    console.log(`
1. RESTART NANGO CONTAINER:
   cd /home/admin/Lucid/Lucid-L2/infrastructure
   docker-compose restart nango
   
2. VERIFY NANGO ENVIRONMENT:
   docker exec lucid-nango printenv | grep -E 'NANGO_(SERVER|CALLBACK)_URL'

3. REGISTER CALLBACK URL IN TWITTER DEVELOPER PORTAL:
   - Go to: https://developer.twitter.com/en/portal/projects
   - Select your app
   - Edit OAuth 2.0 settings
   - Add callback URL: ${CORRECT_CALLBACK_URL}
   - Save changes

4. TEST THE OAUTH FLOW:
   - Try connecting Twitter again
   - The redirect URL should now be: ${CORRECT_CALLBACK_URL}
   - NOT: https://redirectmeto.com/...

5. IF STILL NOT WORKING:
   - Check Nango dashboard: http://localhost:3007
   - Go to Integrations -> twitter-v2
   - Manually update the callback URL there
`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
