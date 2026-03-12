import express from 'express';
import axios from 'axios';
import { N8N_URL, N8N_API_KEY } from '../../../../engine/src/config/config';
import { logger } from '../../../../engine/src/lib/logger';

export const n8nFlowApiRouter = express.Router();

/**
 * List all available n8n node types with Elasticsearch support
 * GET /nodes
 * Query params: category, search, limit, offset, usableAsTool
 */
async function handleN8nNodesList(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('../../../../contrib/integrations/n8n/elasticsearchService');
    const { getN8nNodeIndexer } = await import('../../../../contrib/integrations/n8n/n8nNodeIndexer');

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
      const indexerStatus = indexer.getStatus();

      // Check if reindexing is needed and not already in progress
      if (indexer.needsReindex(60) && !indexerStatus.isIndexing && indexerStatus.cooldownRemaining === 0) {
        logger.info('🔄 Index needs refresh, triggering background reindex...');
        // Start reindexing in background (don't wait)
        indexer.indexNodes(false).catch(err => {
          logger.error('Background reindex failed:', err);
        });
      } else if (indexerStatus.isIndexing) {
        logger.info('⏳ Reindex already in progress, skipping...');
      } else if (indexerStatus.cooldownRemaining > 0) {
        logger.info(`⏱️  Reindex cooldown active (${Math.ceil(indexerStatus.cooldownRemaining / 1000)}s remaining), skipping...`);
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
        logger.warn('Elasticsearch search failed, falling back to CLI:', esError);
        // Fall through to CLI fallback
      }
    }

    // Fallback: Use CLI approach (original implementation)
    logger.info('📋 Using CLI fallback for node listing...');
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

    const allNodes = JSON.parse(jsonMatch[1]);
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
    logger.error('Error in handleN8nNodesList:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      help: 'Ensure n8n docker container "lucid-n8n" is running and accessible'
    });
  }
}

/**
 * Get detailed information about a specific n8n node type
 * GET /nodes/:nodeName
 */
async function handleN8nNodeDetails(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleN8nNodeDetails:', error);

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
 * GET /icon/*
 * Proxies icon requests to n8n server
 */
async function handleN8nIcon(req: express.Request, res: express.Response) {
  try {
    // Get the icon path from the URL (everything after /icon/)
    const iconPath = req.params[0];

    if (!iconPath) {
      return res.status(400).json({
        success: false,
        error: 'Icon path is required'
      });
    }

    // Restore the n8n prefix that was masked in the indexer
    // Handle two patterns:
    // 1. "nodes-langchain/..." -> "icons/@n8n/n8n-nodes-langchain/..."
    // 2. "nodes-base/..." -> "icons/n8n-nodes-base/..."
    let fullIconPath: string;
    if (iconPath.startsWith('icons/')) {
      // Already has full path, use as-is
      fullIconPath = iconPath;
    } else if (iconPath.startsWith('nodes-base/') || iconPath.startsWith('nodes-builtin/')) {
      // Plain n8n- package (pattern 2)
      fullIconPath = `icons/n8n-${iconPath}`;
    } else {
      // @n8n scoped package (pattern 1)
      fullIconPath = `icons/@n8n/n8n-${iconPath}`;
    }

    // Fetch icon from n8n server
    const iconUrl = `${N8N_URL}/${fullIconPath}`;
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
    logger.error('Error in handleN8nIcon:', error);

    if (axios.isAxiosError(error)) {
      return res.status(error.response?.status || 500).send('Icon not found');
    }

    res.status(500).send('Error fetching icon');
  }
}

/**
 * Get n8n node categories
 * GET /categories
 */
async function handleN8nNodeCategories(req: express.Request, res: express.Response) {
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
    logger.error('Error in handleN8nNodeCategories:', error);

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
 * Reindex all n8n nodes into Elasticsearch
 * POST /admin/reindex
 */
async function handleN8nNodesReindex(req: express.Request, res: express.Response) {
  try {
    const { getN8nNodeIndexer } = await import('../../../../contrib/integrations/n8n/n8nNodeIndexer');
    const { forceRefresh = false } = req.body;

    const indexer = getN8nNodeIndexer();
    const result = await indexer.indexNodes(forceRefresh);

    res.json(result);
  } catch (error) {
    logger.error('Error in handleN8nNodesReindex:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get Elasticsearch statistics for n8n nodes
 * GET /admin/stats
 */
async function handleN8nNodesStats(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('../../../../contrib/integrations/n8n/elasticsearchService');

    const esService = getElasticsearchService();
    const stats = await esService.getStats();

    res.json({
      success: true,
      stats,
      message: 'Elasticsearch stats retrieved'
    });
  } catch (error) {
    logger.error('Error in handleN8nNodesStats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Delete the n8n nodes Elasticsearch index
 * DELETE /admin/index
 */
async function handleN8nNodesDeleteIndex(req: express.Request, res: express.Response) {
  try {
    const { getElasticsearchService } = await import('../../../../contrib/integrations/n8n/elasticsearchService');

    const esService = getElasticsearchService();
    await esService.deleteIndex();

    res.json({
      success: true,
      message: 'Index deleted successfully. Run /flow/admin/reindex to rebuild.'
    });
  } catch (error) {
    logger.error('Error in handleN8nNodesDeleteIndex:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get n8n node indexer status
 * GET /admin/status
 */
async function handleN8nNodesIndexStatus(req: express.Request, res: express.Response) {
  try {
    const { getN8nNodeIndexer } = await import('../../../../contrib/integrations/n8n/n8nNodeIndexer');
    const { getElasticsearchService } = await import('../../../../contrib/integrations/n8n/elasticsearchService');

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
    logger.error('Error in handleN8nNodesIndexStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Mount routes — parent will mount this at /flow
n8nFlowApiRouter.get('/nodes', handleN8nNodesList);
n8nFlowApiRouter.get('/nodes/:nodeName', handleN8nNodeDetails);
n8nFlowApiRouter.get('/categories', handleN8nNodeCategories);
n8nFlowApiRouter.get('/icon/*', handleN8nIcon);

// n8n Elasticsearch admin endpoints
n8nFlowApiRouter.post('/admin/reindex', handleN8nNodesReindex);
n8nFlowApiRouter.get('/admin/stats', handleN8nNodesStats);
n8nFlowApiRouter.delete('/admin/index', handleN8nNodesDeleteIndex);
n8nFlowApiRouter.get('/admin/status', handleN8nNodesIndexStatus);
