/**
 * Solana API Routes
 * 
 * REST endpoints for Solana blockchain operations.
 * Provides access to all Solana adapter operations.
 * Integrates with Privy for delegated signing on write operations.
 */

import { Router, Request, Response } from 'express';
import { protocolRegistry } from '../../protocols/ProtocolRegistry';
import { protocolManager } from '../../protocols/protocolManager';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { logger } from '../../../../engine/src/shared/lib/logger';

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

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

function getPrivyConfig() {
  return {
    network: 'mainnet',
    credentials: {
      appId: process.env.PRIVY_APP_ID,
      appSecret: process.env.PRIVY_APP_SECRET,
      authPrivateKey: process.env.PRIVY_AUTH_PRIVATE_KEY,
      keyQuorumId: process.env.PRIVY_KEY_QUORUM_ID,
      apiBaseUrl: process.env.PRIVY_API_BASE_URL
    }
  };
}

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get user's Privy Solana wallet address from database
 */
async function getUserSolanaAddress(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', userId)
    .eq('chain_type', 'solana')
    .single();
  
  if (error || !data) {
    return null;
  }
  return data.wallet_address;
}

/**
 * Get user's Privy wallet details from database
 */
async function getUserWalletDetails(userId: string): Promise<{ walletId: string; address: string } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_wallets')
    .select('wallet_id, wallet_address')
    .eq('user_id', userId)
    .eq('chain_type', 'solana')
    .single();
  
  if (error || !data) {
    return null;
  }
  return { walletId: data.wallet_id, address: data.wallet_address };
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
// User-Context Endpoints (Privy Integration)
// =============================================================================

/**
 * GET /api/solana/me/balance
 * Get SOL balance for the logged-in user's Privy wallet
 */
router.get('/me/balance', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: userId'
      });
    }

    const address = await getUserSolanaAddress(userId);
    
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getBalance',
      { address },
      { userId }
    );

    if (result.success) {
      res.json({
        ...result,
        address,
        userId
      });
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
 * GET /api/solana/me/tokens
 * Get all token accounts for the logged-in user's Privy wallet
 */
router.get('/me/tokens', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const { mint } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: userId'
      });
    }

    const address = await getUserSolanaAddress(userId);
    
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getTokenAccounts',
      { address, mint },
      { userId }
    );

    if (result.success) {
      res.json({
        ...result,
        address,
        userId
      });
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
 * GET /api/solana/me/transactions
 * Get transaction history for the logged-in user's Privy wallet
 */
router.get('/me/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const { limit, before } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: userId'
      });
    }

    const address = await getUserSolanaAddress(userId);
    
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.'
      });
    }

    const adapter = getAdapter();
    const result = await adapter.execute(
      'getSignaturesForAddress',
      { 
        address, 
        limit: limit ? parseInt(limit as string) : 10,
        before 
      },
      { userId }
    );

    if (result.success) {
      res.json({
        ...result,
        address,
        userId
      });
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
 * POST /api/solana/me/transfer-sol
 * Transfer SOL using Privy delegated signing
 */
router.post('/me/transfer-sol', async (req: Request, res: Response) => {
  try {
    const { userId, toAddress, amount } = req.body;

    if (!userId || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, toAddress, amount'
      });
    }

    // Get user's wallet details
    const walletDetails = await getUserWalletDetails(userId);
    
    if (!walletDetails) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.'
      });
    }

    const { walletId, address: fromAddress } = walletDetails;

    // Build the SOL transfer transaction
    const connection = getConnection();
    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey(toAddress);
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Create transfer instruction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: Math.round(parseFloat(amount) * LAMPORTS_PER_SOL)
      })
    );
    
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = fromPubkey;

    // Serialize transaction for Privy signing
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    // Sign and send via Privy
    const privyAdapter = protocolRegistry.get('privy');
    if (!privyAdapter) {
      return res.status(500).json({
        success: false,
        error: 'Privy adapter not available'
      });
    }

    const signResult = await privyAdapter.execute(
      'signAndSendSolanaTransaction',
      {
        walletId,
        userId,
        transaction: serializedTx
      },
      { userId }
    );

    if (signResult.success) {
      res.json({
        success: true,
        data: {
          signature: (signResult.data as any).signature,
          from: fromAddress,
          to: toAddress,
          amount,
          amountLamports: Math.round(parseFloat(amount) * LAMPORTS_PER_SOL)
        },
        message: `Successfully transferred ${amount} SOL to ${toAddress}`
      });
    } else {
      res.status(400).json({
        success: false,
        error: signResult.error || 'Transaction failed'
      });
    }
  } catch (error) {
    logger.error('SOL transfer error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solana/me/transfer-token
 * Transfer SPL tokens using Privy delegated signing
 */
router.post('/me/transfer-token', async (req: Request, res: Response) => {
  try {
    const { userId, toAddress, mint, amount, decimals = 9 } = req.body;

    if (!userId || !toAddress || !mint || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, toAddress, mint, amount'
      });
    }

    // Get user's wallet details
    const walletDetails = await getUserWalletDetails(userId);
    
    if (!walletDetails) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.'
      });
    }

    const { walletId, address: fromAddress } = walletDetails;

    // Build the token transfer transaction
    const connection = getConnection();
    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey(toAddress);
    const mintPubkey = new PublicKey(mint);
    
    // Get associated token addresses
    const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
    const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if destination ATA exists, if not create it
    const toAtaInfo = await connection.getAccountInfo(toAta);
    if (!toAtaInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey, // payer
          toAta,      // ata
          toPubkey,   // owner
          mintPubkey  // mint
        )
      );
    }
    
    // Add transfer instruction
    const tokenAmount = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals)));
    transaction.add(
      createTransferInstruction(
        fromAta,     // source
        toAta,       // destination
        fromPubkey,  // owner
        tokenAmount  // amount
      )
    );
    
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = fromPubkey;

    // Serialize transaction for Privy signing
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    // Sign and send via Privy
    const privyAdapter = protocolRegistry.get('privy');
    if (!privyAdapter) {
      return res.status(500).json({
        success: false,
        error: 'Privy adapter not available'
      });
    }

    const signResult = await privyAdapter.execute(
      'signAndSendSolanaTransaction',
      {
        walletId,
        userId,
        transaction: serializedTx
      },
      { userId }
    );

    if (signResult.success) {
      res.json({
        success: true,
        data: {
          signature: (signResult.data as any).signature,
          from: fromAddress,
          to: toAddress,
          mint,
          amount,
          decimals
        },
        message: `Successfully transferred ${amount} tokens to ${toAddress}`
      });
    } else {
      res.status(400).json({
        success: false,
        error: signResult.error || 'Transaction failed'
      });
    }
  } catch (error) {
    logger.error('Token transfer error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solana/me/wallet
 * Get wallet info for the logged-in user
 */
router.get('/me/wallet', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: userId'
      });
    }

    const walletDetails = await getUserWalletDetails(userId);
    
    if (!walletDetails) {
      return res.status(404).json({
        success: false,
        error: 'Solana wallet not found for this user. Please complete wallet onboarding first.',
        onboardingUrl: '/api/wallets/onboard'
      });
    }

    // Get balance too
    const adapter = getAdapter();
    const balanceResult = await adapter.execute(
      'getBalance',
      { address: walletDetails.address },
      { userId }
    );

    res.json({
      success: true,
      data: {
        userId,
        walletId: walletDetails.walletId,
        address: walletDetails.address,
        balance: balanceResult.success ? balanceResult.data : null
      }
    });
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

export const solanaRouter = router;
