#!/usr/bin/env node
/**
 * Check user_oauth_connections table schema
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
  const out = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

const env = loadEnvFile(path.join(__dirname, '../.env'));

async function connectWithCandidates(candidates) {
  for (const c of candidates) {
    const client = new Client({
      host: c.host,
      port: c.port,
      database: c.database,
      user: c.user,
      password: c.password,
      ssl: c.ssl
    });

    try {
      await client.connect();
      console.log(`✅ Connected to Postgres (${c.label})`);
      return client;
    } catch (e) {
      await client.end().catch(() => undefined);
      console.warn(`⚠️  Connection failed (${c.label}): ${e.message}`);
    }
  }

  return null;
}

async function checkSchema() {
  // Try BOTH:
  // 1) Direct Supabase DB host (db.<ref>.supabase.co:5432) with user=postgres
  // 2) Supabase pooler host (aws-*.pooler.supabase.com:6543) with user=postgres.<ref>
  const candidates = [
    {
      label: 'direct',
      host: 'db.kwihlcnapmkaivijyiif.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: env.SUPABASE_PASSWORD || env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    {
      label: 'pooler',
      host: 'aws-1-eu-north-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      user: 'postgres.kwihlcnapmkaivijyiif',
      // prefer explicit pooler password if present, otherwise fall back
      password: env.NANGO_DB_PASSWORD || env.SUPABASE_PASSWORD || env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    }
  ].filter(c => c.password);

  if (candidates.length === 0) {
    console.error('❌ No password found. Add SUPABASE_PASSWORD (preferred) or SUPABASE_DB_PASSWORD to ../.env');
    process.exit(1);
  }

  const connectedClient = await connectWithCandidates(candidates);
  if (!connectedClient) {
    console.error('❌ Could not connect with any candidate (direct or pooler)');
    process.exit(1);
  }

  try {
    const result = await connectedClient.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'user_oauth_connections'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 user_oauth_connections schema:\n');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connectedClient.end();
  }
}

checkSchema();
