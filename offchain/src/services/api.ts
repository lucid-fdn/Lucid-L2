// offchain/src/services/api.ts
import express from 'express';
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
 * Plan and execute a workflow in one call
 * POST /agents/accomplish
 * Body: { goal: string, context: object }
 */
export async function handleAgentAccomplish(req: express.Request, res: express.Response) {
  try {
    const { goal, context } = req.body as {
      goal: string;
      context: Record<string, any>;
    };

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: goal is required and must be a string'
      });
    }

    if (!context || !context.tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: context with tenantId is required'
      });
    }

    const { getAgentPlanner } = await import('./agentPlanner');
    const planner = getAgentPlanner();
    
    // Check if service is healthy
    const isHealthy = await planner.health();
    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'CrewAI planner service is not available. Please ensure it is running on port 8082.'
      });
    }

    console.log(`🎯 Agent: Accomplishing goal: ${goal}`);

    // Step 1: Plan workflow
    const planResponse = await planner.planWorkflow({ goal, context });
    console.log(`📋 Generated FlowSpec with ${planResponse.flowspec.nodes.length} nodes`);

    // Step 2: Create and execute workflow
    const service = getFlowSpecService();
    const workflowResult = await service.createWorkflow(planResponse.flowspec);
    
    const executionContext: FlowExecutionContext = {
      tenantId: context.tenantId,
      variables: context
    };

    const executionResult = await service.executeWorkflow(workflowResult.id, executionContext);
    console.log(`✅ Execution complete: ${executionResult.success}`);

    res.json({
      success: true,
      goal,
      flowspec: planResponse.flowspec,
      reasoning: planResponse.reasoning,
      complexity: planResponse.estimated_complexity,
      workflowId: workflowResult.id,
      workflowUrl: workflowResult.url,
      executionResult,
      timestamp: Date.now(),
      message: 'Goal accomplished successfully'
    });
  } catch (error) {
    console.error('Error in handleAgentAccomplish:', error);
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
  router.post('/agents/validate', handleAgentValidate);
  router.get('/agents/planner/info', handleAgentPlannerInfo);
  
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
