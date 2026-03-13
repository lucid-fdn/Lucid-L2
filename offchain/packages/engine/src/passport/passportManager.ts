// offchain/src/services/passportManager.ts
// Passport management service with schema validation and on-chain sync

import {
  PassportStore,
  Passport,
  PassportType,
  PassportStatus,
  PassportFilters,
  PaginatedResult,
  getPassportStore,
} from '../storage/passportStore';
import { validateWithSchema, SchemaId } from '../crypto/schemaValidator';
import { logger } from '../lib/logger';

/**
 * Compute availability checker — injected by gateway-lite to avoid circular dependency.
 * Signature: (modelMeta, computeCatalog) => boolean
 */
export type ComputeAvailabilityChecker = (modelMeta: any, computeCatalog: any[]) => boolean;

/**
 * Model catalog lookup — injected by gateway-lite to avoid circular dependency.
 * Keyed by model ID, returns catalog entry or undefined.
 */
export type ModelCatalogLookup = Record<string, any>;

// =============================================================================
// TRUSTGATE CATALOG VALIDATION
// =============================================================================

const TRUSTGATE_URL = process.env.TRUSTGATE_URL || 'https://trustgate-api-production.up.railway.app';
let trustgateCatalogCache: { models: Set<string>; expires: number } | null = null;
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTrustGateCatalog(): Promise<Set<string>> {
  if (trustgateCatalogCache && Date.now() < trustgateCatalogCache.expires) {
    return trustgateCatalogCache.models;
  }

  try {
    const response = await fetch(`${TRUSTGATE_URL}/v1/models`);
    if (!response.ok) {
      logger.warn('TrustGate catalog check failed:', response.status);
      return new Set();
    }
    const data = await response.json();
    const models = new Set<string>(
      (data.data || []).map((m: { id: string }) => m.id)
    );
    trustgateCatalogCache = { models, expires: Date.now() + CATALOG_CACHE_TTL };
    return models;
  } catch (error) {
    logger.warn('TrustGate catalog unreachable:', error);
    return new Set();
  }
}

/** Full catalog entry from TrustGate/LiteLLM */
interface TrustGateCatalogEntry {
  id: string;
  owned_by?: string;
}

/** Get full catalog with model details from TrustGate */
async function getTrustGateCatalogFull(): Promise<TrustGateCatalogEntry[]> {
  try {
    const response = await fetch(`${TRUSTGATE_URL}/v1/models`);
    if (!response.ok) {
      logger.warn('TrustGate catalog fetch failed:', response.status);
      return [];
    }
    const data = await response.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      owned_by: m.owned_by,
    }));
  } catch (error) {
    logger.warn('TrustGate catalog unreachable:', error);
    return [];
  }
}

/** Derive provider from model name prefix */
function deriveProvider(modelId: string): string {
  const id = modelId.toLowerCase();
  if (/^(gpt-|o1-|o3-|o4-)/.test(id)) return 'openai';
  if (/^claude-/.test(id)) return 'anthropic';
  if (/^gemini-/.test(id)) return 'google';
  if (/^groq[-\/]/.test(id)) return 'groq';
  if (/^(mistral|codestral)/.test(id)) return 'mistral';
  if (/^(cohere|command)/.test(id)) return 'cohere';
  if (/^perplexity/.test(id)) return 'perplexity';
  if (/^grok-/.test(id)) return 'xai';
  if (/^(together|meta-llama|deepseek.*together)/.test(id)) return 'together';
  if (/^(fireworks|accounts\/fireworks)/.test(id)) return 'fireworks';
  if (/^deepseek/.test(id)) return 'deepseek';
  if (/^kimi-/.test(id)) return 'moonshot';
  if (/^(hf[-\/]|huggingface)/.test(id)) return 'huggingface';
  if (/^(vercel|v0-)/.test(id)) return 'vercel';
  if (/^(text-embedding|embedding)/.test(id)) return 'openai';
  return 'unknown';
}

/** Reset catalog cache (exported for testing) */
export function _resetTrustGateCatalogCache() {
  trustgateCatalogCache = null;
}

