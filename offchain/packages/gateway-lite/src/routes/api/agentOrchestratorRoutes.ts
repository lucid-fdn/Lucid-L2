import express from 'express';
import { getMMRService, AgentEpochData } from '../../../../engine/src/epoch/services/mmrService';
import { FlowSpec, FlowExecutionContext } from '../../../../contrib/integrations/flowspec/types';
import { logger } from '../../../../engine/src/shared/lib/logger';

export const agentOrchestratorApiRouter = express.Router();

// ============================================================================
// AI AGENT API ENDPOINTS
// ============================================================================

/**
 * Initialize or load an AI agent
 * POST /init
 * Body: { agentId: string, depinCid?: string }
 */
async function handleAgentInit(req: express.Request, res: express.Response) {
  try {
    const { agentId, depinCid } = req.body as { agentId: string; depinCid?: string };

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: agentId is required and must be a string'
      });
    }

    const mmrService = getMMRService();
    const agent = await mmrService.initializeAgent(agentId, depinCid);

    const stats = await mmrService.getAgentStats(agentId);

    res.json({
      success: true,
      agentId,
      initialized: true,
      stats,
      message: depinCid ? `Agent loaded from DePIN: ${depinCid}` : 'New agent initialized'
    });
  } catch (error) {
    logger.error('Error in handleAgentInit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process an epoch for an AI agent
 * POST /epoch
 * Body: { agentId: string, vectors: string[], epochNumber?: number }
 */
async function handleAgentEpoch(req: express.Request, res: express.Response) {
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
      depinCid: result.depinCid,
      transactionSignature: result.transactionSignature,
      gasCost: result.gasCost,
      message: `Epoch ${finalEpochNumber} processed successfully for agent ${agentId}`
    });
  } catch (error) {
    logger.error('Error in handleAgentEpoch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process multiple epochs in batch for one or more agents
 * POST /batch-epochs
 * Body: { epochs: Array<{ agentId: string, vectors: string[], epochNumber?: number }> }
 */
async function handleAgentBatchEpochs(req: express.Request, res: express.Response) {
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
        depinCid: r.depinCid,
        transactionSignature: r.transactionSignature,
        gasCost: r.gasCost
      })),
      totalGasCost,
      message: `Successfully processed ${results.length} epochs across ${new Set(validEpochs.map(e => e.agentId)).size} agents`
    });
  } catch (error) {
    logger.error('Error in handleAgentBatchEpochs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate proof of contribution for a specific vector
 * POST /proof
 * Body: { agentId: string, vectorText: string, epochNumber: number }
 */
async function handleAgentProof(req: express.Request, res: express.Response) {
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

    logger.info(`🔍 API: Proof request for agent ${agentId}, epoch ${epochNumber}, vector: "${vectorText}"`);

    const proofResult = await mmrService.generateContributionProof(agentId, vectorText, epochNumber);

    if (!proofResult) {
      logger.info(`❌ API: No proof result returned from MMR service`);
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
    logger.error('Error in handleAgentProof:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent statistics and current status
 * GET /:agentId/stats
 */
async function handleAgentStats(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleAgentStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent's MMR root history
 * GET /:agentId/history
 */
async function handleAgentHistory(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleAgentHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get current MMR root for an agent
 * GET /:agentId/root
 */
async function handleAgentCurrentRoot(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleAgentCurrentRoot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List all registered agents
 * GET /
 */
async function handleListAgents(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleListAgents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Verify MMR integrity for an agent
 * GET /:agentId/verify
 */
async function handleAgentVerify(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleAgentVerify:', error);
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
 * POST /plan
 * Body: { goal: string, context?: object, constraints?: string[], autoExecute?: boolean }
 */
async function handleAgentPlan(req: express.Request, res: express.Response) {
  try {
    const { getAgentPlanner } = await import('../../agent/agentPlanner');
    const { FlowSpecService } = await import('../../../../contrib/integrations/flowspec/flowspecService');
    const { N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY } = await import('../../../../engine/src/shared/config/config');
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
      const service = new FlowSpecService(N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY);
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
    logger.error('Error in handleAgentPlan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Plan and execute a workflow in one call (PHASE 3.4 - Agent Orchestrator)
 * POST /accomplish
 * Body: { goal: string, context?: object, preferredExecutor?: 'n8n' | 'langgraph', dryRun?: boolean }
 */
async function handleAgentAccomplish(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('../../agent/agentOrchestrator');
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
    logger.error('Error in handleAgentAccomplish:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Preview a workflow without executing it (dry run)
 * POST /accomplish/preview
 * Body: { goal: string, context?: object }
 */
async function handleAgentAccomplishPreview(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('../../agent/agentOrchestrator');
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
    logger.error('Error in handleAgentAccomplishPreview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent execution history for a tenant
 * GET /history/:tenantId
 */
async function handleAgentOrchestratorHistory(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('../../agent/agentOrchestrator');
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
    logger.error('Error in handleAgentOrchestratorHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Health check for agent orchestrator
 * GET /orchestrator/health
 */
async function handleAgentOrchestratorHealth(req: express.Request, res: express.Response) {
  try {
    const { getAgentOrchestrator } = await import('../../agent/agentOrchestrator');
    const orchestrator = getAgentOrchestrator();

    const health = await orchestrator.healthCheck();

    res.json({
      success: health.healthy,
      health,
      message: health.healthy ? 'All agent services operational' : 'Some agent services unavailable'
    });
  } catch (error) {
    logger.error('Error in handleAgentOrchestratorHealth:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validate a FlowSpec structure
 * POST /validate
 * Body: FlowSpec
 */
async function handleAgentValidate(req: express.Request, res: express.Response) {
  try {
    const flowspec: FlowSpec = req.body;

    if (!flowspec) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: FlowSpec is required'
      });
    }

    const { getAgentPlanner } = await import('../../agent/agentPlanner');
    const planner = getAgentPlanner();

    const validation = await planner.validateFlowSpec(flowspec);

    res.json({
      success: validation.valid,
      validation,
      message: validation.valid ? 'FlowSpec is valid' : 'FlowSpec validation failed'
    });
  } catch (error) {
    logger.error('Error in handleAgentValidate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get agent planner service info
 * GET /planner/info
 */
async function handleAgentPlannerInfo(req: express.Request, res: express.Response) {
  try {
    const { getAgentPlanner } = await import('../../agent/agentPlanner');
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
    logger.error('Error in handleAgentPlannerInfo:', error);
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
 * POST /execute
 * Body: { flowspec: FlowSpec, context: FlowExecutionContext, executor?: 'n8n' | 'langgraph' }
 */
async function handleAgentExecute(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('../../agent/executorRouter');
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
    logger.error('Error in handleAgentExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Check executor health
 * GET /executor/health
 */
async function handleExecutorHealth(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('../../agent/executorRouter');
    const router = getExecutorRouter();

    const health = await router.checkExecutorHealth();

    res.json({
      success: true,
      executors: health,
      message: `n8n: ${health.n8n ? 'healthy' : 'unavailable'}, LangGraph: ${health.langgraph ? 'healthy' : 'unavailable'}`
    });
  } catch (error) {
    logger.error('Error in handleExecutorHealth:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get executor decision for a FlowSpec without executing
 * POST /executor/decision
 * Body: { flowspec: FlowSpec }
 */
async function handleExecutorDecision(req: express.Request, res: express.Response) {
  try {
    const { getExecutorRouter } = await import('../../agent/executorRouter');
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
    logger.error('Error in handleExecutorDecision:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Mount routes — parent will mount this at /agents
agentOrchestratorApiRouter.post('/init', handleAgentInit);
agentOrchestratorApiRouter.post('/epoch', handleAgentEpoch);
agentOrchestratorApiRouter.post('/batch-epochs', handleAgentBatchEpochs);
agentOrchestratorApiRouter.post('/proof', handleAgentProof);
agentOrchestratorApiRouter.get('/:agentId/stats', handleAgentStats);
agentOrchestratorApiRouter.get('/:agentId/history', handleAgentHistory);
agentOrchestratorApiRouter.get('/:agentId/root', handleAgentCurrentRoot);
agentOrchestratorApiRouter.get('/:agentId/verify', handleAgentVerify);
agentOrchestratorApiRouter.get('/', handleListAgents);

// Agent Planner endpoints (Phase 3)
agentOrchestratorApiRouter.post('/plan', handleAgentPlan);
agentOrchestratorApiRouter.post('/accomplish', handleAgentAccomplish);
agentOrchestratorApiRouter.post('/accomplish/preview', handleAgentAccomplishPreview);
agentOrchestratorApiRouter.get('/history/:tenantId', handleAgentOrchestratorHistory);
agentOrchestratorApiRouter.get('/orchestrator/health', handleAgentOrchestratorHealth);
agentOrchestratorApiRouter.post('/execute', handleAgentExecute);
agentOrchestratorApiRouter.post('/validate', handleAgentValidate);
agentOrchestratorApiRouter.get('/planner/info', handleAgentPlannerInfo);
agentOrchestratorApiRouter.get('/executor/health', handleExecutorHealth);
agentOrchestratorApiRouter.post('/executor/decision', handleExecutorDecision);
