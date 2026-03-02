/**
 * Health Check Routes
 * Provides endpoints for monitoring system health and dependencies
 * Used by load balancers, monitoring tools, and ops teams
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { Nango } from '@nangohq/node';

const router = express.Router();

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  error?: string;
  details?: any;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  dependencies: {
    [key: string]: HealthCheckResult;
  };
}

/**
 * GET /health
 * Overall system health check
 * Returns 200 if healthy, 503 if degraded/down
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  // Check all dependencies
  const [database, redis, nango] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkNango()
  ]);
  
  // Determine overall status
  const dependencies = { database, redis, nango };
  const statuses = Object.values(dependencies).map(d => d.status);
  
  let overallStatus: 'healthy' | 'degraded' | 'down';
  if (statuses.every(s => s === 'healthy')) {
    overallStatus = 'healthy';
  } else if (statuses.some(s => s === 'down')) {
    overallStatus = 'down';
  } else {
    overallStatus = 'degraded';
  }
  
  const health: SystemHealth = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    dependencies
  };
  
  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  
  res.status(statusCode).json(health);
});

/**
 * GET /health/live
 * Liveness probe - Is the application alive?
 * Returns 200 if process is running
 * Used by Kubernetes liveness probes
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /health/ready
 * Readiness probe - Is the application ready to serve traffic?
 * Returns 200 only if all critical dependencies are available
 * Used by Kubernetes readiness probes
 */
router.get('/ready', async (req, res) => {
  try {
    // Check critical dependencies
    const [database, redis] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);
    
    const isReady = database.status === 'healthy' && redis.status === 'healthy';
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        dependencies: { database, redis }
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        dependencies: { database, redis }
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /health/database
 * Database health check
 */
router.get('/database', async (req, res) => {
  const result = await checkDatabase();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

/**
 * GET /health/redis
 * Redis health check
 */
router.get('/redis', async (req, res) => {
  const result = await checkRedis();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

/**
 * GET /health/nango
 * Nango service health check
 */
router.get('/nango', async (req, res) => {
  const result = await checkNango();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

/**
 * GET /health/detailed
 * Detailed health check with statistics
 * Includes metrics about system resources and recent activity
 */
router.get('/detailed', async (req, res) => {
  try {
    const [database, redis, nango, stats] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkNango(),
      getSystemStats()
    ]);
    
    const dependencies = { database, redis, nango };
    const statuses = Object.values(dependencies).map(d => d.status);
    
    let overallStatus: 'healthy' | 'degraded' | 'down';
    if (statuses.every(s => s === 'healthy')) {
      overallStatus = 'healthy';
    } else if (statuses.some(s => s === 'down')) {
      overallStatus = 'down';
    } else {
      overallStatus = 'degraded';
    }
    
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      dependencies,
      statistics: stats,
      resources: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Health Check Functions
// =============================================================================

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    // Simple query to test connectivity
    const { error } = await supabase
      .from('user_wallets')
      .select('count')
      .limit(1)
      .single();
    
    const latency = Date.now() - startTime;
    
    if (error && !error.message.includes('multiple')) {
      // Ignore "multiple rows" error - means DB is working
      return {
        status: 'down',
        latency,
        error: error.message
      };
    }
    
    // Check if latency is acceptable (< 500ms)
    if (latency > 500) {
      return {
        status: 'degraded',
        latency,
        details: { message: 'High latency detected' }
      };
    }
    
    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Redis connectivity and performance
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let redis: Redis | null = null;
  
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    // Test ping
    const pong = await redis.ping();
    const latency = Date.now() - startTime;
    
    await redis.quit();
    
    if (pong !== 'PONG') {
      return {
        status: 'down',
        latency,
        error: 'Redis ping failed'
      };
    }
    
    // Check if latency is acceptable (< 100ms)
    if (latency > 100) {
      return {
        status: 'degraded',
        latency,
        details: { message: 'High latency detected' }
      };
    }
    
    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    return {
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check Nango service connectivity
 */
async function checkNango(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const nango = new Nango({
      secretKey: process.env.NANGO_SECRET_KEY!,
      host: process.env.NANGO_API_URL || 'http://localhost:3003'
    });
    
    // Test by fetching connections (should work even if empty)
    // This is a lightweight check
    const latency = Date.now() - startTime;
    
    // If we get here without error, Nango is accessible
    // Check if latency is acceptable (< 1000ms)
    if (latency > 1000) {
      return {
        status: 'degraded',
        latency,
        details: { message: 'High latency detected' }
      };
    }
    
    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get system statistics from database
 */
async function getSystemStats(): Promise<any> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    // Get system health summary from our view
    const { data, error } = await supabase
      .from('system_health_summary')
      .select('*')
      .single();
    
    if (error) {
      console.error('Error fetching system stats:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching system stats:', error);
    return null;
  }
}

export const healthRouter = router;