/**
 * Schema mapping for passport types
 */
const TYPE_SCHEMA_MAP: Record<PassportType, SchemaId | null> = {
  model: 'ModelMeta',
  compute: 'ComputeMeta',
  tool: 'ToolMeta',
  dataset: 'DatasetMeta',
  agent: 'AgentDescriptor',
};

/**
 * Result type for operations
 */
export interface OperationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: any;
}

/**
 * Input for creating a passport
 */
export interface CreatePassportInput {
  type: PassportType;
  owner: string;
  metadata: any;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  /** Mint an NFT for this passport. Defaults to env NFT_MINT_ON_CREATE (true). */
  mintNFT?: boolean;
}

/**
 * Input for updating a passport
 */
export interface UpdatePassportInput {
  metadata?: any;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  status?: PassportStatus;
}

/**
 * On-chain sync handler interface
 */
export interface OnChainSyncHandler {
  syncToChain(passport: Passport, options?: { forceReupload?: boolean }): Promise<{ pda: string; tx: string } | null>;
}

/**
 * PassportManager - Business logic layer for passport operations
 */
export class PassportManager {
  private store: PassportStore;
  private syncHandler: OnChainSyncHandler | null = null;
  private initialized: boolean = false;
  private computeAvailabilityChecker: ComputeAvailabilityChecker | null = null;
  private modelCatalog: ModelCatalogLookup = {};

  constructor(store?: PassportStore) {
    this.store = store || getPassportStore();
  }

  /**
   * Inject compute availability checker (called by gateway-lite at startup).
   */
  setComputeAvailabilityChecker(checker: ComputeAvailabilityChecker): void {
    this.computeAvailabilityChecker = checker;
  }

  /**
   * Inject model catalog (called by gateway-lite at startup).
   */
  setModelCatalog(catalog: ModelCatalogLookup): void {
    this.modelCatalog = catalog;
  }

  /**
   * Initialize the manager
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.store.init();
    this.initialized = true;
    logger.info('🔐 Passport Manager initialized');
  }

  /**
   * Set on-chain sync handler
   */
  setOnChainSyncHandler(handler: OnChainSyncHandler): void {
    this.syncHandler = handler;
    logger.info('🔗 On-chain sync handler registered');
  }

  /**
   * Validate metadata against schema
   */
  private validateMetadata(type: PassportType, metadata: any): OperationResult<any> {
    const schemaName = TYPE_SCHEMA_MAP[type];
    
    // If no schema defined, do basic validation
    if (!schemaName) {
      if (!metadata || typeof metadata !== 'object') {
        return {
          ok: false,
          error: 'Metadata must be a non-null object',
        };
      }
      return { ok: true, data: metadata };
    }

    // Validate against schema
    const result = validateWithSchema(schemaName, metadata);
    if (!result.ok) {
      return {
        ok: false,
        error: `Invalid ${type} metadata: schema validation failed`,
        details: result.errors,
      };
    }

    return { ok: true, data: metadata };
  }

  /**
   * Validate Solana wallet address (basic format check)
   */
  private validateOwner(owner: string): boolean {
    // Basic Solana address validation: base58 string, 32-44 chars
    if (!owner || typeof owner !== 'string') return false;
    if (owner.length < 32 || owner.length > 44) return false;
    // Base58 alphabet check
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(owner);
  }

