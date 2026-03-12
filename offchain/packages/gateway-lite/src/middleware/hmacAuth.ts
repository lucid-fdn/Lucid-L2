/**
 * HMAC Signature Authentication Middleware
 * Verifies HMAC-SHA256 signatures on requests from n8n and other trusted services
 * Prevents unauthorized access to sensitive endpoints
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../../engine/src/lib/logger';

export interface HmacRequest extends Request {
  hmacVerified?: boolean;
  hmacSignature?: string;
}

// ── Nonce replay protection ──────────────────────────────────────────
// Tracks used nonces within the 5-minute timestamp window to prevent replay.
const usedNonces = new Set<string>();

const NONCE_CLEANUP_INTERVAL_MS = 6 * 60 * 1000; // 6 minutes
const NONCE_MAX_AGE_S = 360; // 6 minutes (5-min window + 1-min buffer)

const nonceCleanupTimer = setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const key of usedNonces) {
    const ts = parseInt(key.split(':')[0], 10);
    if (now - ts > NONCE_MAX_AGE_S) usedNonces.delete(key);
  }
}, NONCE_CLEANUP_INTERVAL_MS);
nonceCleanupTimer.unref();

/** Exported for testing — clears the nonce registry. */
export function resetNonceRegistry(): void {
  usedNonces.clear();
}

/**
 * Verify HMAC signature on incoming request
 * 
 * Expected headers:
 * - X-HMAC-Signature: The HMAC-SHA256 signature
 * - X-HMAC-Timestamp: Unix timestamp when signature was generated
 * - X-HMAC-Nonce: Random nonce to prevent replay attacks
 * 
 * Signature is computed as: HMAC-SHA256(secret, timestamp + nonce + body)
 */
export function verifyHmacSignature(
  req: HmacRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const signature = req.headers['x-hmac-signature'] as string;
    const timestamp = req.headers['x-hmac-timestamp'] as string;
    const nonce = req.headers['x-hmac-nonce'] as string;
    
    // Check required headers
    if (!signature || !timestamp || !nonce) {
      return res.status(401).json({
        error: 'Missing HMAC authentication headers',
        message: 'Required headers: X-HMAC-Signature, X-HMAC-Timestamp, X-HMAC-Nonce'
      });
    }
    
    // Check timestamp freshness (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);
    
    // Allow 5 minute clock skew
    if (timeDiff > 300) {
      return res.status(401).json({
        error: 'Request timestamp expired',
        message: 'Request must be made within 5 minutes of signature generation'
      });
    }

    // Nonce replay check — reject if this timestamp:nonce pair was already used
    const nonceKey = `${timestamp}:${nonce}`;
    if (usedNonces.has(nonceKey)) {
      return res.status(401).json({
        error: 'Nonce already used',
        message: 'This request has already been processed'
      });
    }

    // Get shared secret
    const secret = process.env.N8N_HMAC_SECRET;
    if (!secret) {
      logger.error('❌ N8N_HMAC_SECRET not configured');
      return res.status(500).json({
        error: 'Server misconfiguration',
        message: 'HMAC authentication not properly configured'
      });
    }
    
    // Compute expected signature
    // Signature payload: timestamp + nonce + request_body
    const body = req.body ? JSON.stringify(req.body) : '';
    const payload = `${timestamp}${nonce}${body}`;
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return res.status(401).json({
        error: 'Invalid HMAC signature',
        message: 'Signature verification failed'
      });
    }
    
    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      logger.warn('⚠️ HMAC signature verification failed', {
        endpoint: req.path,
        timestamp: timestamp,
        nonce: nonce.substring(0, 8) + '...'
      });
      
      return res.status(401).json({
        error: 'Invalid HMAC signature',
        message: 'Signature verification failed'
      });
    }
    
    // Store verification status and register nonce
    req.hmacVerified = true;
    req.hmacSignature = signature;
    usedNonces.add(nonceKey);

    next();
  } catch (error) {
    logger.error('HMAC verification error:', error);
    res.status(500).json({
      error: 'HMAC verification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate HMAC signature for outgoing requests
 * Use this in n8n workflows or other clients
 * 
 * @param secret - Shared HMAC secret
 * @param body - Request body (will be JSON stringified)
 * @returns Headers object with signature, timestamp, and nonce
 */
export function generateHmacHeaders(
  secret: string,
  body?: any
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyString = body ? JSON.stringify(body) : '';
  
  const payload = `${timestamp}${nonce}${bodyString}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return {
    'X-HMAC-Signature': signature,
    'X-HMAC-Timestamp': timestamp,
    'X-HMAC-Nonce': nonce
  };
}

/**
 * Optional HMAC verification (doesn't fail if headers missing)
 * Use for endpoints that support both authenticated and public access
 */
export function optionalHmacSignature(
  req: HmacRequest,
  res: Response,
  next: NextFunction
) {
  const signature = req.headers['x-hmac-signature'] as string;
  
  // If no signature provided, skip verification
  if (!signature) {
    req.hmacVerified = false;
    return next();
  }
  
  // If signature provided, verify it
  return verifyHmacSignature(req, res, next);
}

/**
 * Middleware factory for endpoints with custom HMAC secrets
 * Use when different endpoints need different secrets
 */
export function createHmacVerifier(secretKey: string) {
  return (req: HmacRequest, res: Response, next: NextFunction) => {
    const originalSecret = process.env.N8N_HMAC_SECRET;
    process.env.N8N_HMAC_SECRET = secretKey;
    
    verifyHmacSignature(req, res, (err) => {
      process.env.N8N_HMAC_SECRET = originalSecret;
      if (err) return next(err);
      next();
    });
  };
}

/**
 * Example n8n HTTP Request node configuration:
 * 
 * 1. Add "Generic Credential Type" for HMAC secret
 * 2. Use HTTP Request node with Pre-request Script:
 * 
 * ```javascript
 * const crypto = require('crypto');
 * const secret = $credentials.hmacSecret;
 * const body = JSON.stringify($json);
 * const timestamp = Math.floor(Date.now() / 1000).toString();
 * const nonce = crypto.randomBytes(16).toString('hex');
 * const payload = timestamp + nonce + body;
 * const signature = crypto.createHmac('sha256', secret)
 *   .update(payload)
 *   .digest('hex');
 * 
 * return {
 *   headers: {
 *     'X-HMAC-Signature': signature,
 *     'X-HMAC-Timestamp': timestamp,
 *     'X-HMAC-Nonce': nonce
 *   }
 * };
 * ```
 */
