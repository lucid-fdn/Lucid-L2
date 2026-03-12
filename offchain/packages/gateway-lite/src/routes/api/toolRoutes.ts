import express from 'express';
import { logger } from '../../../../engine/src/lib/logger';

export const toolApiRouter = express.Router();

/**
 * List all available MCP tools
 * GET /list
 */
async function handleToolsList(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('../../integrations/mcp/mcpRegistry');
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
    logger.error('Error in handleToolsList:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get detailed info for a specific tool
 * GET /:name/info
 */
async function handleToolInfo(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('../../integrations/mcp/mcpRegistry');
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
    logger.error('Error in handleToolInfo:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Execute a tool operation
 * POST /execute
 * Body: { tool: string, operation: string, params: object }
 */
async function handleToolExecute(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('../../integrations/mcp/mcpRegistry');
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
    logger.error('Error in handleToolExecute:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get MCP registry statistics
 * GET /stats
 */
async function handleToolsStats(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('../../integrations/mcp/mcpRegistry');
    const registry = getMCPRegistry();

    const stats = registry.getStats();

    res.json({
      success: true,
      stats,
      message: 'Registry statistics retrieved'
    });
  } catch (error) {
    logger.error('Error in handleToolsStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Refresh tool discovery
 * POST /refresh
 */
async function handleToolsRefresh(req: express.Request, res: express.Response) {
  try {
    const { getMCPRegistry } = await import('../../integrations/mcp/mcpRegistry');
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
    logger.error('Error in handleToolsRefresh:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

toolApiRouter.get('/list', handleToolsList);
toolApiRouter.get('/:name/info', handleToolInfo);
toolApiRouter.post('/execute', handleToolExecute);
toolApiRouter.get('/stats', handleToolsStats);
toolApiRouter.post('/refresh', handleToolsRefresh);
