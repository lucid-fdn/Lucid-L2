// offchain/src/storage/passportStore.ts
// File-based passport storage with in-memory caching and indexing

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PATHS } from '../../shared/config/paths';
import { logger } from '../../shared/lib/logger';

/**
 * Passport types supported by the system
 */
export type PassportType = 'model' | 'compute' | 'tool' | 'dataset' | 'agent';

/**
 * Passport status
 */
export type PassportStatus = 'active' | 'deprecated' | 'revoked';

/**
 * Base passport structure
 */
export interface Passport {
  passport_id: string;
  type: PassportType;
  owner: string; // Solana or EVM wallet address
  metadata: any; // ModelMeta, ComputeMeta, or other schema-validated object
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
  status: PassportStatus;
  tags?: string[];
  name?: string; // Human-readable name
  description?: string; // Description
  version?: string; // Semantic version
  // On-chain sync fields
  on_chain_pda?: string; // PDA address if synced to Solana
  on_chain_tx?: string; // Transaction signature of on-chain registration
  last_sync_at?: number; // Last sync timestamp
  // DePIN storage fields
  depin_metadata_cid?: string; // CID from decentralized storage
  depin_provider?: string; // Which provider stored it (arweave, lighthouse, mock)
  // NFT fields
  nft_mint?: string; // NFT mint address (Solana base58 or EVM 0x...)
  nft_chain?: string; // Chain where NFT was minted
  // Share token fields
  share_token_mint?: string; // SPL token mint for fractional ownership
}

/**
 * Filters for listing/searching passports
 */
export interface PassportFilters {
  type?: PassportType | PassportType[];
  owner?: string;
  provider?: string; // Filter by metadata.provider (e.g., "openclaw", "mastra")
  status?: PassportStatus | PassportStatus[];
  tags?: string[];
  tag_match?: 'all' | 'any'; // Match all tags or any tag
  search?: string; // Full-text search on name/description
  // Pagination
  page?: number;
  per_page?: number;
  // Sorting
  sort_by?: 'created_at' | 'updated_at' | 'name';
  sort_order?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

/**
 * Index structure for fast lookups
 */
interface PassportIndex {
  by_type: Map<PassportType, Set<string>>;
  by_owner: Map<string, Set<string>>;
  by_tag: Map<string, Set<string>>;
  by_status: Map<PassportStatus, Set<string>>;
}

/**
 * Storage file structure
 */
interface StorageFile {
  version: string;
  last_updated: number;
  passports: Record<string, Passport>;
}

const STORAGE_VERSION = '1.0';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PassportStore {
  private dataDir: string;
  private storageFile: string;
  private passports: Map<string, Passport>;
  private index: PassportIndex;
  private isDirty: boolean = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private autoSaveDelay: number;

  constructor(dataDir?: string, autoSaveDelay: number = 5000) {
    this.dataDir = dataDir || path.join(PATHS.DATA_DIR, 'passports');
    this.storageFile = path.join(this.dataDir, 'passports.json');
    this.passports = new Map();
    this.autoSaveDelay = autoSaveDelay;
    this.index = {
      by_type: new Map(),
      by_owner: new Map(),
      by_tag: new Map(),
      by_status: new Map(),
    };
  }

  /**
   * Initialize the store - load from disk
   */
  async init(): Promise<void> {
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Load existing data
    if (fs.existsSync(this.storageFile)) {
      try {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const storage: StorageFile = JSON.parse(data);
        
        // Load passports into memory
        for (const [id, passport] of Object.entries(storage.passports)) {
          this.passports.set(id, passport);
          this.addToIndex(passport);
        }
        logger.info(`📦 Loaded ${this.passports.size} passports from storage`);
      } catch (error) {
        logger.error('Failed to load passport storage:', error);
        // Start with empty store
      }
    }

    // Start auto-save if delay > 0
    if (this.autoSaveDelay > 0) {
      this.startAutoSave();
    }
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) return;
    
    this.autoSaveInterval = setInterval(() => {
      if (this.isDirty) {
        this.persist().catch(console.error);
      }
    }, this.autoSaveDelay);
  }

