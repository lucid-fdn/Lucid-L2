// offchain/src/routes/passportRoutes.ts
// REST API routes for Passport CRUD operations

import express from 'express';
import { getPassportManager } from '../../../../engine/src/identity/passport/passportManager';
import type { PassportType, PassportStatus, PassportFilters } from '../../../../engine/src/identity/stores/passportStore';
import { logger } from '../../../../engine/src/shared/lib/logger';

function sanitizeQueryInt(val: any, defaultVal: number, min: number, max: number): number {
  if (val === undefined || val === null) return defaultVal;
  const n = parseInt(String(val), 10);
  if (isNaN(n) || n < min) return min;
  if (n > max) return max;
  return n;
}

function sanitizeSearch(val: any, maxLen: number = 500): string | undefined {
  if (!val || typeof val !== 'string') return undefined;
  return val.slice(0, maxLen);
}

export const passportRouter = express.Router();

// IMPORTANT: Static routes must be defined BEFORE parameterized routes
// to prevent Express from matching 'stats', 'pending-sync' as passport_ids

/**
 * GET /v1/passports/stats
 * Get passport statistics
 */
passportRouter.get('/v1/passports/stats', async (_req, res) => {
  try {
    const manager = getPassportManager();
    
    const [total, models, compute, tools, datasets, agents, active, deprecated, revoked] = await Promise.all([
      manager.getCount(),
      manager.getCount({ type: 'model' }),
      manager.getCount({ type: 'compute' }),
      manager.getCount({ type: 'tool' }),
      manager.getCount({ type: 'dataset' }),
      manager.getCount({ type: 'agent' }),
      manager.getCount({ status: 'active' }),
      manager.getCount({ status: 'deprecated' }),
      manager.getCount({ status: 'revoked' }),
    ]);

    return res.json({
      success: true,
      stats: {
        total,
        by_type: {
          model: models,
          compute,
          tool: tools,
          dataset: datasets,
          agent: agents,
        },
        by_status: {
          active,
          deprecated,
          revoked,
        },
      },
    });
  } catch (error) {
    logger.error('Error in GET /v1/passports/stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/passports/pending-sync
 * Get passports pending on-chain sync
 */
passportRouter.get('/v1/passports/pending-sync', async (_req, res) => {
  try {
    const manager = getPassportManager();
    const passports = await manager.getPendingSync();

    return res.json({
      success: true,
      count: passports.length,
      passports,
    });
  } catch (error) {
    logger.error('Error in GET /v1/passports/pending-sync:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/passports
 * Create a new passport
 * 
 * Body: {
 *   type: 'model' | 'compute' | 'tool' | 'dataset' | 'agent',
 *   owner: string, // Solana or EVM wallet address
 *   metadata: object, // Type-specific metadata (ModelMeta, ComputeMeta, etc.)
 *   name?: string,
 *   description?: string,
 *   version?: string,
 *   tags?: string[]
 * }
 */
passportRouter.post('/v1/passports', async (req, res) => {
  try {
    const { type, owner, metadata, name, description, version, tags, mintNFT } = req.body || {};

    // Basic input validation
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: type',
      });
    }
    if (!owner) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: owner',
      });
    }
    if (!metadata) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: metadata',
      });
    }

    const manager = getPassportManager();
    const result = await manager.createPassport({
      type,
      owner,
      metadata,
      name,
      description,
      version,
      tags,
      mintNFT,
    });

    if (!result.ok) {
      const statusCode = result.error?.includes('schema validation') ? 400 : 422;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        details: result.details,
      });
    }

    return res.status(201).json({
      success: true,
      passport_id: result.data!.passport_id,
      passport: result.data,
    });
  } catch (error) {
    logger.error('Error in POST /v1/passports:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/passports/:passport_id
 * Get a passport by ID
 */
passportRouter.get('/v1/passports/:passport_id', async (req, res) => {
  try {
    const { passport_id } = req.params;

    if (!passport_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing passport_id parameter',
      });
    }

    const manager = getPassportManager();
    const result = await manager.getPassport(passport_id);

    if (!result.ok) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      passport: result.data,
    });
  } catch (error) {
    logger.error('Error in GET /v1/passports/:id:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PATCH /v1/passports/:passport_id/pricing
 * Update only pricing fields on a passport's metadata (convenience endpoint).
 *
 * Body: { price_per_request?, billing_model?, revenue_split?: { compute_bps, model_bps, protocol_bps } }
 * Header: X-Owner-Address (optional)
 */
passportRouter.patch('/v1/passports/:passport_id/pricing', async (req, res) => {
  try {
    const { passport_id } = req.params;
    const ownerAddress = req.headers['x-owner-address'] as string | undefined;
    const pricing = req.body;

    if (!passport_id) {
      return res.status(400).json({ success: false, error: 'Missing passport_id parameter' });
    }
    if (!pricing || typeof pricing !== 'object' || Object.keys(pricing).length === 0) {
      return res.status(400).json({ success: false, error: 'Request body must contain pricing fields' });
    }

    const manager = getPassportManager();
    const result = await manager.updatePricing(passport_id, pricing, ownerAddress);

    if (!result.ok) {
      if (result.error?.includes('not found')) return res.status(404).json({ success: false, error: result.error });
      if (result.error?.includes('Not authorized')) return res.status(403).json({ success: false, error: result.error });
      return res.status(400).json({ success: false, error: result.error, details: result.details });
    }

    return res.json({ success: true, passport: result.data });
  } catch (error) {
    logger.error('Error in PATCH /v1/passports/:id/pricing:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * PATCH /v1/passports/:passport_id/endpoints
 * Update only endpoint fields on a passport's metadata (convenience endpoint).
 *
 * Body: { inference_url?, health_url?, api_base_url? }
 * Header: X-Owner-Address (optional)
 */
passportRouter.patch('/v1/passports/:passport_id/endpoints', async (req, res) => {
  try {
    const { passport_id } = req.params;
    const ownerAddress = req.headers['x-owner-address'] as string | undefined;
    const endpoints = req.body;

    if (!passport_id) {
      return res.status(400).json({ success: false, error: 'Missing passport_id parameter' });
    }
    if (!endpoints || typeof endpoints !== 'object' || Object.keys(endpoints).length === 0) {
      return res.status(400).json({ success: false, error: 'Request body must contain endpoint fields' });
    }

    const manager = getPassportManager();
    const result = await manager.updateEndpoints(passport_id, endpoints, ownerAddress);

    if (!result.ok) {
      if (result.error?.includes('not found')) return res.status(404).json({ success: false, error: result.error });
      if (result.error?.includes('Not authorized')) return res.status(403).json({ success: false, error: result.error });
      return res.status(400).json({ success: false, error: result.error, details: result.details });
    }

    return res.json({ success: true, passport: result.data });
  } catch (error) {
    logger.error('Error in PATCH /v1/passports/:id/endpoints:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * PATCH /v1/passports/:passport_id
 * Update a passport
 *
 * Body: {
 *   metadata?: object,
 *   name?: string,
 *   description?: string,
 *   version?: string,
 *   tags?: string[],
 *   status?: 'active' | 'deprecated' | 'revoked'
 * }
 *
 * Header: X-Owner-Address (optional) - for ownership verification
 */
passportRouter.patch('/v1/passports/:passport_id', async (req, res) => {
  try {
    const { passport_id } = req.params;
    const { metadata, name, description, version, tags, status } = req.body || {};
    const ownerAddress = req.headers['x-owner-address'] as string | undefined;

    if (!passport_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing passport_id parameter',
      });
    }

    // At least one field should be provided
    if (!metadata && !name && !description && !version && !tags && !status) {
      return res.status(400).json({
        success: false,
        error: 'No update fields provided',
      });
    }

    const manager = getPassportManager();
    const result = await manager.updatePassport(
      passport_id,
      { metadata, name, description, version, tags, status },
      ownerAddress
    );

    if (!result.ok) {
      if (result.error?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }
      if (result.error?.includes('Not authorized')) {
        return res.status(403).json({
          success: false,
          error: result.error,
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details,
      });
    }

    return res.json({
      success: true,
      passport: result.data,
    });
  } catch (error) {
    logger.error('Error in PATCH /v1/passports/:id:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * DELETE /v1/passports/:passport_id
 * Delete a passport (soft delete - sets status to revoked)
 * 
 * Header: X-Owner-Address (optional) - for ownership verification
 */
passportRouter.delete('/v1/passports/:passport_id', async (req, res) => {
  try {
    const { passport_id } = req.params;
    const ownerAddress = req.headers['x-owner-address'] as string | undefined;

    if (!passport_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing passport_id parameter',
      });
    }

    const manager = getPassportManager();
    const result = await manager.deletePassport(passport_id, ownerAddress);

    if (!result.ok) {
      if (result.error?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }
      if (result.error?.includes('Not authorized')) {
        return res.status(403).json({
          success: false,
          error: result.error,
        });
      }
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    logger.error('Error in DELETE /v1/passports/:id:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/passports
 * List passports with filtering and pagination
 * 
 * Query params:
 *   type: string | string[] - Filter by passport type(s)
 *   owner: string - Filter by owner address
 *   status: string | string[] - Filter by status
 *   tags: string (comma-separated) - Filter by tags
 *   tag_match: 'all' | 'any' - Tag matching mode (default: all)
 *   search: string - Full-text search on name/description
 *   page: number - Page number (default: 1)
 *   per_page: number - Results per page (default: 20, max: 100)
 *   sort_by: 'created_at' | 'updated_at' | 'name'
 *   sort_order: 'asc' | 'desc'
 */
passportRouter.get('/v1/passports', async (req, res) => {
  try {
    const {
      type,
      owner,
      status,
      tags,
      tag_match,
      search,
      page,
      per_page,
      sort_by,
      sort_order,
    } = req.query;

    // Build filters
    const filters: PassportFilters = {};

    // Type filter
    if (type) {
      if (typeof type === 'string' && type.includes(',')) {
        filters.type = type.split(',').map(t => t.trim()) as PassportType[];
      } else if (Array.isArray(type)) {
        filters.type = type as PassportType[];
      } else {
        filters.type = type as PassportType;
      }
    }

    // Owner filter
    if (owner && typeof owner === 'string') {
      filters.owner = owner;
    }

    // Status filter
    if (status) {
      if (typeof status === 'string' && status.includes(',')) {
        filters.status = status.split(',').map(s => s.trim()) as PassportStatus[];
      } else if (Array.isArray(status)) {
        filters.status = status as PassportStatus[];
      } else {
        filters.status = status as PassportStatus;
      }
    }

    // Tags filter
    if (tags && typeof tags === 'string') {
      filters.tags = tags.split(',').map(t => t.trim());
    }

    // Tag match mode
    if (tag_match === 'any' || tag_match === 'all') {
      filters.tag_match = tag_match;
    }

    // Search
    const sanitizedSearch = sanitizeSearch(search);
    if (sanitizedSearch) {
      filters.search = sanitizedSearch;
    }

    // Pagination
    if (page !== undefined) {
      filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    }
    if (per_page !== undefined) {
      filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);
    }

    // Sorting
    if (sort_by === 'created_at' || sort_by === 'updated_at' || sort_by === 'name') {
      filters.sort_by = sort_by;
    }
    if (sort_order === 'asc' || sort_order === 'desc') {
      filters.sort_order = sort_order;
    }

    const manager = getPassportManager();
    const result = await manager.listPassports(filters);

    return res.json({
      success: true,
      passports: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/passports:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/models
 * Search model passports with ModelMeta-specific filters
 * 
 * Query params:
 *   runtime: string - Filter by recommended runtime (vllm, tgi, tensorrt)
 *   format: string - Filter by format (safetensors, gguf)
 *   max_vram: number - Filter by max VRAM requirement
 *   owner: string - Filter by owner address
 *   tags: string (comma-separated) - Filter by tags
 *   search: string - Full-text search
 *   page: number - Page number
 *   per_page: number - Results per page
 */
passportRouter.get('/v1/models', async (req, res) => {
  try {
    const {
      runtime,
      format,
      max_vram,
      available,
      owner,
      tags,
      search,
      page,
      per_page,
    } = req.query;

    const filters: any = {};

    if (runtime && typeof runtime === 'string') {
      filters.runtime = runtime;
    }
    if (format && typeof format === 'string') {
      filters.format = format;
    }
    if (max_vram) {
      const vram = parseInt(max_vram as string, 10);
      if (!isNaN(vram)) {
        filters.max_vram = vram;
      }
    }
    if (available === 'true') {
      filters.available = true;
    } else if (available === 'false') {
      filters.available = false;
    }
    if (owner && typeof owner === 'string') {
      filters.owner = owner;
    }
    if (tags && typeof tags === 'string') {
      filters.tags = tags.split(',').map(t => t.trim());
    }
    const modelSearch = sanitizeSearch(search);
    if (modelSearch) {
      filters.search = modelSearch;
    }
    if (page !== undefined) {
      filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    }
    if (per_page !== undefined) {
      filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);
    }

    const manager = getPassportManager();
    const result = await manager.searchModels(filters);

    return res.json({
      success: true,
      models: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/models:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/compute
 * Search compute passports with ComputeMeta-specific filters
 * 
 * Query params:
 *   regions: string (comma-separated) - Filter by regions
 *   runtimes: string (comma-separated) - Filter by supported runtimes
 *   provider_type: string - Filter by provider type (depin, cloud, onprem)
 *   min_vram: number - Filter by minimum VRAM
 *   gpu: string - Filter by GPU (partial match)
 *   owner: string - Filter by owner address
 *   tags: string (comma-separated) - Filter by tags
 *   search: string - Full-text search
 *   page: number - Page number
 *   per_page: number - Results per page
 */
passportRouter.get('/v1/compute', async (req, res) => {
  try {
    const {
      regions,
      runtimes,
      provider_type,
      min_vram,
      gpu,
      owner,
      tags,
      search,
      page,
      per_page,
    } = req.query;

    const filters: any = {};

    if (regions && typeof regions === 'string') {
      filters.regions = regions.split(',').map(r => r.trim());
    }
    if (runtimes && typeof runtimes === 'string') {
      filters.runtimes = runtimes.split(',').map(r => r.trim());
    }
    if (provider_type && typeof provider_type === 'string') {
      filters.provider_type = provider_type;
    }
    if (min_vram) {
      const vram = parseInt(min_vram as string, 10);
      if (!isNaN(vram)) {
        filters.min_vram_gb = vram;
      }
    }
    if (gpu && typeof gpu === 'string') {
      filters.gpu = gpu;
    }
    if (owner && typeof owner === 'string') {
      filters.owner = owner;
    }
    if (tags && typeof tags === 'string') {
      filters.tags = tags.split(',').map(t => t.trim());
    }
    const computeSearch = sanitizeSearch(search);
    if (computeSearch) {
      filters.search = computeSearch;
    }
    if (page !== undefined) {
      filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    }
    if (per_page !== undefined) {
      filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);
    }

    const manager = getPassportManager();
    const result = await manager.searchCompute(filters);

    return res.json({
      success: true,
      compute: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/compute:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/passports/:passport_id/sync
 * Manually trigger on-chain sync for a passport
 */
passportRouter.post('/v1/passports/:passport_id/sync', async (req, res) => {
  try {
    const { passport_id } = req.params;

    if (!passport_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing passport_id parameter',
      });
    }

    const manager = getPassportManager();
    const result = await manager.syncToChain(passport_id);

    if (!result.ok) {
      if (result.error?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }
      if (result.error?.includes('No on-chain sync handler')) {
        return res.status(503).json({
          success: false,
          error: 'On-chain sync not available',
        });
      }
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      on_chain_pda: result.data!.pda,
      on_chain_tx: result.data!.tx,
    });
  } catch (error) {
    logger.error('Error in POST /v1/passports/:id/sync:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Stub endpoints for future passport types
/**
 * GET /v1/tools - List tool passports (stub)
 */
passportRouter.get('/v1/tools', async (req, res) => {
  try {
    const { owner, tags, search, page, per_page } = req.query;
    
    const filters: PassportFilters = { type: 'tool', status: 'active' };
    if (owner && typeof owner === 'string') filters.owner = owner;
    if (tags && typeof tags === 'string') filters.tags = tags.split(',').map(t => t.trim());
    const toolSearch = sanitizeSearch(search);
    if (toolSearch) filters.search = toolSearch;
    if (page !== undefined) filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    if (per_page !== undefined) filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);

    const manager = getPassportManager();
    const result = await manager.listPassports(filters);

    return res.json({
      success: true,
      tools: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/tools:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/datasets - List dataset passports (stub)
 */
passportRouter.get('/v1/datasets', async (req, res) => {
  try {
    const { owner, tags, search, page, per_page } = req.query;
    
    const filters: PassportFilters = { type: 'dataset', status: 'active' };
    if (owner && typeof owner === 'string') filters.owner = owner;
    if (tags && typeof tags === 'string') filters.tags = tags.split(',').map(t => t.trim());
    const datasetSearch = sanitizeSearch(search);
    if (datasetSearch) filters.search = datasetSearch;
    if (page !== undefined) filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    if (per_page !== undefined) filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);

    const manager = getPassportManager();
    const result = await manager.listPassports(filters);

    return res.json({
      success: true,
      datasets: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/datasets:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents - List agent passports (stub)
 */
passportRouter.get('/v1/agents', async (req, res) => {
  try {
    const { owner, tags, search, page, per_page } = req.query;
    
    const filters: PassportFilters = { type: 'agent', status: 'active' };
    if (owner && typeof owner === 'string') filters.owner = owner;
    if (tags && typeof tags === 'string') filters.tags = tags.split(',').map(t => t.trim());
    const agentSearch = sanitizeSearch(search);
    if (agentSearch) filters.search = agentSearch;
    if (page !== undefined) filters.page = sanitizeQueryInt(page, 1, 1, 10000);
    if (per_page !== undefined) filters.per_page = sanitizeQueryInt(per_page, 20, 1, 100);

    const manager = getPassportManager();
    const result = await manager.listPassports(filters);

    return res.json({
      success: true,
      agents: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in GET /v1/agents:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
