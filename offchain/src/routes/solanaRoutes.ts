/**
 * Solana API Routes
 * 
 * REST endpoints for Solana blockchain operations.
 * Provides access to all Solana adapter operations.
 */

import { Router, Request, Response } from 'express';
import { protocolRegistry } from '../protocols/ProtocolRegistry';

const router = Router();

// =============================================================================
// Helper Functions
// =============================================================================

function getAdapter() {
  const adapter = protocolRegistry.get('solana');
  if (!adapter) {
    throw new Error('Solana adapter not found');
  }
  return adapter;
}

// =============================================================================
// Balance and Account Operations
// =============================================================================

/**
 * GET /api/solana/balance/:address
 * Get SOL balance for a wallet address
 */
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getBalance',
      { address, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solana/token-balance
 * Get token balance for a wallet and mint
 */
router.post('/token-balance', async (req: Request, res: Response) => {
  try {
    const { address, mint, commitment } = req.body;

    if (!address || !mint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: address, mint'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getTokenBalance',
      { address, mint, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solana/token-accounts/:address
 * Get all token accounts for a wallet
 */
router.get('/token-accounts/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { mint, commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getTokenAccounts',
      { address, mint, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solana/account-info/:address
 * Get account information
 */
router.get('/account-info/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getAccountInfo',
      { address, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Transaction Operations
// =============================================================================

/**
 * GET /api/solana/transaction/:signature
 * Get transaction details by signature
 */
router.get('/transaction/:signature', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;
    const { commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getTransaction',
      { signature, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solana/transactions/:address
 * Get transaction history for an address
 */
router.get('/transactions/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit, before, commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getSignaturesForAddress',
      { 
        address, 
        limit: limit ? parseInt(limit as string) : undefined,
        before,
        commitment 
      },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solana/recent-blockhash
 * Get recent blockhash
 */
router.get('/recent-blockhash', async (req: Request, res: Response) => {
  try {
    const { commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getRecentBlockhash',
      { commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Token Information
// =============================================================================

/**
 * GET /api/solana/token-supply/:mint
 * Get token supply information
 */
router.get('/token-supply/:mint', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const { commitment } = req.query;

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getTokenSupply',
      { mint, commitment },
      { userId: 'system' }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Write Operations (Requires Authentication)
// =============================================================================

/**
 * POST /api/solana/transfer-sol
 * Transfer SOL to another address
 */
router.post('/transfer-sol', async (req: Request, res: Response) => {
  try {
    const { toAddress, amount, commitment } = req.body;

    if (!toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: toAddress, amount'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'transferSOL',
      { toAddress, amount, commitment },
      { 
        userId: 'system',
        credentials: {
          // Note: In production, credentials should come from secure storage
          privateKey: process.env.SOLANA_PRIVATE_KEY
        }
      }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solana/transfer-token
 * Transfer SPL tokens to another address
 */
router.post('/transfer-token', async (req: Request, res: Response) => {
  try {
    const { toAddress, mint, amount, decimals, commitment } = req.body;

    if (!toAddress || !mint || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: toAddress, mint, amount'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'transferToken',
      { toAddress, mint, amount, decimals, commitment },
      { 
        userId: 'system',
        credentials: {
          privateKey: process.env.SOLANA_PRIVATE_KEY
        }
      }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solana/create-token-account
 * Create an associated token account
 */
router.post('/create-token-account', async (req: Request, res: Response) => {
  try {
    const { owner, mint, commitment } = req.body;

    if (!owner || !mint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: owner, mint'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'createTokenAccount',
      { owner, mint, commitment },
      { 
        userId: 'system',
        credentials: {
          privateKey: process.env.SOLANA_PRIVATE_KEY
        }
      }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solana/close-token-account
 * Close a token account and reclaim rent
 */
router.post('/close-token-account', async (req: Request, res: Response) => {
  try {
    const { tokenAccount, destination, commitment } = req.body;

    if (!tokenAccount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tokenAccount'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'closeTokenAccount',
      { tokenAccount, destination, commitment },
      { 
        userId: 'system',
        credentials: {
          privateKey: process.env.SOLANA_PRIVATE_KEY
        }
      }
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Health Check
// =============================================================================

/**
 * GET /api/solana/health
 * Check Solana adapter health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const adapter = getAdapter();
    const health = await adapter.checkHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: Date.now()
    });
  }
});

export default router;
