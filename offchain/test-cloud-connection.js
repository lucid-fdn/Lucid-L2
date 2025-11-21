#!/usr/bin/env node
/**
 * Test script to verify cloud Supabase connection
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  console.log('🔍 Testing Cloud Supabase Connection...');
  console.log(`Host: ${process.env.POSTGRES_HOST}`);
  console.log(`Port: ${process.env.POSTGRES_PORT}`);
  console.log(`User: ${process.env.POSTGRES_USER}`);
  console.log(`Database: ${process.env.POSTGRES_DB}\n`);

  try {
    const client = await pool.connect();
    console.log('✅ Connected successfully!\n');

    // Test query
    const result = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', ['public']);
    console.log('📊 Tables in database:');
    result.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

    client.release();
    await pool.end();
    
    console.log('\n✅ Connection test PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection test FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testConnection();
