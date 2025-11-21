#!/usr/bin/env node
/**
 * Run reward system migration on cloud Supabase database
 * Run from offchain directory: cd Lucid-L2/offchain && node ../infrastructure/scripts/run-reward-migration-cloud.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from offchain/.env manually
const envPath = path.join(__dirname, '../../offchain/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  // Serverless-optimized connection pool settings
  max: 2,                              // Very small pool for migration
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true,
});

async function runMigration() {
  console.log('🔄 Running rewards system migration on cloud Supabase...');
  console.log(`Host: ${process.env.POSTGRES_HOST}`);
  console.log(`Database: ${process.env.POSTGRES_DB}\n`);

  const client = await pool.connect();
  
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/20250206_rewards_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration SQL...');
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables were created
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('users', 'rewards', 'conversations', 'reward_transactions', 'user_achievements', 'mgas_conversions')
      ORDER BY tablename
    `);

    console.log('📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.tablename}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