  /**
   * Stop auto-save and perform final save
   */
  async shutdown(): Promise<void> {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.isDirty) {
      await this.persist();
    }
  }

  /**
   * Persist data to disk
   */
  async persist(): Promise<void> {
    const storage: StorageFile = {
      version: STORAGE_VERSION,
      last_updated: Date.now(),
      passports: Object.fromEntries(this.passports),
    };

    const tempFile = this.storageFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(storage, null, 2));
    fs.renameSync(tempFile, this.storageFile);
    this.isDirty = false;
  }

  /**
   * Add passport to index
   */
  private addToIndex(passport: Passport): void {
    // Index by type
    if (!this.index.by_type.has(passport.type)) {
      this.index.by_type.set(passport.type, new Set());
    }
    this.index.by_type.get(passport.type)!.add(passport.passport_id);

    // Index by owner
    if (!this.index.by_owner.has(passport.owner)) {
      this.index.by_owner.set(passport.owner, new Set());
    }
    this.index.by_owner.get(passport.owner)!.add(passport.passport_id);

    // Index by status
    if (!this.index.by_status.has(passport.status)) {
      this.index.by_status.set(passport.status, new Set());
    }
    this.index.by_status.get(passport.status)!.add(passport.passport_id);

    // Index by tags
    if (passport.tags) {
      for (const tag of passport.tags) {
        const normalizedTag = tag.toLowerCase();
        if (!this.index.by_tag.has(normalizedTag)) {
          this.index.by_tag.set(normalizedTag, new Set());
        }
        this.index.by_tag.get(normalizedTag)!.add(passport.passport_id);
      }
    }
  }

  /**
   * Remove passport from index
   */
  private removeFromIndex(passport: Passport): void {
    // Remove from type index
    this.index.by_type.get(passport.type)?.delete(passport.passport_id);

    // Remove from owner index
    this.index.by_owner.get(passport.owner)?.delete(passport.passport_id);

    // Remove from status index
    this.index.by_status.get(passport.status)?.delete(passport.passport_id);

    // Remove from tag indexes
    if (passport.tags) {
      for (const tag of passport.tags) {
        const normalizedTag = tag.toLowerCase();
        this.index.by_tag.get(normalizedTag)?.delete(passport.passport_id);
      }
    }
  }

  /**
   * Generate a new passport ID
   */
  generateId(): string {
    return `passport_${uuidv4().replace(/-/g, '')}`;
  }

  /**
   * Create a new passport
   */
  async create(input: {
    type: PassportType;
    owner: string;
    metadata: any;
    name?: string;
    description?: string;
    version?: string;
    tags?: string[];
  }): Promise<Passport> {
    const now = Date.now();
    const passport: Passport = {
      passport_id: this.generateId(),
      type: input.type,
      owner: input.owner,
      metadata: input.metadata,
      name: input.name,
      description: input.description,
      version: input.version,
      tags: input.tags || [],
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    this.passports.set(passport.passport_id, passport);
    this.addToIndex(passport);
    this.isDirty = true;

    return passport;
  }

  /**
   * Get a passport by ID
   */
  async get(passportId: string): Promise<Passport | null> {
    return this.passports.get(passportId) || null;
  }

  /**
   * Update a passport
   */
  async update(passportId: string, patch: Partial<Omit<Passport, 'passport_id' | 'created_at'>>): Promise<Passport | null> {
    const existing = this.passports.get(passportId);
    if (!existing) return null;

    // Remove from index before update
    this.removeFromIndex(existing);

    // Apply patch
    const updated: Passport = {
      ...existing,
      ...patch,
      passport_id: existing.passport_id, // Ensure ID doesn't change
      created_at: existing.created_at, // Ensure created_at doesn't change
      updated_at: Date.now(),
    };

    this.passports.set(passportId, updated);
    this.addToIndex(updated);
    this.isDirty = true;

    return updated;
  }

  /**
   * Delete a passport (soft delete - sets status to revoked)
   */
  async delete(passportId: string): Promise<boolean> {
    const passport = this.passports.get(passportId);
    if (!passport) return false;

    // Soft delete
    this.removeFromIndex(passport);
    passport.status = 'revoked';
    passport.updated_at = Date.now();
    this.addToIndex(passport);
    this.isDirty = true;

    return true;
  }

  /**
   * Hard delete a passport (remove from store entirely)
   */
  async hardDelete(passportId: string): Promise<boolean> {
    const passport = this.passports.get(passportId);
    if (!passport) return false;

    this.removeFromIndex(passport);
    this.passports.delete(passportId);
    this.isDirty = true;

    return true;
  }

  /**
   * List passports with filtering and pagination
   */
  async list(filters: PassportFilters = {}): Promise<PaginatedResult<Passport>> {
    let candidateIds: Set<string> | null = null;

    // Apply type filter
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      const typeMatches = new Set<string>();
      for (const t of types) {
        const ids = this.index.by_type.get(t);
        if (ids) {
          for (const id of ids) typeMatches.add(id);
        }
      }
      candidateIds = typeMatches;
    }

    // Apply owner filter
    if (filters.owner) {
      const ownerMatches = this.index.by_owner.get(filters.owner) || new Set();
      if (candidateIds === null) {
        candidateIds = new Set(ownerMatches);
      } else {
        candidateIds = this.intersectSets(candidateIds, ownerMatches);
      }
    }

    // Apply provider filter (metadata.provider)
    if (filters.provider) {
      const providerFilter = filters.provider.toLowerCase();
      const all = candidateIds || new Set(this.passports.keys());
      const providerMatches = new Set<string>();
      for (const id of all) {
        const p = this.passports.get(id);
        if (p?.metadata?.provider && String(p.metadata.provider).toLowerCase() === providerFilter) {
          providerMatches.add(id);
        }
      }
      candidateIds = providerMatches;
    }

    // Apply status filter
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      const statusMatches = new Set<string>();
      for (const s of statuses) {
        const ids = this.index.by_status.get(s);
        if (ids) {
          for (const id of ids) statusMatches.add(id);
        }
      }
      if (candidateIds === null) {
        candidateIds = statusMatches;
      } else {
        candidateIds = this.intersectSets(candidateIds, statusMatches);
      }
    }

    // Apply tag filter
    if (filters.tags && filters.tags.length > 0) {
      const tagMatch = filters.tag_match || 'all';
      const normalizedTags = filters.tags.map(t => t.toLowerCase());
      
      if (tagMatch === 'all') {
        // Must match all tags
        let tagMatches: Set<string> | null = null;
        for (const tag of normalizedTags) {
          const ids = this.index.by_tag.get(tag) || new Set();
          if (tagMatches === null) {
            tagMatches = new Set(ids);
          } else {
            tagMatches = this.intersectSets(tagMatches, ids);
          }
        }
        if (candidateIds === null) {
          candidateIds = tagMatches || new Set();
        } else {
          candidateIds = this.intersectSets(candidateIds, tagMatches || new Set());
        }
      } else {
        // Match any tag
        const tagMatches = new Set<string>();
        for (const tag of normalizedTags) {
          const ids = this.index.by_tag.get(tag);
          if (ids) {
            for (const id of ids) tagMatches.add(id);
          }
        }
        if (candidateIds === null) {
          candidateIds = tagMatches;
        } else {
          candidateIds = this.intersectSets(candidateIds, tagMatches);
        }
      }
    }

    // If no filters, use all passports
    if (candidateIds === null) {
      candidateIds = new Set(this.passports.keys());
    }

    // Get passport objects
    let results: Passport[] = [];
    for (const id of candidateIds) {
      const passport = this.passports.get(id);
      if (passport) results.push(passport);
    }

    // Apply full-text search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      results = results.filter(p => 
        (p.name && p.name.toLowerCase().includes(searchLower)) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort results
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    results.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'updated_at') {
        cmp = a.updated_at - b.updated_at;
      } else {
        cmp = a.created_at - b.created_at;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Paginate
    const page = Math.max(1, filters.page || 1);
    const perPage = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.per_page || DEFAULT_PAGE_SIZE));
    const total = results.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const paginatedItems = results.slice(start, start + perPage);

    return {
      items: paginatedItems,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  }

  /**
   * Get passports by IDs
   */
  async getMany(ids: string[]): Promise<Passport[]> {
    const results: Passport[] = [];
    for (const id of ids) {
      const passport = this.passports.get(id);
      if (passport) results.push(passport);
    }
    return results;
  }

  /**
   * Check if a passport exists
   */
  exists(passportId: string): boolean {
    return this.passports.has(passportId);
  }

  /**
   * Get count of passports
   */
  count(filters?: PassportFilters): number {
    if (!filters || Object.keys(filters).length === 0) {
      return this.passports.size;
    }
    // Use list internally but only get count
    // For MVP this is fine, can optimize later
    return Array.from(this.passports.values()).filter(p => {
      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        if (!types.includes(p.type)) return false;
      }
      if (filters.owner && p.owner !== filters.owner) return false;
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        if (!statuses.includes(p.status)) return false;
      }
      return true;
    }).length;
  }

  /**
   * Update on-chain sync info
   */
  async updateOnChainInfo(passportId: string, info: {
    on_chain_pda?: string;
    on_chain_tx?: string;
  }): Promise<Passport | null> {
    return this.update(passportId, {
      ...info,
      last_sync_at: Date.now(),
    });
  }

  /**
   * Get passports pending on-chain sync
   */
  async getPendingSync(): Promise<Passport[]> {
    return Array.from(this.passports.values()).filter(
      p => p.status === 'active' && !p.on_chain_pda
    );
  }

  /**
   * Helper: Intersect two sets
   */
  private intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
    const result = new Set<T>();
    for (const item of a) {
      if (b.has(item)) result.add(item);
    }
    return result;
  }

  /**
   * Get all passports (for debugging/export)
   */
  async getAll(): Promise<Passport[]> {
    return Array.from(this.passports.values());
  }
}

// Singleton instance
let storeInstance: PassportStore | null = null;

export function getPassportStore(dataDir?: string): PassportStore {
  if (!storeInstance) {
    storeInstance = new PassportStore(dataDir);
  }
  return storeInstance;
}

// For testing - reset singleton
export function resetPassportStore(): void {
  if (storeInstance) {
    storeInstance.shutdown().catch(console.error);
    storeInstance = null;
  }
}
