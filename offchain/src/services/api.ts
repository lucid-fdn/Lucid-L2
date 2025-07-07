// offchain/src/services/api.ts
import express from 'express';
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runMockInference } from '../utils/inference';
import { initSolana, deriveEpochPDA } from '../solana/client';
import { loadStore, saveStore, MemoryStore } from '../utils/memoryStore';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../solana/gas';
import { LUCID_MINT, MGAS_PER_ROOT, IGAS_PER_BATCH } from '../utils/config';
import { batchCommit } from '../commands/batch';
import { getMMRService, AgentEpochData } from './mmrService';

export async function handleRun(req: express.Request, res: express.Response) {
  try {
    const { text } = req.body as { text: string };
    const rootBytes = runMockInference(text);
    const hexRoot = Buffer.from(rootBytes).toString('hex');

    const program = initSolana();
    const authority = (program.provider as any).wallet.publicKey;

    // PDA for this user
    const [pda] = await deriveEpochPDA(authority, program.programId);

    // 1) ComputeBudget (iGas) instruction
    const computeIx = makeComputeIx();

    // 2) Burn iGas & mGas from user's $LUCID ATA
    const userAta = await getAssociatedTokenAddress(LUCID_MINT, authority);
    const igasIx = makeBurnIx('iGas', userAta, LUCID_MINT, authority, 1);
    const mgasIx = makeBurnIx('mGas', userAta, LUCID_MINT, authority, 5);

    // Calculate and log gas costs
    const gasCost = calculateGasCost('single', 1);
    console.log(`💰 Gas cost: ${gasCost.iGas} iGas + ${gasCost.mGas} mGas = ${gasCost.total} $LUCID`);

    // 3) Commit on-chain
    const sig = await program.methods
      .commitEpoch([...rootBytes])
      .accounts({
        epochRecord: pda,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([computeIx, igasIx, mgasIx])
      .rpc();

    // 4) Update local memory-wallet
    const store: MemoryStore = await loadStore();
    store[authority.toBase58()] = hexRoot;
    await saveStore(store);

    res.json({ success: true, txSignature: sig, root: hexRoot, store });
  } catch (error) {
    console.error('Error in handleRun:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export async function handleBatch(req: express.Request, res: express.Response) {
  try {
    const { texts } = req.body as { texts: string[] };
    
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input: texts array is required' 
      });
    }

    const validTexts = texts.filter(t => t && t.trim());
    if (validTexts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid texts provided' 
      });
    }

    // Use the existing batchCommit function
    const sig = await batchCommit(validTexts);
    
    // Calculate gas costs for response
    const gasCost = calculateGasCost('batch', validTexts.length);
    
    // Generate roots for response (same logic as batchCommit)
    const roots = validTexts.map(t => {
      const rootBytes = runMockInference(t);
      return Buffer.from(rootBytes).toString('hex');
    });

    res.json({ 
      success: true, 
      txSignature: sig, 
      roots,
      texts: validTexts,
      gasCost,
      savings: validTexts.length > 1 ? {
        individual: validTexts.length * 6,
        batch: gasCost.total,
        saved: (validTexts.length * 6) - gasCost.total,
        percentage: (((validTexts.length * 6) - gasCost.total) / (validTexts.length * 6) * 100).toFixed(1)
      } : null
    });
  } catch (error) {
    console.error('Error in handleBatch:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// ============================================================================
// AI AGENT API ENDPOINTS
// ============================================================================

/**
 * Initialize or load an AI agent
 * POST /agents/init
 * Body: { agentId: string, ipfsCid?: string }
 */
export async function handleAgentInit(req: express.Request, res: express.Response) {
  try {
    const { agentId, ipfsCid } = req.body as { agentId: string; ipfsCid?: string };
    
    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required and must be a string'
      });
    }

    const mmrService = getMMRService();
    const agent = await mmrService.initializeAgent(agentId, ipfsCid);
    
    const stats = await mmrService.getAgentStats(agentId);
    
    res.json({
      success: true,
      agentId,
      initialized: true,
      stats,
      message: ipfsCid ? `Agent loaded from IPFS: ${ipfsCid}` : 'New agent initialized'
    });
  } catch (error) {
    console.error('Error in handleAgentInit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process an epoch for an AI agent
 * POST /agents/epoch
 * Body: { agentId: string, vectors: string[], epochNumber?: number }
 */
export async function handleAgentEpoch(req: express.Request, res: express.Response) {
  try {
    const { agentId, vectors, epochNumber } = req.body as {
      agentId: string;
      vectors: string[];
      epochNumber?: number;
    };

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required and must be a string'
      });
    }

    if (!vectors || !Array.isArray(vectors) || vectors.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: vectors array is required and must not be empty'
      });
    }

    const validVectors = vectors.filter(v => v && typeof v === 'string' && v.trim());
    if (validVectors.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid vectors provided'
      });
    }

    const mmrService = getMMRService();
    const finalEpochNumber = epochNumber || mmrService.getNextEpochNumber();

    const epochData: AgentEpochData = {
      agentId,
      vectors: validVectors,
      epochNumber: finalEpochNumber
    };

    const result = await mmrService.processAgentEpoch(epochData);

    res.json({
      success: true,
      agentId,
      epochNumber: finalEpochNumber,
      vectorCount: validVectors.length,
      mmrRoot: result.mmrRoot.toString('hex'),
      ipfsCid: result.ipfsCid,
      transactionSignature: result.transactionSignature,
      gasCost: result.gasCost,
      message: `Epoch ${finalEpochNumber} processed successfully for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error in handleAgentEpoch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process multiple epochs in batch for one or more agents
 * POST /agents/batch-epochs
 * Body: { epochs: Array<{ agentId: string, vectors: string[], epochNumber?: number }> }
 */
export async function handleAgentBatchEpochs(req: express.Request, res: express.Response) {
  try {
    const { epochs } = req.body as { epochs: AgentEpochData[] };

    if (!epochs || !Array.isArray(epochs) || epochs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: epochs array is required and must not be empty'
      });
    }

    // Validate each epoch data
    const validEpochs: AgentEpochData[] = [];
    const mmrService = getMMRService();

    for (const epoch of epochs) {
      if (!epoch.agentId || typeof epoch.agentId !== 'string') {
        continue;
      }
      if (!epoch.vectors || !Array.isArray(epoch.vectors) || epoch.vectors.length === 0) {
        continue;
      }
      
      const validVectors = epoch.vectors.filter(v => v && typeof v === 'string' && v.trim());
      if (validVectors.length === 0) {
        continue;
      }

      validEpochs.push({
        agentId: epoch.agentId,
        vectors: validVectors,
        epochNumber: epoch.epochNumber || mmrService.getNextEpochNumber()
      });
    }

    if (validEpochs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid epochs provided'
      });
    }

    const results = await mmrService.processBatchEpochs(validEpochs);

    // Calculate total gas costs
    const totalGasCost = results.reduce((acc, result) => ({
      iGas: acc.iGas + result.gasCost.iGas,
      mGas: acc.mGas + result.gasCost.mGas,
      total: acc.total + result.gasCost.total
    }), { iGas: 0, mGas: 0, total: 0 });

    res.json({
      success: true,
      processedEpochs: results.length,
      results: results.map(r => ({
        agentId: validEpochs.find(e => e.epochNumber === r.epochNumber)?.agentId,
        epochNumber: r.epochNumber,
        mmrRoot: r.mmrRoot.toString('hex'),
        ipfsCid: r.ipfsCid,
        transactionSignature: r.transactionSignature,
        gasCost: r.gasCost
      })),
      totalGasCost,
      message: `Successfully processed ${results.length} epochs across ${new Set(validEpochs.map(e => e.agentId)).size} agents`
    });
  } catch (error) {
    console.error('Error in handleAgentBatchEpochs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate proof of contribution for a specific vector
 * POST /agents/proof
 * Body: { agentId: string, vectorText: string, epochNumber: number }
 */
export async function handleAgentProof(req: express.Request, res: express.Response) {
  try {
    const { agentId, vectorText, epochNumber } = req.body as {
      agentId: string;
      vectorText: string;
      epochNumber: number;
    };

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required and must be a string'
      });
    }

    if (!vectorText || typeof vectorText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: vectorText is required and must be a string'
      });
    }

    if (!epochNumber || typeof epochNumber !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: epochNumber is required and must be a number'
      });
    }

    const mmrService = getMMRService();
    
    console.log(`🔍 API: Proof request for agent ${agentId}, epoch ${epochNumber}, vector: "${vectorText}"`);
    
    const proofResult = await mmrService.generateContributionProof(agentId, vectorText, epochNumber);

    if (!proofResult) {
      console.log(`❌ API: No proof result returned from MMR service`);
      return res.status(404).json({
        success: false,
        error: `No proof found for vector "${vectorText}" in epoch ${epochNumber} for agent ${agentId}`
      });
    }

    res.json({
      success: true,
      agentId,
      vectorText,
      epochNumber,
      proof: proofResult.proof,
      verified: proofResult.verified,
      message: `Proof generated and ${proofResult.verified ? 'verified' : 'failed verification'}`
    });
  } catch (error) {
    console.error('Error in handleAgentProof:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent statistics and current status
 * GET /agents/:agentId/stats
 */
export async function handleAgentStats(req: express.Request, res: express.Response) {
  try {
    const { agentId } = req.params;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required'
      });
    }

    const mmrService = getMMRService();
    const stats = await mmrService.getAgentStats(agentId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: `Agent ${agentId} not found`
      });
    }

    res.json({
      success: true,
      stats,
      message: `Statistics retrieved for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error in handleAgentStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent's MMR root history
 * GET /agents/:agentId/history
 */
export async function handleAgentHistory(req: express.Request, res: express.Response) {
  try {
    const { agentId } = req.params;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required'
      });
    }

    const mmrService = getMMRService();
    const history = await mmrService.getAgentHistory(agentId);

    res.json({
      success: true,
      agentId,
      history: history.map(h => ({
        epoch: h.epoch,
        root: h.root.toString('hex'),
        timestamp: h.timestamp,
        date: new Date(h.timestamp).toISOString()
      })),
      totalEpochs: history.length,
      message: `History retrieved for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error in handleAgentHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get current MMR root for an agent
 * GET /agents/:agentId/root
 */
export async function handleAgentCurrentRoot(req: express.Request, res: express.Response) {
  try {
    const { agentId } = req.params;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required'
      });
    }

    const mmrService = getMMRService();
    const currentRoot = await mmrService.getAgentCurrentRoot(agentId);

    if (!currentRoot) {
      return res.status(404).json({
        success: false,
        error: `Agent ${agentId} not found or has no committed epochs`
      });
    }

    res.json({
      success: true,
      agentId,
      currentRoot: currentRoot.toString('hex'),
      message: `Current root retrieved for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error in handleAgentCurrentRoot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List all registered agents
 * GET /agents
 */
export async function handleListAgents(req: express.Request, res: express.Response) {
  try {
    const mmrService = getMMRService();
    const agents = mmrService.listAgents();

    // Get stats for each agent
    const agentDetails = await Promise.all(
      agents.map(async (agentId) => {
        const stats = await mmrService.getAgentStats(agentId);
        return stats;
      })
    );

    res.json({
      success: true,
      totalAgents: agents.length,
      agents: agentDetails.filter(Boolean),
      message: `Retrieved ${agents.length} registered agents`
    });
  } catch (error) {
    console.error('Error in handleListAgents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Verify MMR integrity for an agent
 * GET /agents/:agentId/verify
 */
export async function handleAgentVerify(req: express.Request, res: express.Response) {
  try {
    const { agentId } = req.params;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required'
      });
    }

    const mmrService = getMMRService();
    const verification = await mmrService.verifyAgentMMR(agentId);

    res.json({
      success: true,
      agentId,
      verification,
      message: `MMR verification ${verification.valid ? 'passed' : 'failed'} for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error in handleAgentVerify:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * System status and health check
 * GET /system/status
 */
export async function handleSystemStatus(req: express.Request, res: express.Response) {
  try {
    const mmrService = getMMRService();
    const agents = mmrService.listAgents();
    const ipfsConnected = await mmrService.checkIPFSConnection();

    // Get blockchain connection status
    let blockchainConnected = false;
    let blockchainError = null;
    try {
      const program = initSolana();
      const connection = program.provider.connection;
      const slot = await connection.getSlot();
      blockchainConnected = slot > 0;
    } catch (error) {
      blockchainError = error instanceof Error ? error.message : 'Unknown blockchain error';
    }

    res.json({
      success: true,
      system: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      },
      blockchain: {
        connected: blockchainConnected,
        error: blockchainError
      },
      ipfs: {
        connected: ipfsConnected
      },
      agents: {
        total: agents.length,
        registered: agents
      },
      message: 'System status retrieved successfully'
    });
  } catch (error) {
    console.error('Error in handleSystemStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  
  // Original endpoints
  router.post('/run', handleRun);
  router.post('/batch', handleBatch);
  
  // AI Agent endpoints
  router.post('/agents/init', handleAgentInit);
  router.post('/agents/epoch', handleAgentEpoch);
  router.post('/agents/batch-epochs', handleAgentBatchEpochs);
  router.post('/agents/proof', handleAgentProof);
  router.get('/agents/:agentId/stats', handleAgentStats);
  router.get('/agents/:agentId/history', handleAgentHistory);
  router.get('/agents/:agentId/root', handleAgentCurrentRoot);
  router.get('/agents/:agentId/verify', handleAgentVerify);
  router.get('/agents', handleListAgents);
  
  // System endpoints
  router.get('/system/status', handleSystemStatus);
  
  return router;
}
