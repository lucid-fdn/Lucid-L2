/**
 * Admin Authentication Middleware
 * Verifies admin API key for privileged endpoints
 * Supports both API key and IP whitelist-based authentication
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../../../engine/src/db/pool';
import { logger } from '../../../engine/src/lib/logger';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
  adminApiKey?: string;
}

/* ------------------------------------------------------------------ */
/*  In-memory rate limiter for failed admin auth attempts              */
/* ------------------------------------------------------------------ */

interface FailedAttemptRecord {
  count: number;
  firstAttemptAt: number;  // epoch ms
  blockedUntil: number;    // epoch ms — 0 means not blocked
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const RATE_LIMIT_MAX_FAILURES = 10;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;    // 15-minute block
const RATE_LIMIT_ALERT_THRESHOLD = 5;

/** IP -> failure tracking */
const failedAttempts = new Map<string, FailedAttemptRecord>();

/** Periodic cleanup of stale entries (every 5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of failedAttempts) {
      const windowExpired = now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS;
      const blockExpired = record.blockedUntil > 0 && now > record.blockedUntil;
      if (windowExpired && (record.blockedUntil === 0 || blockExpired)) {
        failedAttempts.delete(ip);
      }
    }
    if (failedAttempts.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow Node to exit even if the timer is running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check whether the given IP is currently rate-limited.
 * Returns true if the request should be blocked.
 */
function isRateLimited(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record) return false;

  const now = Date.now();

  // If explicitly blocked, check whether the block has expired
  if (record.blockedUntil > 0) {
    if (now < record.blockedUntil) return true;
    // Block expired — reset the record
    failedAttempts.delete(ip);
    return false;
  }

  return false;
}

/**
 * Record a failed authentication attempt for the given IP.
 */
function recordFailedAttempt(ip: string): void {
  ensureCleanupTimer();

  const now = Date.now();
  let record = failedAttempts.get(ip);

  if (!record || now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    // Start a new window
    record = { count: 1, firstAttemptAt: now, blockedUntil: 0 };
    failedAttempts.set(ip, record);
  } else {
    record.count += 1;
  }

  // Alert threshold
  if (record.count === RATE_LIMIT_ALERT_THRESHOLD) {
    logger.error(
      `[SECURITY] IP ${ip} has ${record.count} failed admin auth attempts in the last 15 minutes`
    );
  }

  // Block threshold
  if (record.count >= RATE_LIMIT_MAX_FAILURES) {
    record.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    logger.error(
      `[SECURITY] IP ${ip} blocked for 15 minutes after ${record.count} failed admin auth attempts`
    );
  }
}

/**
 * Admin IP whitelist (configure in environment or database)
 * Format: comma-separated list of IPs or CIDR ranges
 */
function getAdminIpWhitelist(): string[] {
  const whitelist = process.env.ADMIN_IP_WHITELIST || '';
  return whitelist.split(',').map(ip => ip.trim()).filter(Boolean);
}

/**
 * Check if IP is in whitelist
 */
