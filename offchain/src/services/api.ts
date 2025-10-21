// offchain/src/services/api.ts
import express from 'express';
import axios from 'axios';
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runInference, runBatchInference } from '../utils/inference';
import { initSolana, deriveEpochPDA } from '../solana/client';
import { loadStore, saveStore, MemoryStore } from '../utils/memoryStore';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../solana/gas';
import { LUCID_MINT, MGAS_PER_ROOT, IGAS_PER_BATCH, N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY } from '../utils/config';
import { batchCommit } from '../commands/batch';
import { getMMRService, AgentEpochData } from './mmrService';
import { FlowSpecService } from '../flowspec/flowspecService';
import { FlowSpec, FlowExecutionContext } from '../flowspec/types';

export async function handleRun(req: express.Request, res: express.Response) {
  try {
    // Debug: log incoming requests to verify connectivity from the extension
    const body: any = req.body || {};
    const preview = typeof body.text === 'string' ? body.text.slice(0, 80) : body;
    console.log(`➡️  API POST /run | textPreview="${preview}" wallet="${body.wallet || ''}"`);
    const { text } = req.body as { text: string };
    const rootBytes = await runInference(text);
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
    const rootsBytes = await runBatchInference(validTexts);
    const roots = rootsBytes.map(rootBytes => Buffer.from(rootBytes).toString('hex'));

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

    // Get blockchain connection status - test connection without initializing full program
    let blockchainConnected = false;
    let blockchainError = null;
    try {
      const { getConnection } = await import('../solana/client');
      const connection = getConnection();
      const slot = await connection.getSlot();
      blockchainConnected = slot > 0;
    } catch (error) {
      blockchainError = error instanceof Error ? error.message : 'Unknown blockchain error';
      console.log('⚠️  Blockchain connection check failed:', blockchainError);
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
      message: blockchainConnected 
        ? 'System status retrieved successfully' 
        : 'System operational (blockchain connection issue - see error details)'
    });
  } catch (error) {
    console.error('Error in handleSystemStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// AGENT PLANNER API ENDPOINTS (Phase 3 - AI Agent Services)
// ============================================================================

/**
 * Plan a workflow from a natural language goal
 * POST /agents/plan
 * Body: { goal: string, context?: object, constraints?: string[], autoExecute?: boolean }
 */
export async function handleAgentPlan(req: express.Request, res: express.Response) {
  try {
    const { getAgentPlanner } = await import('./agentPlanner');
    const { goal, context, constraints, autoExecute } = req.body as {
      goal: string;
      context?: Record<string, any>;
      constraints?: string[];
      autoExecute?: boolean;
    };

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: goal is required and must be a string'
      });
    }

    const planner = getAgentPlanner();
    
    // Check if service is healthy
    const isHealthy = await planner.health();
    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'CrewAI planner service is not available. Please ensure it is running on port 8082.'
      });
    }

    const planResponse = await planner.planWorkflow({
      goal,
      context,
      constraints
    });

    // If autoExecute is true, also execute the workflow
    if (autoExecute) {
      const service = getFlowSpecService();
      const executionContext: FlowExecutionContext = {
        tenantId: context?.tenantId || 'default',
        variables: context || {}
      };

      try {
        const executionResult = await service.createWorkflow(planResponse.flowspec);
        const execution = await service.executeWorkflow(executionResult.id, executionContext);

        return res.json({
          success: true,
          goal,
          flowspec: planResponse.flowspec,
          reasoning: planResponse.reasoning,
          complexity: planResponse.estimated_complexity,
          workflowId: executionResult.id,
          execution,
          message: 'Workflow planned and executed successfully'
        });
      } catch (execError) {
        return res.json({
          success: true,
          goal,
          flowspec: planResponse.flowspec,
          reasoning: planResponse.reasoning,
          complexity: planResponse.estimated_complexity,
          executionError: execError instanceof Error ? execError.message : 'Execution failed',
          message: 'Workflow planned but execution failed'
        });
      }
    }

    res.json({
      success: true,
      goal,
      flowspec: planResponse.flowspec,
      reasoning: planResponse.reasoning,
      complexity: planResponse.estimated_complexity,
      message: 'Workflow planned successfully'
    });
  } catch (error) {
    console.error('Error in handleAgentPlan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Plan and execute a workflow in one call (PHASE 3.4 - Agent Orchestrator)
 * POST /agents/accomplish
 * Body: { goal: string, context?: object, preferredExecutor?: 'n8n' | 'langgraph', dryRun?: boolean }
 */
export async function handleAgentAccomplish(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('./agentOrchestrator');
    const { goal, context, preferredExecutor, dryRun } = req.body;

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: goal is required and must be a string'
      });
    }

    const orchestrator = getAgentOrchestrator();
    const result = await orchestrator.accomplish({
      goal,
      context: context || {},
      preferredExecutor,
      dryRun: dryRun || false
    });

    res.json(result);
  } catch (error) {
    console.error('Error in handleAgentAccomplish:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Preview a workflow without executing it (dry run)
 * POST /agents/accomplish/preview
 * Body: { goal: string, context?: object }
 */
export async function handleAgentAccomplishPreview(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('./agentOrchestrator');
    const { goal, context } = req.body;

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: goal is required and must be a string'
      });
    }

    const orchestrator = getAgentOrchestrator();
    const result = await orchestrator.preview(goal, context || {});

    res.json(result);
  } catch (error) {
    console.error('Error in handleAgentAccomplishPreview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent execution history for a tenant
 * GET /agents/history/:tenantId
 */
export async function handleAgentOrchestratorHistory(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('./agentOrchestrator');
    const { tenantId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: tenantId is required'
      });
    }

    const orchestrator = getAgentOrchestrator();
    const history = orchestrator.getHistory(tenantId, limit);
    const stats = orchestrator.getHistoryStats(tenantId);

    res.json({
      success: true,
      tenantId,
      history,
      stats,
      message: `Retrieved ${history.length} execution records for tenant ${tenantId}`
    });
  } catch (error) {
    console.error('Error in handleAgentOrchestratorHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Health check for agent orchestrator
 * GET /agents/orchestrator/health
 */
export async function handleAgentOrchestratorHealth(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('./agentOrchestrator');
    const orchestrator = getAgentOrchestrator();
    
    const health = await orchestrator.healthCheck();

    res.json({
      success: health.healthy,
      health,
      message: health.healthy ? 'All agent services operational' : 'Some agent services unavailable'
    });
  } catch (error) {
    console.error('Error in handleAgentOrchestratorHealth:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validate a FlowSpec structure
 * POST /agents/validate
 * Body: FlowSpec
 */
export async function handleAgentValidate(req: express.Request, res: express.Response) {
  try {
    const flowspec: FlowSpec = req.body;

    if (!flowspec) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: FlowSpec is required'
      });
    }

    const { getAgentPlanner } = await import('./agentPlanner');
    const planner = getAgentPlanner();
    
    const validation = await planner.validateFlowSpec(flowspec);

    res.json({
      success: validation.valid,
      validation,
      message: validation.valid ? 'FlowSpec is valid' : 'FlowSpec validation failed'
    });
  } catch (error) {
    console.error('Error in handleAgentValidate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent planner service info
 * GET /agents/planner/info
 */
export async function handleAgentPlannerInfo(req: express.Request, res: express.Response) {
  try {
    const { getAgentPlanner } = await import('./agentPlanner');
    const planner = getAgentPlanner();
    
    const isHealthy = await planner.health();
    
    if (!isHealthy) {
      return res.json({
        success: false,
        status: 'unavailable',
        message: 'CrewAI planner service is not available'
      });
    }

    const info = await planner.info();

    res.json({
      success: true,
      status: 'operational',
      info,
      message: 'Planner service is operational'
    });
  } catch (error) {
    console.error('Error in handleAgentPlannerInfo:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// EXECUTOR ROUTER API ENDPOINTS (Phase 3.2 Day 5)
// ============================================================================

/**
 * Execute a FlowSpec with automatic executor selection
 * POST /agents/execute
 * Body: { flowspec: FlowSpec, context: FlowExecutionContext, executor?: 'n8n' | 'langgraph' }
 */
export async function handleAgentExecute(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('./executorRouter');
    const { flowspec, context, executor } = req.body as {
      flowspec: FlowSpec;
      context: FlowExecutionContext;
      executor?: 'n8n' | 'langgraph';
    };

    if (!flowspec || !context) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: flowspec and context are required'
      });
    }

    const router = getExecutorRouter();
    const result = await router.execute(flowspec, context, executor);

    res.json(result);
  } catch (error) {
    console.error('Error in handleAgentExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Check executor health
 * GET /agents/executor/health
 */
export async function handleExecutorHealth(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('./executorRouter');
    const router = getExecutorRouter();
    
    const health = await router.checkExecutorHealth();

    res.json({
      success: true,
      executors: health,
      message: `n8n: ${health.n8n ? 'healthy' : 'unavailable'}, LangGraph: ${health.langgraph ? 'healthy' : 'unavailable'}`
    });
  } catch (error) {
    console.error('Error in handleExecutorHealth:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get executor decision for a FlowSpec without executing
 * POST /agents/executor/decision
 * Body: { flowspec: FlowSpec }
 */
export async function handleExecutorDecision(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('./executorRouter');
    const { flowspec } = req.body as { flowspec: FlowSpec };

    if (!flowspec) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: flowspec is required'
      });
    }

    const router = getExecutorRouter();
    const decision = router.getExecutorDecision(flowspec);

    res.json({
      success: true,
      decision,
      message: `Recommended executor: ${decision.executor} (${decision.reason})`
    });
  } catch (error) {
    console.error('Error in handleExecutorDecision:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// FLOWSPEC API ENDPOINTS (Phase 2 - n8n DSL Integration)
// ============================================================================

let flowspecService: FlowSpecService | null = null;

function getFlowSpecService(): FlowSpecService {
  if (!flowspecService) {
    flowspecService = new FlowSpecService(N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY);
  }
  return flowspecService;
}

/**
 * Create a new workflow from FlowSpec DSL
 * POST /flowspec/create
 * Body: FlowSpec
 */
export async function handleFlowSpecCreate(req: express.Request, res: express.Response) {
  try {
    const spec: FlowSpec = req.body;

    if (!spec || !spec.name) {
      return res.status(400).json({
        success: false,
        error: 'Invalid FlowSpec: name is required'
      });
    }

    const service = getFlowSpecService();
    const result = await service.createWorkflow(spec);

    res.json({
      success: true,
      workflowId: result.id,
      workflowUrl: result.url,
      message: `Workflow '${spec.name}' created successfully`
    });
  } catch (error) {
    console.error('Error in handleFlowSpecCreate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Execute a workflow
 * POST /flowspec/execute
 * Body: { workflowId: string, context: FlowExecutionContext }
 */
export async function handleFlowSpecExecute(req: express.Request, res: express.Response) {
  try {
    const { workflowId, context } = req.body as {
      workflowId: string;
      context: FlowExecutionContext;
    };

    if (!workflowId || !context || !context.tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: workflowId and context with tenantId are required'
      });
    }

    const service = getFlowSpecService();
    const result = await service.executeWorkflow(workflowId, context);

    res.json(result);
  } catch (error) {
    console.error('Error in handleFlowSpecExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get workflow execution history
 * GET /flowspec/history/:workflowId
 */
export async function handleFlowSpecHistory(req: express.Request, res: express.Response) {
  try {
    const { workflowId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const service = getFlowSpecService();
    const history = await service.getExecutionHistory(workflowId, limit);

    res.json({
      success: true,
      workflowId,
      history,
      message: `Retrieved ${history.length} execution records`
    });
  } catch (error) {
    console.error('Error in handleFlowSpecHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update an existing workflow
 * PUT /flowspec/update/:workflowId
 * Body: FlowSpec
 */
export async function handleFlowSpecUpdate(req: express.Request, res: express.Response) {
  try {
    const { workflowId } = req.params;
    const spec: FlowSpec = req.body;

    if (!spec || !spec.name) {
      return res.status(400).json({
        success: false,
        error: 'Invalid FlowSpec: name is required'
      });
    }

    const service = getFlowSpecService();
    await service.updateWorkflow(workflowId, spec);

    res.json({
      success: true,
      workflowId,
      message: `Workflow '${spec.name}' updated successfully`
    });
  } catch (error) {
    console.error('Error in handleFlowSpecUpdate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Delete a workflow
 * DELETE /flowspec/delete/:workflowId
 */
export async function handleFlowSpecDelete(req: express.Request, res: express.Response) {
  try {
    const { workflowId } = req.params;

    const service = getFlowSpecService();
    await service.deleteWorkflow(workflowId);

    res.json({
      success: true,
      workflowId,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    console.error('Error in handleFlowSpecDelete:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List all workflows
 * GET /flowspec/list
 */
export async function handleFlowSpecList(req: express.Request, res: express.Response) {
  try {
    const service = getFlowSpecService();
    const workflows = await service.listWorkflows();

    res.json({
      success: true,
      count: workflows.length,
      workflows,
      message: `Retrieved ${workflows.length} workflows`
    });
  } catch (error) {
    console.error('Error in handleFlowSpecList:', error);
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
  
  // Agent Planner endpoints (Phase 3)
  router.post('/agents/plan', handleAgentPlan);
  router.post('/agents/accomplish', handleAgentAccomplish);
  router.post('/agents/accomplish/preview', handleAgentAccomplishPreview);
  router.get('/agents/history/:tenantId', handleAgentOrchestratorHistory);
  router.get('/agents/orchestrator/health', handleAgentOrchestratorHealth);
  router.post('/agents/execute', handleAgentExecute);
  router.post('/agents/validate', handleAgentValidate);
  router.get('/agents/planner/info', handleAgentPlannerInfo);
  router.get('/agents/executor/health', handleExecutorHealth);
  router.post('/agents/executor/decision', handleExecutorDecision);
  
  // FlowSpec endpoints (Phase 2 - n8n DSL)
  router.post('/flowspec/create', handleFlowSpecCreate);
  router.post('/flowspec/execute', handleFlowSpecExecute);
  router.get('/flowspec/history/:workflowId', handleFlowSpecHistory);
  router.put('/flowspec/update/:workflowId', handleFlowSpecUpdate);
  router.delete('/flowspec/delete/:workflowId', handleFlowSpecDelete);
  router.get('/flowspec/list', handleFlowSpecList);
  
  // System endpoints
  router.get('/system/status', handleSystemStatus);
  
  // MCP Tools endpoints (Phase 3.2 Day 4)
  router.get('/tools/list', handleToolsList);
  router.get('/tools/:name/info', handleToolInfo);
  router.post('/tools/execute', handleToolExecute);
  router.get('/tools/stats', handleToolsStats);
  router.post('/tools/refresh', handleToolsRefresh);
  
  // Passport endpoints
  router.post('/passports/register', handlePassportRegister);
  router.get('/passports/:passportId', handlePassportGet);
  router.get('/passports/owner/:owner', handlePassportsByOwner);
  router.post('/passports/sync-hf-models', handleSyncHFModels);
  router.post('/passports/sync-hf-datasets', handleSyncHFDatasets);
  router.get('/passports/search', handlePassportSearch);
  
  // HF Sync Orchestrator endpoints (Comprehensive Sync)
  router.post('/passports/sync-all-hf', handleSyncAllHF);
  router.get('/passports/sync-progress', handleSyncProgress);
  router.post('/passports/sync-resume', handleSyncResume);
  router.post('/passports/sync-stop', handleSyncStop);
  router.post('/passports/sync-retry-failed', handleSyncRetryFailed);
  router.get('/passports/sync-report', handleSyncReport);
  router.get('/passports/sync-status', handleSyncStatus);
  
  // n8n Nodes endpoints
  router.get('/flow/nodes', handleN8nNodesList);
  router.get('/flow/nodes/:nodeName', handleN8nNodeDetails);
  router.get('/flow/categories', handleN8nNodeCategories);
  router.get('/flow/icon/*', handleN8nIcon);
  
  // n8n Elasticsearch admin endpoints
  router.post('/flow/admin/reindex', handleN8nNodesReindex);
  router.get('/flow/admin/stats', handleN8nNodesStats);
  router.delete('/flow/admin/index', handleN8nNodesDeleteIndex);
  router.get('/flow/admin/status', handleN8nNodesIndexStatus);
  
  return router;
}

// ============================================================================
// MCP TOOLS API ENDPOINTS (Phase 3.2 Day 4)
// ============================================================================

/**
 * List all available MCP tools
 * GET /tools/list
 */
export async function handleToolsList(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('./mcpRegistry');
    const registry = getMCPRegistry();
    
    const tools = await registry.listTools();
    
    res.json({
      success: true,
      count: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        type: t.type,
        description: t.description,
        status: t.status,
        operations: t.operations.length,
        port: t.port
      })),
      message: `Found ${tools.length} MCP tools`
    });
  } catch (error) {
    console.error('Error in handleToolsList:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// HF SYNC ORCHESTRATOR API ENDPOINTS (Comprehensive Sync)
// ============================================================================

/**
 * Start comprehensive sync of all HuggingFace assets
 * POST /passports/sync-all-hf
 * Body: { types: ['models' | 'datasets' | 'all'], batchSize?: number, concurrency?: number, llmProxyUrl?: string }
 */
export async function handleSyncAllHF(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const {
      types = ['all'],
      batchSize = 100,
      concurrency = 10,
      llmProxyUrl,
      checkpointInterval = 100,
      maxRetries = 3
    } = req.body;

    console.log(`🚀 Starting comprehensive HF sync: ${types.join(', ')}`);

    const orchestrator = getHFSyncOrchestrator(llmProxyUrl);

    // Start sync in background
    orchestrator.startFullSync({
      types,
      batchSize,
      concurrency,
      llmProxyUrl,
      checkpointInterval,
      maxRetries
    }).catch((error) => {
      console.error('Background sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Comprehensive sync started in background',
      config: {
        types,
        batchSize,
        concurrency,
        checkpointInterval
      }
    });
  } catch (error) {
    console.error('Error in handleSyncAllHF:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get current sync progress
 * GET /passports/sync-progress
 */
export async function handleSyncProgress(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const orchestrator = getHFSyncOrchestrator();
    const progress = orchestrator.getProgress();

    res.json({
      success: true,
      progress,
      message: `Overall progress: ${progress.overall.progress}`
    });
  } catch (error) {
    console.error('Error in handleSyncProgress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Resume sync from last checkpoint
 * POST /passports/sync-resume
 * Body: { batchSize?: number, concurrency?: number }
 */
export async function handleSyncResume(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const { batchSize, concurrency, llmProxyUrl } = req.body;

    console.log('🔄 Resuming sync from checkpoint...');

    const orchestrator = getHFSyncOrchestrator(llmProxyUrl);

    // Resume in background
    orchestrator.resume({ batchSize, concurrency, llmProxyUrl }).catch((error) => {
      console.error('Resume failed:', error);
    });

    res.json({
      success: true,
      message: 'Sync resumed from last checkpoint'
    });
  } catch (error) {
    console.error('Error in handleSyncResume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Stop sync gracefully
 * POST /passports/sync-stop
 */
export async function handleSyncStop(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const orchestrator = getHFSyncOrchestrator();
    orchestrator.stop();

    res.json({
      success: true,
      message: 'Sync stop requested, will complete current batch'
    });
  } catch (error) {
    console.error('Error in handleSyncStop:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Retry failed assets
 * POST /passports/sync-retry-failed
 * Body: { maxAttempts?: number, concurrency?: number }
 */
export async function handleSyncRetryFailed(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const { maxAttempts = 3, concurrency = 5 } = req.body;

    const orchestrator = getHFSyncOrchestrator();

    // Retry in background
    orchestrator.retryFailed(maxAttempts, concurrency).catch((error) => {
      console.error('Retry failed:', error);
    });

    res.json({
      success: true,
      message: 'Retrying failed assets in background',
      config: { maxAttempts, concurrency }
    });
  } catch (error) {
    console.error('Error in handleSyncRetryFailed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get detailed sync report
 * GET /passports/sync-report
 */
export async function handleSyncReport(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const orchestrator = getHFSyncOrchestrator();
    const report = orchestrator.generateReport();

    res.json({
      success: true,
      report,
      message: 'Sync report generated'
    });
  } catch (error) {
    console.error('Error in handleSyncReport:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get sync status
 * GET /passports/sync-status
 */
export async function handleSyncStatus(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('./hfSyncOrchestrator');
    
    const orchestrator = getHFSyncOrchestrator();
    const status = orchestrator.getStatus();

    res.json({
      success: true,
      status,
      message: status.isRunning ? 'Sync is running' : 'Sync is idle'
    });
  } catch (error) {
    console.error('Error in handleSyncStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get detailed info for a specific tool
 * GET /tools/:name/info
 */
export async function handleToolInfo(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('./mcpRegistry');
    const { name } = req.params;
    
    const registry = getMCPRegistry();
    const tool = await registry.getTool(name);
    
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: `Tool '${name}' not found in registry`
      });
    }
    
    res.json({
      success: true,
      tool,
      message: `Retrieved info for tool '${name}'`
    });
  } catch (error) {
    console.error('Error in handleToolInfo:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Execute a tool operation
 * POST /tools/execute
 * Body: { tool: string, operation: string, params: object }
 */
export async function handleToolExecute(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('./mcpRegistry');
    const { tool, operation, params } = req.body as {
      tool: string;
      operation: string;
      params: Record<string, any>;
    };
    
    if (!tool || !operation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: tool and operation are required'
      });
    }
    
    const registry = getMCPRegistry();
    const result = await registry.executeTool(tool, operation, params || {});
    
    res.json(result);
  } catch (error) {
    console.error('Error in handleToolExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get MCP registry statistics
 * GET /tools/stats
 */
export async function handleToolsStats(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('./mcpRegistry');
    const registry = getMCPRegistry();
    
    const stats = registry.getStats();
    
    res.json({
      success: true,
      stats,
      message: 'Registry statistics retrieved'
    });
  } catch (error) {
    console.error('Error in handleToolsStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Refresh tool discovery
 * POST /tools/refresh
 */
export async function handleToolsRefresh(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('./mcpRegistry');
    const registry = getMCPRegistry();
    
    await registry.refresh();
    const tools = await registry.listTools();
    
    res.json({
      success: true,
      count: tools.length,
      tools: tools.map(t => ({ name: t.name, status: t.status })),
      message: `Refreshed tool registry - found ${tools.length} tools`
    });
  } catch (error) {
    console.error('Error in handleToolsRefresh:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// N8N NODES API ENDPOINTS
// ============================================================================

/**
 * Reindex all n8n nodes into Elasticsearch
 * POST /flow/admin/reindex
 */
export async function handleN8nNodesReindex(req: express.Request, res: express.Response) {
  try {
    const { getN8nNodeIndexer } = await import('./n8nNodeIndexer');
    const { forceRefresh = false } = req.body;
    
    const indexer = getN8nNodeIndexer();
    const result = await indexer.indexNodes(forceRefresh);

    res.json(result);
  } catch (error) {
    console.error('Error in handleN8nNodesReindex:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get Elasticsearch statistics for n8n nodes
 * GET /flow/admin/stats
 */
export async function handleN8nNodesStats(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('./elasticsearchService');
    
    const esService = getElasticsearchService();
    const stats = await esService.getStats();

    res.json({
      success: true,
      stats,
      message: 'Elasticsearch stats retrieved'
    });
  } catch (error) {
    console.error('Error in handleN8nNodesStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Delete the n8n nodes Elasticsearch index
 * DELETE /flow/admin/index
 */
export async function handleN8nNodesDeleteIndex(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('./elasticsearchService');
    
    const esService = getElasticsearchService();
    await esService.deleteIndex();

    res.json({
      success: true,
      message: 'Index deleted successfully. Run /flow/admin/reindex to rebuild.'
    });
  } catch (error) {
    console.error('Error in handleN8nNodesDeleteIndex:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get n8n node indexer status
 * GET /flow/admin/status
 */
export async function handleN8nNodesIndexStatus(req: express.Request, res: express.Response) {
  try {
    const { getN8nNodeIndexer } = await import('./n8nNodeIndexer');
    const { getElasticsearchService } = await import('./elasticsearchService');
    
    const indexer = getN8nNodeIndexer();
    const esService = getElasticsearchService();
    
    const indexerStatus = indexer.getStatus();
    const esStats = await esService.getStats();

    res.json({
      success: true,
      indexer: indexerStatus,
      elasticsearch: esStats,
      message: 'Index status retrieved'
    });
  } catch (error) {
    console.error('Error in handleN8nNodesIndexStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List all available n8n node types with Elasticsearch support
 * GET /n8n/nodes
 * Query params: category, search, limit, offset, usableAsTool
 */
export async function handleN8nNodesList(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('./elasticsearchService');
    const { getN8nNodeIndexer } = await import('./n8nNodeIndexer');
    
    const { 
      category, 
      search, 
      limit = '100', 
      offset = '0', 
      usableAsTool,
      codexCategory,
      credentialName 
    } = req.query;
    const esService = getElasticsearchService();
    const indexer = getN8nNodeIndexer();

    // Check if Elasticsearch is available and index exists
    if (esService.isAvailable()) {
      // Check if reindexing is needed (e.g., first time or stale cache)
      if (indexer.needsReindex(60)) {
        console.log('🔄 Index needs refresh, triggering background reindex...');
        // Start reindexing in background (don't wait)
        indexer.indexNodes(false).catch(err => {
          console.error('Background reindex failed:', err);
        });
      }

      // Try to search using Elasticsearch
      try {
        const searchResponse = await esService.searchNodes({
          query: search as string,
          category: category as string,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          usableAsTool: usableAsTool === 'true' ? true : usableAsTool === 'false' ? false : undefined,
          codexCategory: codexCategory as string,
          credentialName: credentialName as string,
        });

        return res.json({
          success: true,
          count: searchResponse.results.length,
          total: searchResponse.total,
          nodes: searchResponse.results.map(result => ({
            ...result.node,
            _score: result.score,
            _highlight: result.highlight,
          })),
          facets: searchResponse.facets,
          executionTimeMs: searchResponse.executionTimeMs,
          message: `Retrieved ${searchResponse.results.length} of ${searchResponse.total} n8n node types${category ? ` in category '${category}'` : ''}${search ? ` matching '${search}'` : ''}`,
          source: 'elasticsearch',
        });
      } catch (esError) {
        console.warn('Elasticsearch search failed, falling back to CLI:', esError);
        // Fall through to CLI fallback
      }
    }

    // Fallback: Use CLI approach (original implementation)
    console.log('📋 Using CLI fallback for node listing...');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(
      'docker exec lucid-n8n n8n export:nodes --output=/tmp/nodes.json && docker exec lucid-n8n cat /tmp/nodes.json',
      { maxBuffer: 50 * 1024 * 1024 }
    );
    
    const jsonMatch = stdout.match(/(\[[\s\S]*\])/);
    if (!jsonMatch) {
      throw new Error('Failed to parse nodes JSON from CLI output');
    }
    
    let allNodes = JSON.parse(jsonMatch[1]);
    let nodes = allNodes;
    
    // Apply filters in-memory (fallback)
    if (category && typeof category === 'string') {
      nodes = nodes.filter((node: any) => 
        node.group && node.group.some((g: string) => g.toLowerCase() === category.toLowerCase())
      );
    }
    
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      nodes = nodes.filter((node: any) => 
        node.name?.toLowerCase().includes(searchLower) ||
        node.displayName?.toLowerCase().includes(searchLower) ||
        node.description?.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedNodes = nodes.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      success: true,
      count: paginatedNodes.length,
      total: nodes.length,
      totalAvailable: allNodes.length,
      nodes: paginatedNodes.map((node: any) => ({
        name: node.name,
        displayName: node.displayName,
        description: node.description,
        version: node.version,
        group: node.group,
        icon: node.icon,
        iconUrl: node.iconUrl,
        codex: node.codex,
        usableAsTool: node.usableAsTool,
        inputs: node.inputs,
        outputs: node.outputs,
        properties: node.properties,
        credentials: node.credentials,
        defaults: node.defaults
      })),
      message: `Retrieved ${paginatedNodes.length} of ${nodes.length} n8n node types${category ? ` in category '${category}'` : ''}${search ? ` matching '${search}'` : ''}`,
      source: 'cli-fallback'
    });
  } catch (error) {
    console.error('Error in handleN8nNodesList:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      help: 'Ensure n8n docker container "lucid-n8n" is running and accessible'
    });
  }
}

/**
 * Get detailed information about a specific n8n node type
 * GET /n8n/nodes/:nodeName
 */
export async function handleN8nNodeDetails(req: express.Request, res: express.Response) {
  try {
    const { nodeName } = req.params;
    
    if (!nodeName) {
      return res.status(400).json({
        success: false,
        error: 'Node name is required'
      });
    }
    
    const response = await axios.get(
      `${N8N_URL}/api/v1/node-types`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(N8N_API_KEY && { 'X-N8N-API-KEY': N8N_API_KEY })
        }
      }
    );

    const nodes = response.data || [];
    const node = nodes.find((n: any) => n.name === nodeName);
    
    if (!node) {
      return res.status(404).json({
        success: false,
        error: `Node type '${nodeName}' not found`
      });
    }
    
    res.json({
      success: true,
      node,
      message: `Retrieved details for node '${nodeName}'`
    });
  } catch (error) {
    console.error('Error in handleN8nNodeDetails:', error);
    
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: `n8n API error: ${error.response?.data?.message || error.message}`
      });
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Proxy n8n node icons
 * GET /n8n/icon/*
 * Proxies icon requests to n8n server
 */
export async function handleN8nIcon(req: express.Request, res: express.Response) {
  try {
    // Get the icon path from the URL (everything after /n8n/icon/)
    const iconPath = req.params[0];
    
    if (!iconPath) {
      return res.status(400).json({
        success: false,
        error: 'Icon path is required'
      });
    }
    
    // Fetch icon from n8n server
    const iconUrl = `${N8N_URL}/${iconPath}`;
    const response = await axios.get(iconUrl, {
      responseType: 'arraybuffer',
      headers: {
        ...(N8N_API_KEY && { 'X-N8N-API-KEY': N8N_API_KEY })
      },
      timeout: 5000
    });
    
    // Set appropriate content type
    const contentType = response.headers['content-type'] || 'image/svg+xml';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    res.send(response.data);
  } catch (error) {
    console.error('Error in handleN8nIcon:', error);
    
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).send('Icon not found');
    }
    
    res.status(500).send('Error fetching icon');
  }
}

/**
 * Get n8n node categories
 * GET /n8n/categories
 */
export async function handleN8nNodeCategories(req: express.Request, res: express.Response) {
  try {
    const response = await axios.get(
      `${N8N_URL}/api/v1/node-types`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(N8N_API_KEY && { 'X-N8N-API-KEY': N8N_API_KEY })
        }
      }
    );

    const nodes = response.data || [];
    
    // Extract unique categories and count nodes in each
    const categoryMap = new Map<string, number>();
    nodes.forEach((node: any) => {
      const category = node.group || 'Uncategorized';
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });
    
    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);
    
    res.json({
      success: true,
      count: categories.length,
      categories,
      message: `Retrieved ${categories.length} node categories`
    });
  } catch (error) {
    console.error('Error in handleN8nNodeCategories:', error);
    
    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: `n8n API error: ${error.response?.data?.message || error.message}`
      });
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// PASSPORT API ENDPOINTS
// ============================================================================

/**
 * Register a new passport manually
 * POST /passports/register
 */
export async function handlePassportRegister(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('./passportService');
    const { getContentService } = await import('./contentService');
    
    const passportService = getPassportService();
    const contentService = getContentService();
    
    const {
      assetType,
      slug,
      version,
      contentCid,
      metadataCid,
      licenseCode,
      policyFlags
    } = req.body;

    // Validate required fields
    if (!assetType || !slug || !version) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: assetType, slug, version'
      });
    }

    // Compute content hash if not provided
    const contentHash = contentCid 
      ? contentService.computeContentHash(contentCid)
      : Buffer.alloc(32);

    const result = await passportService.registerPassport({
      assetType,
      slug,
      version,
      contentCid: contentCid || 'QmPending',
      contentHash,
      metadataCid: metadataCid || 'QmPending',
      licenseCode: licenseCode || 'Unknown',
      policyFlags: policyFlags || 0,
    });

    res.json({
      success: true,
      passport: result.passportPDA.toBase58(),
      signature: result.signature,
      message: `Passport registered for ${slug} v${version.major}.${version.minor}.${version.patch}`
    });
  } catch (error) {
    console.error('Error in handlePassportRegister:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get passport details
 * GET /passports/:passportId
 */
export async function handlePassportGet(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('./passportService');
    const { PublicKey } = await import('@solana/web3.js');
    
    const passportService = getPassportService();
    const { passportId } = req.params;

    const passportPDA = new PublicKey(passportId);
    const passport = await passportService.fetchPassport(passportPDA);

    if (!passport) {
      return res.status(404).json({
        success: false,
        error: 'Passport not found'
      });
    }

    res.json({
      success: true,
      passport: {
        address: passportId,
        owner: passport.owner.toBase58(),
        assetType: passport.assetType,
        slug: passport.slug,
        version: passport.version,
        contentCid: passport.contentCid,
        metadataCid: passport.metadataCid,
        licenseCode: passport.licenseCode,
        status: passport.status,
        createdAt: passport.createdAt.toString(),
        updatedAt: passport.updatedAt.toString(),
      }
    });
  } catch (error) {
    console.error('Error in handlePassportGet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get all passports for an owner
 * GET /passports/owner/:owner
 */
export async function handlePassportsByOwner(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('./passportService');
    const { PublicKey } = await import('@solana/web3.js');
    
    const passportService = getPassportService();
    const { owner } = req.params;

    const ownerPubkey = new PublicKey(owner);
    const passports = await passportService.fetchPassportsByOwner(ownerPubkey);

    res.json({
      success: true,
      owner,
      count: passports.length,
      passports: passports.map(p => ({
        address: p.pubkey.toBase58(),
        slug: p.data.slug,
        assetType: p.data.assetType,
        version: p.data.version,
        status: p.data.status,
      }))
    });
  } catch (error) {
    console.error('Error in handlePassportsByOwner:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Sync HuggingFace models to blockchain
 * POST /passports/sync-hf-models
 */
export async function handleSyncHFModels(req: express.Request, res: express.Response) {
  try {
    const { getHFBridgeService } = await import('./hfBridgeService');
    
    const { limit = 5, llmProxyUrl } = req.body;

    console.log(`🔄 Starting HF model sync, limit: ${limit}`);

    const hfBridge = getHFBridgeService(llmProxyUrl);
    const results = await hfBridge.syncModels(limit);

    res.json({
      success: true,
      synced: results.length,
      total: limit,
      models: results,
      message: `Successfully synced ${results.length} models to blockchain`
    });
  } catch (error) {
    console.error('Error in handleSyncHFModels:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Sync HuggingFace datasets to blockchain
 * POST /passports/sync-hf-datasets
 */
export async function handleSyncHFDatasets(req: express.Request, res: express.Response) {
  try {
    const { getHFBridgeService } = await import('./hfBridgeService');
    
    const { limit = 5, llmProxyUrl } = req.body;

    console.log(`🔄 Starting HF dataset sync, limit: ${limit}`);

    const hfBridge = getHFBridgeService(llmProxyUrl);
    const results = await hfBridge.syncDatasets(limit);

    res.json({
      success: true,
      synced: results.length,
      total: limit,
      datasets: results,
      message: `Successfully synced ${results.length} datasets to blockchain`
    });
  } catch (error) {
    console.error('Error in handleSyncHFDatasets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Search passports by type or other criteria
 * GET /passports/search
 */
export async function handlePassportSearch(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('./passportService');
    
    const passportService = getPassportService();
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: type (0=Model, 1=Dataset, etc.)'
      });
    }

    const assetType = parseInt(type as string, 10);
    const passports = await passportService.searchPassportsByType(assetType);

    res.json({
      success: true,
      type: assetType,
      count: passports.length,
      passports: passports.map(p => ({
        address: p.pubkey.toBase58(),
        slug: p.data.slug,
        version: p.data.version,
        owner: p.data.owner.toBase58(),
        status: p.data.status,
      }))
    });
  } catch (error) {
    console.error('Error in handlePassportSearch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
