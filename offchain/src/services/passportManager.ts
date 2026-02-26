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
import { validateWithSchema, SchemaId } from '../utils/schemaValidator';
import { hasAvailableCompute } from './matchingEngine';

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
      console.warn('TrustGate catalog check failed:', response.status);
      return new Set();
    }
    const data = await response.json();
    const models = new Set<string>(
      (data.data || []).map((m: { id: string }) => m.id)
    );
    trustgateCatalogCache = { models, expires: Date.now() + CATALOG_CACHE_TTL };
    return models;
  } catch (error) {
    console.warn('TrustGate catalog unreachable:', error);
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
      console.warn('TrustGate catalog fetch failed:', response.status);
      return [];
    }
    const data = await response.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      owned_by: m.owned_by,
    }));
  } catch (error) {
    console.warn('TrustGate catalog unreachable:', error);
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
  tool: null, // No schema yet - basic validation only
  dataset: null, // No schema yet - basic validation only
  agent: null, // No schema yet - basic validation only
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
  syncToChain(passport: Passport): Promise<{ pda: string; tx: string } | null>;
}

/**
 * PassportManager - Business logic layer for passport operations
 */
export class PassportManager {
  private store: PassportStore;
  private syncHandler: OnChainSyncHandler | null = null;
  private initialized: boolean = false;

  constructor(store?: PassportStore) {
    this.store = store || getPassportStore();
  }

  /**
   * Initialize the manager
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.store.init();
    this.initialized = true;
    console.log('🔐 Passport Manager initialized');
  }

  /**
   * Set on-chain sync handler
   */
  setOnChainSyncHandler(handler: OnChainSyncHandler): void {
    this.syncHandler = handler;
    console.log('🔗 On-chain sync handler registered');
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
        console.log(`[PassportManager] TrustGate may serve this model — consider setting api_model_id for dual-path routing`);
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
      }

      // Sync to chain if handler is set
      await this.attemptOnChainSync(passport);

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

      // Re-sync to chain if there's an update
      await this.attemptOnChainSync(updated);

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
    if (filters.available !== undefined) {
      const computeResult = await this.store.list({ type: 'compute', status: 'active' });
      const computeCatalog = computeResult.items.map(p => p.metadata);
      result.items = result.items.filter(p => {
        const isAvailable = hasAvailableCompute(p.metadata, computeCatalog);
        return filters.available ? isAvailable : !isAvailable;
      });
      result.pagination.total = result.items.length;
      result.pagination.total_pages = Math.ceil(
        result.items.length / result.pagination.per_page
      );
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
  private async attemptOnChainSync(passport: Passport): Promise<void> {
    if (!this.syncHandler) return;

    // Run async, don't block the main operation
    this.syncHandler.syncToChain(passport)
      .then(result => {
        if (result) {
          this.store.updateOnChainInfo(passport.passport_id, {
            on_chain_pda: result.pda,
            on_chain_tx: result.tx,
          }).catch(console.error);
          console.log(`📋 Passport ${passport.passport_id} synced to chain: ${result.pda}`);
        }
      })
      .catch(error => {
        console.error(`Failed to sync passport ${passport.passport_id} to chain:`, error);
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
      console.warn('[TrustGate Sync] No models returned from TrustGate — skipping sync');
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

      const provider = deriveProvider(model.id);
      const passportId = `passport_api_${model.id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

      const metadata = {
        schema_version: '1.0',
        model_passport_id: passportId,
        format: 'api',
        runtime_recommended: 'trustgate',
        name: model.id,
        provider,
        api_model_id: model.id,
        base: this.mapProviderToBase(provider),
      };

      try {
        await this.store.create({
          type: 'model',
          owner,
          metadata,
          name: model.id,
          description: `Auto-synced from TrustGate (${provider})`,
          version: '1.0',
          tags: ['auto-sync', 'api', provider],
        });
        created++;
      } catch (err) {
        console.warn(`[TrustGate Sync] Failed to create passport for ${model.id}:`, err);
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
          console.warn(`[TrustGate Sync] Failed to revoke stale passport ${passport.passport_id}:`, err);
        }
      }
    }

    console.log(`[TrustGate Sync] Done: ${created} created, ${skipped} skipped, ${removed} removed (${catalog.length} in catalog)`);
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
    console.log('🔐 Passport Manager shutdown complete');
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
