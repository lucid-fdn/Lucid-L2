/**
 * Admin Authentication Middleware
 * Verifies admin API key for privileged endpoints
 * Supports both API key and IP whitelist-based authentication
 */

import { Request, Response, NextFunction } from 'express';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
  adminApiKey?: string;
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
    
    // Method 1: API Key Authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      const adminApiKey = process.env.ADMIN_API_KEY;
      
      if (!adminApiKey) {
        console.error('❌ ADMIN_API_KEY not configured');
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
      const crypto = require('crypto');
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
      console.log(`✅ Admin authenticated via API key from IP: ${clientIp}`);
      return next();
    }
    
    // Method 2: IP Whitelist Authentication (if configured)
    if (ipWhitelist.length > 0 && isIpWhitelisted(clientIp, ipWhitelist)) {
      req.isAdmin = true;
      console.log(`✅ Admin authenticated via IP whitelist: ${clientIp}`);
      return next();
    }
    
    // No valid authentication method provided
    logFailedAdminAuth(req, clientIp, 'missing_credentials');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required. Provide API key via Authorization header: "Bearer <admin-api-key>"'
    });
    
  } catch (error) {
    console.error('Admin authentication error:', error);
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
  
  // Try API key auth
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    const adminApiKey = process.env.ADMIN_API_KEY;
    
    if (adminApiKey && apiKey === adminApiKey) {
      req.isAdmin = true;
      req.adminApiKey = apiKey;
      return next();
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
  console.warn('⚠️ Failed admin authentication attempt', {
    ip: clientIp,
    endpoint: req.path,
    method: req.method,
    reason,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });
  
  // TODO: Store in database for security monitoring
  // TODO: Implement rate limiting on failed attempts
  // TODO: Alert on multiple failed attempts from same IP
}

/**
 * Create admin API key
 * Run this once to generate a secure admin API key
 * Store the result in your .env file as ADMIN_API_KEY
 * 
 * Usage: node -e "require('./dist/middleware/adminAuth').generateAdminApiKey()"
 */
export function generateAdminApiKey(): string {
  const crypto = require('crypto');
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  console.log('\n🔑 Generated Admin API Key:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(apiKey);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nAdd this to your .env file:');
  console.log(`ADMIN_API_KEY=${apiKey}`);
  console.log('\nKeep this secret! Do not commit to version control.\n');
  
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
 * import { verifyAdminAuth, optionalAdminAuth } from '../middleware/adminAuth';
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
