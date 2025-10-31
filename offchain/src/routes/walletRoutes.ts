import express from 'express';
import { protocolManager } from '../services/protocolManager';
import { SessionSignerService } from '../services/sessionSignerService';

const router = express.Router();

// Initialize session signer service
let sessionSignerService: SessionSignerService | null = null;

function getSessionSignerService(): SessionSignerService {
  if (!sessionSignerService) {
    sessionSignerService = new SessionSignerService();
  }
  return sessionSignerService;
}

/**
 * POST /api/wallets/onboard
 * Create wallet and session signer for a user
 */
router.post('/onboard', async (req, res) => {
  try {
    const { userId, chainType, policies } = req.body;
    
    if (!userId || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId and chainType are required' 
      });
    }

    console.log(`📝 Onboarding user ${userId} with ${chainType} wallet...`);
    
    // Create wallet via Privy adapter
    const walletResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'createUser',
      parameters: { userId, chainType },
      userId,
      config: { network: 'mainnet' }
    });
    
    if (!walletResult.success) {
      return res.status(400).json({ 
        success: false,
        error: walletResult.error 
      });
    }
    
    // Add session signer with policies
    const signerResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'addSessionSigner',
      parameters: {
        walletId: (walletResult.data as any).walletId,
        userId,
        ...policies
      },
      userId
    });
    
    console.log(`✅ User ${userId} onboarded successfully`);
    
    res.json({
      success: true,
      wallet: walletResult.data,
      sessionSigner: signerResult.data,
      message: `Wallet and session signer created for ${userId}`
    });
    
  } catch (error) {
    console.error('Error in wallet onboarding:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/wallets/:userId/:chainType
 * Get wallet for a user
 */
router.get('/:userId/:chainType', async (req, res) => {
  try {
    const { userId, chainType } = req.params;
    
    if (!userId || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: userId and chainType' 
      });
    }

    console.log(`🔍 Fetching wallet for user ${userId} (${chainType})...`);
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'getWallet',
      parameters: { userId, chainType },
      userId
    });
    
    if (!result.success) {
      return res.status(404).json({ 
        success: false,
        error: result.error || 'Wallet not found' 
      });
    }
    
    res.json({
      success: true,
      wallet: result.data,
      message: `Wallet retrieved for ${userId}`
    });
    
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/wallets/:walletId/sign-transaction
 * Sign a transaction with session signer
 */
router.post('/:walletId/sign-transaction', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { userId, transaction, chainType, n8nWorkflowId, n8nExecutionId } = req.body;
    
    if (!userId || !transaction || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId, transaction, and chainType are required' 
      });
    }

    console.log(`🔐 Signing transaction for wallet ${walletId} (${chainType})...`);
    
    const service = getSessionSignerService();
    
    // Check if signing is allowed based on policies
    const canSign = await service.canSign(userId, walletId, transaction);
    
    if (!canSign.allowed) {
      console.log(`❌ Transaction denied: ${canSign.reason}`);
      
      // Log denial in audit log
      if (canSign.signer) {
        await service.logTransaction({
          signerId: canSign.signer.id,
          walletId,
          userId,
          transactionType: 'sign',
          chainType,
          status: 'denied',
          denialReason: canSign.reason,
          n8nWorkflowId,
          n8nExecutionId
        });
      }
      
      return res.status(403).json({ 
        success: false,
        error: canSign.reason 
      });
    }
    
    // Determine the correct operation based on chain type
    const operationId = chainType === 'solana' 
      ? 'signAndSendSolanaTransaction' 
      : 'sendEthereumTransaction';
    
    // Execute signing operation
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId,
      parameters: {
        walletId,
        userId,
        transaction: chainType === 'solana' ? transaction : JSON.stringify(transaction),
        n8nWorkflowId,
        n8nExecutionId
      },
      userId
    });
    
    // Update usage tracking and log transaction
    if (result.success && canSign.signer) {
      await service.updateUsage(
        canSign.signer.id,
        transaction.amount || '0'
      );
      
      const resultData = result.data as any;
      
      await service.logTransaction({
        signerId: canSign.signer.id,
        walletId,
        userId,
        transactionType: 'sign_and_send',
        chainType,
        amount: transaction.amount,
        programId: transaction.programId,
        contractAddress: transaction.to,
        transactionSignature: resultData?.signature,
        transactionHash: resultData?.hash,
        status: 'success',
        n8nWorkflowId,
        n8nExecutionId
      });
      
      console.log(`✅ Transaction signed and sent successfully`);
    }
    
    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Transaction signed and sent' : 'Transaction failed'
    });
    
  } catch (error) {
    console.error('Error signing transaction:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * DELETE /api/wallets/:walletId/session-signers/:signerId
 * Revoke a session signer
 */
router.delete('/:walletId/session-signers/:signerId', async (req, res) => {
  try {
    const { walletId, signerId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required field: userId' 
      });
    }

    console.log(`🚫 Revoking session signer ${signerId} for wallet ${walletId}...`);
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'revokeSessionSigner',
      parameters: { walletId, signerId },
      userId
    });
    
    if (result.success) {
      console.log(`✅ Session signer revoked successfully`);
    }
    
    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Session signer revoked' : 'Revocation failed'
    });
    
  } catch (error) {
    console.error('Error revoking session signer:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/wallets/:walletId/session-signers
 * List all session signers for a wallet
 */
router.get('/:walletId/session-signers', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required query parameter: userId' 
      });
    }

    console.log(`📋 Listing session signers for wallet ${walletId}...`);
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'listSessionSigners',
      parameters: { walletId },
      userId: userId as string
    });
    
    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Session signers retrieved' : 'Failed to retrieve signers'
    });
    
  } catch (error) {
    console.error('Error listing session signers:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/wallets/options/:optionType
 * Provide dynamic options for n8n nodes
 */
router.get('/options/:optionType', async (req, res) => {
  try {
    const { optionType } = req.params;
    const { userId } = req.query;
    
    console.log(`🔧 Fetching options for type: ${optionType}`);
    
    switch (optionType) {
      case 'chains':
        res.json({
          success: true,
          options: [
            { name: 'Solana', value: 'solana' },
            { name: 'Ethereum', value: 'ethereum' },
            { name: 'Base', value: 'base' },
            { name: 'Polygon', value: 'polygon' }
          ]
        });
        break;
        
      case 'allowedPrograms':
        res.json({
          success: true,
          options: [
            { name: 'Jupiter Aggregator', value: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' },
            { name: 'Raydium AMM', value: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
            { name: 'Orca Whirlpool', value: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
            { name: 'Serum DEX', value: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' }
          ]
        });
        break;
        
      case 'policyTemplates':
        res.json({
          success: true,
          options: [
            {
              name: 'Conservative (24h, 1 SOL max)',
              value: 'conservative',
              config: {
                ttl: 86400,
                maxAmount: '1000000000',
                dailyLimit: '5000000000',
                requiresQuorum: false
              }
            },
            {
              name: 'Moderate (7 days, 10 SOL max)',
              value: 'moderate',
              config: {
                ttl: 604800,
                maxAmount: '10000000000',
                dailyLimit: '50000000000',
                requiresQuorum: false
              }
            },
            {
              name: 'High-Value (1h, 100 SOL, requires quorum)',
              value: 'high-value',
              config: {
                ttl: 3600,
                maxAmount: '100000000000',
                dailyLimit: '500000000000',
                requiresQuorum: true
              }
            }
          ]
        });
        break;
        
      default:
        res.status(404).json({ 
          success: false,
          error: `Unknown option type: ${optionType}` 
        });
    }
  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
