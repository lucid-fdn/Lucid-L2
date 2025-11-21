import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';

export interface PrivyRequest extends Request {
  user?: {
    privyUserId: string;
    userId: string;
    walletAddress?: string;
    email?: string;
  };
}

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

/**
 * Middleware to verify Privy JWT token
 * Attaches user information to request object
 */
export async function verifyPrivyToken(
  req: PrivyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header',
        message: 'Authorization header must be in format: Bearer <token>'
      });
    }
    
    const token = authHeader.substring(7);
    
    // Verify with Privy
    const claims = await privyClient.verifyAuthToken(token);
    
    if (!claims || !claims.userId) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token verification failed'
      });
    }
    
    // Attach user info to request
    req.user = {
      privyUserId: claims.userId,
      userId: claims.userId, // Or map to your internal user ID if different
      walletAddress: (claims as any).walletAddress,
      email: (claims as any).email
    };
    
    next();
  } catch (error: any) {
    console.error('Privy JWT verification failed:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message || 'Invalid or expired token'
    });
  }
}

/**
 * Optional middleware to verify Privy token but don't fail if missing
 * Useful for endpoints that support both authenticated and unauthenticated access
 */
export async function optionalPrivyToken(
  req: PrivyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const claims = await privyClient.verifyAuthToken(token);
      
      if (claims && claims.userId) {
        req.user = {
          privyUserId: claims.userId,
          userId: claims.userId,
          walletAddress: (claims as any).walletAddress,
          email: (claims as any).email
        };
      }
    }
    
    next();
  } catch (error) {
    // Fail silently for optional auth
    next();
  }
}
