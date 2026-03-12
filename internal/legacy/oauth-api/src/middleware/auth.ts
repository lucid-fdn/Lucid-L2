/**
 * Privy Authentication Middleware
 * 
 * Validates Privy JWT tokens and extracts user information
 */

import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';

// Extend Express Request type to include user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      privyUser?: {
        id: string;
        createdAt: Date;
        linkedAccounts?: any[];
      };
    }
  }
}

// Initialize Privy client
const privyAppId = process.env.PRIVY_APP_ID;
const privyAppSecret = process.env.PRIVY_APP_SECRET;

if (!privyAppId || !privyAppSecret) {
  throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET environment variables are required');
}

const privy = new PrivyClient(privyAppId, privyAppSecret);

/**
 * Middleware to validate Privy authentication token
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        error: 'Missing authorization header',
        message: 'Please provide a valid Privy access token'
      });
      return;
    }

    // Remove 'Bearer ' prefix if present
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      res.status(401).json({
        error: 'Invalid authorization header',
        message: 'Authorization header must be in format: Bearer <token>'
      });
      return;
    }

    // Verify token with Privy
    const claims = await privy.verifyAuthToken(token);

    // Extract user ID (format: did:privy:...)
    if (!claims.userId) {
      res.status(401).json({
        error: 'Invalid token claims',
        message: 'Token does not contain valid user ID'
      });
      return;
    }

    // Attach user info to request
    req.userId = claims.userId;
    req.privyUser = {
      id: claims.userId,
      createdAt: new Date(claims.issuedAt * 1000)
    };

    console.log('[Auth] User authenticated:', req.userId);

    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    
    res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid or expired token'
    });
  }
}

/**
 * Optional auth middleware (doesn't fail if no token)
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No auth header, continue without user
      next();
      return;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    
    if (token) {
      const claims = await privy.verifyAuthToken(token);
      
      if (claims.userId) {
        req.userId = claims.userId;
        req.privyUser = {
          id: claims.userId,
          createdAt: new Date(claims.issuedAt * 1000)
        };
      }
    }

    next();
  } catch (error) {
    // Log error but don't fail the request
    console.warn('[Auth] Optional auth failed:', error);
    next();
  }
}

/**
 * Get user ID from request (throws if not authenticated)
 */
export function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new Error('User not authenticated');
  }
  return req.userId;
}

/**
 * Get Privy user data for a user ID
 */
export async function getPrivyUser(userId: string) {
  try {
    const user = await privy.getUser(userId);
    return { data: user, error: null };
  } catch (error) {
    console.error('[Auth] Error fetching Privy user:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to fetch user'
    };
  }
}

export default {
  requireAuth,
  optionalAuth,
  requireUserId,
  getPrivyUser
};
