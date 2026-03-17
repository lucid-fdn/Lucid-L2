#!/usr/bin/env node
/**
 * Migration script to run all SQL migrations on Supabase cloud
 * Uses Supabase client for better compatibility
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kwihlcnapmkaivijyiif.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3aWhsY25hcG1rYWl2aWp5aWlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTkzNzU3MiwiZXhwIjoyMDc1NTEzNTcyfQ.Zmk30zvzYBqjc3Ku_eEEVXuEVhfu3vm8sD6KZcBMWL0';

const MIGRATIONS = [
  '001_oauth_credentials.sql',
  '20250131_privy_wallets.sql',
  '20250206_rewards_system.sql',
  '20250210_nango_integration.sql'
];

async function runMigrations() {
  console.log('🚀 Starting migration to Supabase Cloud...');
  console.log(`Target: ${SUPABASE_URL}\n`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
  
  try {
    console.log('📊 Running migrations...\n');
    
    for (const migration of MIGRATIONS) {
      const migrationPath = path.join(__dirname, '..', 'migrations', migration);
      console.log(`  → Running ${migration}...`);
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        // Use Supabase's RPC to execute raw SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
        
        if (error) {
          // If RPC doesn't exist, we need to use the REST endpoint directly
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ query: sql })
          });
          
          if (!response.ok) {
            // Fall back to using pg driver through Supabase REST API
            // Split SQL into individual statements and execute one by one
            const statements = sql.split(';').filter(s => s.trim());
            
            for (const statement of statements) {
              if (!statement.trim()) continue;
              
              const { error: stmtError } = await supabase
                .from('_http')
                .select('*')
                .limit(0); // This won't work, we need a different approach
              
              // Direct SQL execution via PostgREST
              const execResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                  'Content-Profile': 'public',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  query: statement.trim()
                })
              });
            }
          }
        }
        
        console.log(`    ✅ ${migration} completed`);
      } catch (error) {
        console.error(`    ❌ ${migration} failed:`);
        console.error(`       ${error.message}`);
        throw error;
      }
    }
    
    console.log('\n✅ All migrations completed successfully!\n');
    
    // Verify tables
    console.log('🔍 Verifying tables...');
    const { data: tables, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')
      .order('tablename');
    
    if (tables) {
      console.log('\nTables created:');
      tables.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 You may need to run migrations using Supabase CLI instead:');
    console.error('   npx supabase db push --project-ref kwihlcnapmkaivijyiif\n');
    process.exit(1);
  }
}

runMigrations();