  /**
   * Create a new passport
   */
  async createPassport(input: CreatePassportInput): Promise<OperationResult<Passport>> {
    await this.ensureInitialized();

    // Validate type
    const validTypes: PassportType[] = ['model', 'compute', 'tool', 'dataset', 'agent'];
    if (!validTypes.includes(input.type)) {
      return {
        ok: false,
        error: `Invalid passport type: ${input.type}. Must be one of: ${validTypes.join(', ')}`,
      };
    }

    // Validate owner
    if (!this.validateOwner(input.owner)) {
      return {
        ok: false,
        error: 'Invalid owner address: must be a valid Solana wallet address',
      };
    }

    // Validate metadata against schema
    const metadataResult = this.validateMetadata(input.type, input.metadata);
    if (!metadataResult.ok) {
      return metadataResult;
    }

    // Validate api_model_id for API-based models
    if (input.type === 'model' && input.metadata?.format === 'api') {
      const apiModelId = input.metadata.api_model_id || input.metadata.provider_model_id; // backward compat
      if (!apiModelId || typeof apiModelId !== 'string' || apiModelId.trim() === '') {
        return {
          ok: false,
          error: 'Model passports with format "api" require a non-empty api_model_id field',
          details: 'api_model_id is the model string TrustGate uses for routing (e.g., "gpt-4o", "claude-3-sonnet-20240229")',
        };
      }
    }

    // Validate api_model_id against TrustGate catalog
    if (input.type === 'model' && (input.metadata?.api_model_id || input.metadata?.provider_model_id || input.metadata?.format === 'api')) {
      const catalog = await getTrustGateCatalog();
      const modelId = input.metadata.api_model_id
        || input.metadata.provider_model_id
        || (input.metadata.name ? input.metadata.name.toLowerCase().replace(/\s+/g, '-') : '');

      if (catalog.size > 0 && modelId && !catalog.has(modelId)) {
        if (input.metadata.format === 'api') {
          return {
            ok: false,
            error: `Model '${modelId}' not found in TrustGate catalog. Available models can be checked at ${TRUSTGATE_URL}/v1/models`,
          };
        }
        logger.info(`[PassportManager] TrustGate may serve this model — consider setting api_model_id for dual-path routing`);
      }
    }

    // Ensure passport_id in metadata matches type requirements
    if (input.type === 'model') {
      if (!input.metadata.model_passport_id) {
        return {
          ok: false,
          error: 'Model metadata must include model_passport_id',
        };
      }
    } else if (input.type === 'compute') {
      if (!input.metadata.compute_passport_id) {
        return {
          ok: false,
          error: 'Compute metadata must include compute_passport_id',
        };
      }
    } else if (input.type === 'tool') {
      if (!input.metadata.tool_passport_id) {
        return {
          ok: false,
          error: 'Tool metadata must include tool_passport_id',
        };
      }
    } else if (input.type === 'agent') {
      // AgentDescriptor schema uses agent_config.system_prompt as primary field
      // Legacy metadata uses agent_passport_id — accept both formats
      if (!input.metadata.agent_passport_id && !input.metadata.agent_config) {
        return {
          ok: false,
          error: 'Agent metadata must include agent_passport_id or agent_config',
        };
      }
    } else if (input.type === 'dataset') {
      if (!input.metadata.dataset_passport_id) {
        return {
          ok: false,
          error: 'Dataset metadata must include dataset_passport_id',
        };
      }
    }

    // Create the passport
    try {
      const passport = await this.store.create({
        type: input.type,
        owner: input.owner,
        metadata: input.metadata,
        name: input.name,
        description: input.description,
        version: input.version,
        tags: input.tags,
      });

      // Update the metadata passport ID to match the generated passport ID
      // This ensures consistency between the passport record and its metadata
      if (input.type === 'model') {
        passport.metadata.model_passport_id = passport.passport_id;
      } else if (input.type === 'compute') {
        passport.metadata.compute_passport_id = passport.passport_id;
      } else if (input.type === 'tool') {
        passport.metadata.tool_passport_id = passport.passport_id;
      } else if (input.type === 'agent') {
        passport.metadata.agent_passport_id = passport.passport_id;
      } else if (input.type === 'dataset') {
        passport.metadata.dataset_passport_id = passport.passport_id;
      }

      // Sync to chain if handler is set
      await this.attemptOnChainSync(passport);

      // Mint NFT if requested (per-request flag, env var as default)
      const shouldMintNFT = input.mintNFT ?? (process.env.NFT_MINT_ON_CREATE !== 'false');
      if (shouldMintNFT) {
        this.attemptNFTMint(passport).catch(err => {
          logger.warn(`[PassportManager] NFT mint failed for ${passport.passport_id}:`, err instanceof Error ? err.message : err);
        });
      }

      return {
        ok: true,
        data: passport,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to create passport',
      };
    }
  }

