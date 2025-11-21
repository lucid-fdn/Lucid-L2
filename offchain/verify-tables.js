#!/usr/bin/env node
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

async function verify() {
  console.log('🔍 Verifying reward tables...\n');
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('users', 'rewards', 'conversations', 'reward_transactions', 'user_achievements', 'mgas_conversions')
      ORDER BY tablename
    `);

    if (result.rows.length === 6) {
      console.log('✅ All 6 reward tables exist:');
      result.rows.forEach(row => console.log(`   ✓ ${row.tablename}`));
      
      const countResult = await client.query('SELECT COUNT(*) as count FROM users');
      console.log(`\n✅ Can query users table: ${countResult.rows[0].count} users`);
      
      console.log('\n✅ Database is ready! Backend needs to restart to pick up changes.');
      process.exit(0);
    } else {
      console.log(`❌ Only found ${result.rows.length}/6 tables`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();
