import express from 'express';
import { FlowSpecService } from '../../../../contrib/integrations/flowspec/flowspecService';
import { FlowSpec, FlowExecutionContext } from '../../../../contrib/integrations/flowspec/types';
import { N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY } from '../../../../engine/src/config/config';
import { logger } from '../../../../engine/src/lib/logger';

export const flowspecApiRouter = express.Router();

let flowspecService: FlowSpecService | null = null;

function getFlowSpecService(): FlowSpecService {
  if (!flowspecService) {
    flowspecService = new FlowSpecService(N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY);
  }
  return flowspecService;
}

/**
 * Create a new workflow from FlowSpec DSL
 * POST /create
 * Body: FlowSpec
 */
async function handleFlowSpecCreate(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecCreate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Execute a workflow
 * POST /execute
 * Body: { workflowId: string, context: FlowExecutionContext }
 */
async function handleFlowSpecExecute(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get workflow execution history
 * GET /history/:workflowId
 */
async function handleFlowSpecHistory(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecHistory:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update an existing workflow
 * PUT /update/:workflowId
 * Body: FlowSpec
 */
async function handleFlowSpecUpdate(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecUpdate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Delete a workflow
 * DELETE /delete/:workflowId
 */
async function handleFlowSpecDelete(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecDelete:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * List all workflows
 * GET /list
 */
async function handleFlowSpecList(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleFlowSpecList:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

flowspecApiRouter.post('/create', handleFlowSpecCreate);
flowspecApiRouter.post('/execute', handleFlowSpecExecute);
flowspecApiRouter.get('/history/:workflowId', handleFlowSpecHistory);
flowspecApiRouter.put('/update/:workflowId', handleFlowSpecUpdate);
flowspecApiRouter.delete('/delete/:workflowId', handleFlowSpecDelete);
flowspecApiRouter.get('/list', handleFlowSpecList);
