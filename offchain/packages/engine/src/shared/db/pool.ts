/**
 * Shared Database Pool
 * 
 * Single PostgreSQL connection pool shared across all services.
 * This prevents connection pool exhaustion caused by multiple
 * independent Pool instances competing for Supabase connection slots.
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../lib/logger';

const getPassword = (): string => {
  const pwd = process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD;
  if (!pwd) {
    logger.warn('⚠️  No PostgreSQL password found in environment variables');
    return '';
  }
  return String(pwd);
};

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: getPassword(),
  ssl: process.env.POSTGRES_SSL === 'false' ? false : {
    rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === 'true',
  },
  // Shared pool settings — sized for the whole application
  max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

pool.on('connect', (client) => {
  // Set search_path to include all domain schemas
  client.query("SET search_path TO public, lucid_l2, gateway, identity, marketplace, platform, assistant, workflow, trading");
  logger.info('PostgreSQL shared pool — new connection');
});

pool.on('error', (err) => {
  logger.error('❌ PostgreSQL shared pool error:', err);
});

/**
 * Acquire a client from the shared pool.
 * Includes automatic retry with back-off for transient connection failures.
 */
export async function getClient(retries = 3): Promise<PoolClient> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
      logger.warn(`⚠️  Pool connect attempt ${attempt}/${retries} failed, retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable, but satisfies TS
  throw new Error('Failed to acquire database client');
}

export { pool };
export default pool;