#!/usr/bin/env node
/**
 * Run achievement extensions migration on cloud Supabase database
 * Adds support for batch_thoughts and referral tracking
 * Run from offchain directory: cd Lucid-L2/offchain && node ../infrastructure/scripts/run-achievement-extensions-migration.js
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
  console.log('🚀 Running achievement extensions migration on cloud Supabase...');
  console.log(`Host: ${process.env.POSTGRES_HOST}`);
  console.log(`Database: ${process.env.POSTGRES_DB}\n`);

  const client = await pool.connect();
  
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/20250225_achievement_extensions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration SQL...');
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify columns were added
    const usersCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'referred_users'
    `);

    const convsCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' 
      AND column_name = 'metadata'
    `);

    console.log('📊 Verification:');
    if (usersCheck.rows.length > 0) {
      console.log('   ✓ users.referred_users column added');
    } else {
      console.log('   ✗ users.referred_users column NOT found');
    }
    
    if (convsCheck.rows.length > 0) {
      console.log('   ✓ conversations.metadata column added');
    } else {
      console.log('   ✗ conversations.metadata column NOT found');
    }

    console.log('\n🎯 New achievements now supported:');
    console.log('   • Batch Processor (⚡ 50 batch thoughts → 40 mGas)');
    console.log('   • Referral Champion (🏆 10 referrals → 200 mGas)');

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