function isIpWhitelisted(clientIp: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return false;
  
  // Simple IP matching (enhance with CIDR support if needed)
  return whitelist.includes(clientIp);
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  // Check X-Forwarded-For header (set by reverse proxies)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  
  // Check X-Real-IP header
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  // Fall back to socket address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Verify admin API key authentication
 * 
 * Supports two authentication methods:
 * 1. API Key via Authorization header: "Bearer <admin-api-key>"
 * 2. IP whitelist (optional, configured via ADMIN_IP_WHITELIST env var)
 */
export function verifyAdminAuth(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const clientIp = getClientIp(req);
    const ipWhitelist = getAdminIpWhitelist();

    // Rate limit check — block IPs with too many failed attempts
    if (isRateLimited(clientIp)) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many failed authentication attempts. Try again later.'
      });
    }

    // Method 1: API Key Authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      const adminApiKey = process.env.ADMIN_API_KEY;
      
      if (!adminApiKey) {
        logger.error('❌ ADMIN_API_KEY not configured');
        return res.status(500).json({
          error: 'Server misconfiguration',
          message: 'Admin authentication not properly configured'
        });
      }
      
      // Constant-time comparison to prevent timing attacks
      const providedBuffer = Buffer.from(apiKey);
      const expectedBuffer = Buffer.from(adminApiKey);
      
      if (providedBuffer.length !== expectedBuffer.length) {
        logFailedAdminAuth(req, clientIp, 'invalid_api_key');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid admin API key'
        });
      }
      
      // Use crypto.timingSafeEqual for constant-time comparison
      const isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
      
      if (!isValid) {
        logFailedAdminAuth(req, clientIp, 'invalid_api_key');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid admin API key'
        });
      }
      
      // Authentication successful
      req.isAdmin = true;
      req.adminApiKey = apiKey;
      logger.info(`✅ Admin authenticated via API key from IP: ${clientIp}`);
      return next();
    }
    
    // Method 2: IP Whitelist Authentication (if configured)
    if (ipWhitelist.length > 0 && isIpWhitelisted(clientIp, ipWhitelist)) {
      req.isAdmin = true;
      logger.info(`✅ Admin authenticated via IP whitelist: ${clientIp}`);
      return next();
    }
    
    // No valid authentication method provided
    logFailedAdminAuth(req, clientIp, 'missing_credentials');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required. Provide API key via Authorization header: "Bearer <admin-api-key>"'
    });
    
  } catch (error) {
    logger.error('Admin authentication error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Optional admin authentication
 * Checks for admin credentials but doesn't fail if missing
 * Use for endpoints that provide enhanced features for admins
 */
export function optionalAdminAuth(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const clientIp = getClientIp(req);
  const ipWhitelist = getAdminIpWhitelist();
  
  // Try API key auth (constant-time comparison to prevent timing attacks)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    const adminApiKey = process.env.ADMIN_API_KEY;

    if (adminApiKey) {
      const providedBuffer = Buffer.from(apiKey);
      const expectedBuffer = Buffer.from(adminApiKey);
      if (
        providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer)
      ) {
        req.isAdmin = true;
        req.adminApiKey = apiKey;
        return next();
      }
    }
  }
  
  // Try IP whitelist
  if (ipWhitelist.length > 0 && isIpWhitelisted(clientIp, ipWhitelist)) {
    req.isAdmin = true;
    return next();
  }
  
  // No admin auth - continue as regular user
  req.isAdmin = false;
  next();
}

/**
 * Log failed admin authentication attempts
 * This helps detect potential security threats
 */
function logFailedAdminAuth(
  req: Request,
  clientIp: string,
  reason: string
): void {
  logger.warn('⚠️ Failed admin authentication attempt', {
    ip: clientIp,
    endpoint: req.path,
    method: req.method,
    reason,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });

  // Record for rate limiting
  recordFailedAttempt(clientIp);

  // Persist to admin_audit_log (non-blocking — failures must not break auth)
  persistAuditLog(clientIp, req.path, req.method, reason, req.headers['user-agent']);
}

/**
 * Write a row to admin_audit_log.
 * Fire-and-forget — errors are caught and logged, never propagated.
 */
function persistAuditLog(
  ip: string,
  endpoint: string,
  method: string,
  reason: string,
  userAgent: string | undefined
): void {
  try {
    pool.query(
      `INSERT INTO admin_audit_log (ip, endpoint, method, reason, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [ip, endpoint, method, reason, userAgent ?? null]
    ).catch((err: unknown) => {
      // Swallow DB errors — audit persistence must never break auth
      logger.warn('Failed to persist admin audit log:', err instanceof Error ? err.message : err);
    });
  } catch (err: unknown) {
    // Swallow synchronous errors (e.g. pool not initialised)
    logger.warn('Failed to persist admin audit log:', err instanceof Error ? err.message : err);
  }
}

/**
 * Create admin API key
 * Run this once to generate a secure admin API key
 * Store the result in your .env file as ADMIN_API_KEY
 * 
 * Usage: node -e "require('./dist/middleware/adminAuth').generateAdminApiKey()"
 */
export function generateAdminApiKey(): string {
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  logger.info('\n🔑 Generated Admin API Key:');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(apiKey);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('\nAdd this to your .env file:');
  logger.info(`ADMIN_API_KEY=${apiKey}`);
  logger.info('\nKeep this secret! Do not commit to version control.\n');
  
  return apiKey;
}

/**
 * Middleware to check admin permissions for specific actions
 * Use when you need more granular permission checks
 */
export function requireAdminPermission(permission: string) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Admin permission required: ${permission}`
      });
    }
    
    // TODO: Implement role-based permissions if needed
    // For now, all admins have all permissions
    
    next();
  };
}

/**
 * Example usage in routes:
 * 
 * ```typescript
 * import { verifyAdminAuth, optionalAdminAuth } from './adminAuth';
 * 
 * // Require admin auth
 * router.get('/admin/users', verifyAdminAuth, async (req, res) => {
 *   // Only admins can access this
 * });
 * 
 * // Optional admin auth (enhanced features for admins)
 * router.get('/stats', optionalAdminAuth, async (req: AdminRequest, res) => {
 *   if (req.isAdmin) {
 *     // Return detailed stats for admins
 *   } else {
 *     // Return public stats
 *   }
 * });
 * ```
 */