  /**
   * Attempt to mint an NFT for a passport (non-blocking, best-effort)
   */
  private async attemptNFTMint(passport: Passport): Promise<void> {
    try {
      const { getNFTProvider } = await import('../assets/nft');

      // Upload NFT metadata JSON to permanent storage (respects kill switch)
      const metadataJson = {
        name: passport.name || passport.passport_id,
        description: passport.description || `Lucid ${passport.type} passport`,
        image: '',
        attributes: [
          { trait_type: 'type', value: passport.type },
          { trait_type: 'version', value: passport.version || '1.0.0' },
          { trait_type: 'status', value: passport.status },
        ],
        properties: {
          lucid_passport_id: passport.passport_id,
          lucid_type: passport.type,
        },
      };

      let metadataUri = '';
      if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
        const { getPermanentStorage } = await import('../storage/depin');
        const uploadResult = await getPermanentStorage().uploadJSON(metadataJson, {
          tags: { 'Content-Type': 'application/json', 'lucid-nft': 'true' },
        });
        metadataUri = uploadResult.url;
      }

      const nft = getNFTProvider();
      const result = await nft.mint(passport.owner, {
        name: passport.name || passport.passport_id,
        symbol: 'LUCID',
        uri: metadataUri,
        passportId: passport.passport_id,
        passportType: passport.type,
      });

      // Store NFT mint address on passport
      passport.nft_mint = result.mint;
      passport.nft_chain = result.chain;
      await this.store.update(passport.passport_id, {
        metadata: { ...passport.metadata, nft_mint: result.mint, nft_chain: result.chain },
      });

      logger.info(`[PassportManager] NFT minted for ${passport.passport_id}: ${result.mint} (${result.chain})`);
    } catch (err) {
      // Non-blocking — log and continue
      throw err;
    }
  }

  /**
   * Get a passport by ID
   */
  async getPassport(passportId: string): Promise<OperationResult<Passport>> {
    await this.ensureInitialized();

    if (!passportId || typeof passportId !== 'string') {
      return {
        ok: false,
        error: 'Invalid passport ID',
      };
    }

    const passport = await this.store.get(passportId);
    if (!passport) {
      return {
        ok: false,
        error: 'Passport not found',
      };
    }

    return {
      ok: true,
      data: passport,
    };
  }

  /**
   * Update a passport
   */
  async updatePassport(
    passportId: string,
    input: UpdatePassportInput,
    requestingOwner?: string
  ): Promise<OperationResult<Passport>> {
    await this.ensureInitialized();

    // Get existing passport
    const existing = await this.store.get(passportId);
    if (!existing) {
      return {
        ok: false,
        error: 'Passport not found',
      };
    }

    // Verify ownership if requestingOwner is provided
    if (requestingOwner && existing.owner !== requestingOwner) {
      return {
        ok: false,
        error: 'Not authorized: only the passport owner can update it',
      };
    }

    // Validate metadata if being updated
    if (input.metadata) {
      const metadataResult = this.validateMetadata(existing.type, input.metadata);
      if (!metadataResult.ok) {
        return metadataResult;
      }

      // Validate api_model_id for API-based models
      if (existing.type === 'model' && input.metadata?.format === 'api') {
        const apiModelId = input.metadata.api_model_id || input.metadata.provider_model_id; // backward compat
        if (!apiModelId || typeof apiModelId !== 'string' || apiModelId.trim() === '') {
          return {
            ok: false,
            error: 'Model passports with format "api" require a non-empty api_model_id field',
            details: 'api_model_id is the model string TrustGate uses for routing (e.g., "gpt-4o", "claude-3-sonnet-20240229")',
          };
        }
      }

      // Preserve the passport ID in metadata
      if (existing.type === 'model') {
        input.metadata.model_passport_id = existing.passport_id;
      } else if (existing.type === 'compute') {
        input.metadata.compute_passport_id = existing.passport_id;
      }
    }

    // Validate status if being updated
    if (input.status) {
      const validStatuses: PassportStatus[] = ['active', 'deprecated', 'revoked'];
      if (!validStatuses.includes(input.status)) {
        return {
          ok: false,
          error: `Invalid status: must be one of: ${validStatuses.join(', ')}`,
        };
      }
    }

    // Perform update
    try {
      const updated = await this.store.update(passportId, input);
      if (!updated) {
        return {
          ok: false,
          error: 'Failed to update passport',
        };
      }

      // Re-sync to chain — force DePIN re-upload if metadata changed
      const hasMetadataChange = !!input.metadata;
      await this.attemptOnChainSync(updated, { forceReupload: hasMetadataChange });

      return {
        ok: true,
        data: updated,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to update passport',
      };
    }
  }

  /**
   * Update only pricing fields on a passport's metadata.
   * Deep-merges into metadata.pricing / metadata.economics, re-validates, and triggers DePIN re-upload.
   */
  async updatePricing(
    passportId: string,
    pricing: Record<string, any>,
    requestingOwner?: string
  ): Promise<OperationResult<Passport>> {
    await this.ensureInitialized();

    const existing = await this.store.get(passportId);
    if (!existing) {
      return { ok: false, error: 'Passport not found' };
    }
    if (requestingOwner && existing.owner !== requestingOwner) {
      return { ok: false, error: 'Not authorized: only the passport owner can update it' };
    }

    // Deep-merge pricing into metadata
    const merged = {
      ...existing.metadata,
      pricing: { ...(existing.metadata?.pricing || {}), ...pricing },
      economics: pricing.revenue_split
        ? { ...(existing.metadata?.economics || {}), revenue_split: pricing.revenue_split }
        : existing.metadata?.economics,
    };

    // Re-validate full metadata
    const validation = this.validateMetadata(existing.type, merged);
    if (!validation.ok) return validation;

    const updated = await this.store.update(passportId, { metadata: merged });
    if (!updated) return { ok: false, error: 'Failed to update passport' };

    await this.attemptOnChainSync(updated, { forceReupload: true });
    return { ok: true, data: updated };
  }

  /**
   * Update only endpoint fields on a passport's metadata.
   * Deep-merges into metadata.endpoints, re-validates, and triggers DePIN re-upload.
   */
  async updateEndpoints(
    passportId: string,
    endpoints: Record<string, any>,
    requestingOwner?: string
  ): Promise<OperationResult<Passport>> {
    await this.ensureInitialized();

    const existing = await this.store.get(passportId);
    if (!existing) {
      return { ok: false, error: 'Passport not found' };
    }
    if (requestingOwner && existing.owner !== requestingOwner) {
      return { ok: false, error: 'Not authorized: only the passport owner can update it' };
    }

    // Deep-merge endpoints into metadata
    const merged = {
      ...existing.metadata,
      endpoints: { ...(existing.metadata?.endpoints || {}), ...endpoints },
    };

    // Re-validate full metadata
    const validation = this.validateMetadata(existing.type, merged);
    if (!validation.ok) return validation;

    const updated = await this.store.update(passportId, { metadata: merged });
    if (!updated) return { ok: false, error: 'Failed to update passport' };

    await this.attemptOnChainSync(updated, { forceReupload: true });
    return { ok: true, data: updated };
  }

  /**
   * Delete a passport (soft delete)
   */
  async deletePassport(
    passportId: string,
    requestingOwner?: string
  ): Promise<OperationResult<boolean>> {
    await this.ensureInitialized();

    // Get existing passport
    const existing = await this.store.get(passportId);
    if (!existing) {
      return {
        ok: false,
        error: 'Passport not found',
      };
    }

    // Verify ownership if requestingOwner is provided
    if (requestingOwner && existing.owner !== requestingOwner) {
      return {
        ok: false,
        error: 'Not authorized: only the passport owner can delete it',
      };
    }

    // Perform soft delete
    const success = await this.store.delete(passportId);
    return {
      ok: success,
      data: success,
      error: success ? undefined : 'Failed to delete passport',
    };
  }

  /**
   * List passports with filtering
   */
  async listPassports(filters: PassportFilters = {}): Promise<PaginatedResult<Passport>> {
    await this.ensureInitialized();
    return this.store.list(filters);
  }

  /**
   * Get multiple passports by IDs
   */
  async getPassports(ids: string[]): Promise<Passport[]> {
    await this.ensureInitialized();
    return this.store.getMany(ids);
  }

  /**
   * Search models with ModelMeta-specific filters
   */
  async searchModels(filters: {
    runtime?: string;
    format?: string;
    max_vram?: number;
    available?: boolean;
    owner?: string;
    tags?: string[];
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResult<Passport>> {
    await this.ensureInitialized();

    // Start with model type filter
    const result = await this.store.list({
      type: 'model',
      owner: filters.owner,
      tags: filters.tags,
      search: filters.search,
      page: filters.page,
      per_page: filters.per_page,
      status: 'active', // Only active passports
    });

    // Apply ModelMeta-specific filters
    if (filters.runtime || filters.format || filters.max_vram !== undefined) {
      result.items = result.items.filter(p => {
        const meta = p.metadata;
        if (!meta) return false;

        if (filters.runtime && meta.runtime_recommended !== filters.runtime) {
          return false;
        }
        if (filters.format && meta.format !== filters.format) {
          return false;
        }
        if (filters.max_vram !== undefined) {
          const minVram = meta.requirements?.min_vram_gb || 0;
          if (minVram > filters.max_vram) {
            return false;
          }
        }
        return true;
      });

      // Update pagination counts
      result.pagination.total = result.items.length;
      result.pagination.total_pages = Math.ceil(
        result.items.length / result.pagination.per_page
      );
    }

    // Filter by compute availability (tri-state: true=available only, false=unavailable only, undefined=all)
    if (filters.available !== undefined && this.computeAvailabilityChecker) {
      const computeResult = await this.store.list({ type: 'compute', status: 'active' });
      const computeCatalog = computeResult.items.map(p => p.metadata);
      const checker = this.computeAvailabilityChecker;
      result.items = result.items.filter(p => {
        const isAvailable = checker(p.metadata, computeCatalog);
        return filters.available ? isAvailable : !isAvailable;
      });
      result.pagination.total = result.items.length;
      result.pagination.total_pages = Math.ceil(
        result.items.length / result.pagination.per_page
      );
    } else if (filters.available !== undefined) {
      logger.warn('[PassportManager] Compute availability filter requested but no checker injected — skipping filter');
    }

    return result;
  }

  /**
   * Search compute with ComputeMeta-specific filters
   */
  async searchCompute(filters: {
    regions?: string[];
    runtimes?: string[];
    provider_type?: string;
    min_vram_gb?: number;
    gpu?: string;
    owner?: string;
    tags?: string[];
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResult<Passport>> {
    await this.ensureInitialized();

    // Start with compute type filter
    const result = await this.store.list({
      type: 'compute',
      owner: filters.owner,
      tags: filters.tags,
      search: filters.search,
      page: filters.page,
      per_page: filters.per_page,
      status: 'active', // Only active passports
    });

    // Apply ComputeMeta-specific filters
    const hasSpecificFilters = filters.regions || filters.runtimes || 
      filters.provider_type || filters.min_vram_gb !== undefined || filters.gpu;

    if (hasSpecificFilters) {
      result.items = result.items.filter(p => {
        const meta = p.metadata;
        if (!meta) return false;

        // Region filter
        if (filters.regions && filters.regions.length > 0) {
          const metaRegions = meta.regions || [];
          const hasMatchingRegion = filters.regions.some(r => metaRegions.includes(r));
          if (!hasMatchingRegion) return false;
        }

        // Runtime filter
        if (filters.runtimes && filters.runtimes.length > 0) {
          const metaRuntimes = (meta.runtimes || []).map((rt: any) => rt.name);
          const hasMatchingRuntime = filters.runtimes.some(r => metaRuntimes.includes(r));
          if (!hasMatchingRuntime) return false;
        }

        // Provider type filter
        if (filters.provider_type && meta.provider_type !== filters.provider_type) {
          return false;
        }

        // Min VRAM filter
        if (filters.min_vram_gb !== undefined) {
          const vram = meta.hardware?.vram_gb || 0;
          if (vram < filters.min_vram_gb) return false;
        }

        // GPU filter
        if (filters.gpu) {
          const gpu = meta.hardware?.gpu || '';
          if (!gpu.toLowerCase().includes(filters.gpu.toLowerCase())) {
            return false;
          }
        }

        return true;
      });

      // Update pagination counts
      result.pagination.total = result.items.length;
      result.pagination.total_pages = Math.ceil(
        result.items.length / result.pagination.per_page
      );
    }

    return result;
  }

  /**
   * Get passports pending on-chain sync
   */
  async getPendingSync(): Promise<Passport[]> {
    await this.ensureInitialized();
    return this.store.getPendingSync();
  }

  /**
   * Manually trigger on-chain sync for a passport
   */
  async syncToChain(passportId: string): Promise<OperationResult<{ pda: string; tx: string }>> {
    await this.ensureInitialized();

    if (!this.syncHandler) {
      return {
        ok: false,
        error: 'No on-chain sync handler configured',
      };
    }

    const passport = await this.store.get(passportId);
    if (!passport) {
      return {
        ok: false,
        error: 'Passport not found',
      };
    }

    try {
      const result = await this.syncHandler.syncToChain(passport);
      if (!result) {
        return {
          ok: false,
          error: 'On-chain sync failed',
        };
      }

      // Update passport with on-chain info
      await this.store.updateOnChainInfo(passportId, {
        on_chain_pda: result.pda,
        on_chain_tx: result.tx,
      });

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'On-chain sync failed',
      };
    }
  }

  /**
   * Attempt on-chain sync (non-blocking)
   */
  private async attemptOnChainSync(passport: Passport, options?: { forceReupload?: boolean }): Promise<void> {
    if (!this.syncHandler) return;

    // Run async, don't block the main operation
    this.syncHandler.syncToChain(passport, options)
      .then(result => {
        if (result) {
          this.store.updateOnChainInfo(passport.passport_id, {
            on_chain_pda: result.pda,
            on_chain_tx: result.tx,
          }).catch(console.error);
          logger.info(`📋 Passport ${passport.passport_id} synced to chain: ${result.pda}`);
        }
      })
      .catch(error => {
        logger.error(`Failed to sync passport ${passport.passport_id} to chain:`, error);
      });
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Get passport count
   */
  async getCount(filters?: PassportFilters): Promise<number> {
    await this.ensureInitialized();
    return this.store.count(filters);
  }

  /**
   * Check if passport exists
   */
  async exists(passportId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.store.exists(passportId);
  }

  /**
   * Sync API models from TrustGate/LiteLLM catalog into the passport store.
   * Creates format=api passports for any catalog model not yet registered.
   * Revokes stale passports whose api_model_id is no longer in catalog.
   * Idempotent — safe to call on every startup.
   */
  async syncApiModels(): Promise<{ created: number; skipped: number; removed: number }> {
    await this.ensureInitialized();

    const catalog = await getTrustGateCatalogFull();
    if (catalog.length === 0) {
      logger.warn('[TrustGate Sync] No models returned from TrustGate — skipping sync');
      return { created: 0, skipped: 0, removed: 0 };
    }

    const owner = process.env.PLATFORM_OWNER_ADDRESS || '11111111111111111111111111111111';

    // Get existing api passports
    const existing = await this.store.list({ type: 'model', status: 'active', per_page: 1000 });
    const existingApiPassports = existing.items.filter(p => p.metadata?.format === 'api');
    const existingByModelId = new Map<string, typeof existingApiPassports[0]>();
    for (const p of existingApiPassports) {
      if (p.metadata?.api_model_id) {
        existingByModelId.set(p.metadata.api_model_id, p);
      }
    }

    const catalogIds = new Set(catalog.map(m => m.id));
    let created = 0;
    let skipped = 0;

    // Create passports for new catalog models
    for (const model of catalog) {
      if (existingByModelId.has(model.id)) {
        skipped++;
        continue;
      }

      const catalogEntry = this.modelCatalog[model.id];
      const provider = catalogEntry?.provider || deriveProvider(model.id);
      const passportId = `passport_api_${model.id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

      // Build rich metadata from catalog (falls back to minimal if model not in catalog)
      const metadata: Record<string, any> = {
        schema_version: '2.0',
        model_passport_id: passportId,
        format: 'api',
        runtime_recommended: 'trustgate',
        name: catalogEntry?.name || model.id,
        provider,
        api_model_id: model.id,
        base: catalogEntry?.base || this.mapProviderToBase(provider),
      };

      // Enrich with catalog data if available
      if (catalogEntry) {
        metadata.modality = catalogEntry.modality;
        metadata.context_length = catalogEntry.context_length;
        metadata.max_output_tokens = catalogEntry.max_output_tokens;
        if (catalogEntry.parameter_count) metadata.parameter_count = catalogEntry.parameter_count;
        metadata.architecture = catalogEntry.architecture;
        if (catalogEntry.knowledge_cutoff) metadata.knowledge_cutoff = catalogEntry.knowledge_cutoff;
        metadata.license = catalogEntry.license;
        metadata.languages = catalogEntry.languages;
        metadata.capabilities = catalogEntry.capabilities;
        metadata.pricing = catalogEntry.pricing;
        metadata.infrastructure = catalogEntry.infrastructure;
        // Initialize empty trust/provenance — computed later from on-chain data
        metadata.trust = { trust_score: 0, total_inferences: 0 };
        metadata.provenance = { created_by: 'lucid-gateway' };
        metadata.economics = {
          revenue_split: { compute_bps: 0, model_bps: 0, protocol_bps: 10000 },
          staking_required: false,
        };
      }

      const displayName = catalogEntry?.name || model.id;

      try {
        await this.store.create({
          type: 'model',
          owner,
          metadata,
          name: displayName,
          description: `Lucid Gateway — ${displayName} by ${provider}`,
          version: '2.0',
          tags: ['auto-sync', 'api', provider, 'lucid', 'lucid-gateway', ...(catalogEntry?.modality || [])],
        });
        created++;
      } catch (err) {
        logger.warn(`[TrustGate Sync] Failed to create passport for ${model.id}:`, err);
      }
    }

    // Revoke stale passports no longer in catalog
    let removed = 0;
    for (const [modelId, passport] of existingByModelId) {
      if (!catalogIds.has(modelId) && passport.tags?.includes('auto-sync')) {
        try {
          await this.store.update(passport.passport_id, { status: 'revoked' });
          removed++;
        } catch (err) {
          logger.warn(`[TrustGate Sync] Failed to revoke stale passport ${passport.passport_id}:`, err);
        }
      }
    }

    logger.info(`[TrustGate Sync] Done: ${created} created, ${skipped} skipped, ${removed} removed (${catalog.length} in catalog)`);
    return { created, skipped, removed };
  }

  /** Map provider name to ModelMeta base enum */
  private mapProviderToBase(provider: string): string {
    switch (provider) {
      case 'openai': return 'openai';
      case 'anthropic': return 'anthropic';
      case 'google': return 'google';
      case 'cohere': return 'cohere';
      default: return 'custom_endpoint';
    }
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    await this.store.shutdown();
    this.initialized = false;
    logger.info('🔐 Passport Manager shutdown complete');
  }
}

// Singleton instance
let managerInstance: PassportManager | null = null;

export function getPassportManager(): PassportManager {
  if (!managerInstance) {
    managerInstance = new PassportManager();
  }
  return managerInstance;
}

// For testing - reset singleton
export function resetPassportManager(): void {
  if (managerInstance) {
    managerInstance.shutdown().catch(console.error);
    managerInstance = null;
  }
}
