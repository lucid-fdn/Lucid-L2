// offchain/src/storage/searchQueryBuilder.ts
// Advanced search query builder for passport discovery

import type { Passport, PassportType, PassportStatus, PassportFilters } from '../../storage/passportStore';

/**
 * Search filters for unified search
 */
export interface SearchFilters {
  // Base filters
  type?: PassportType[];
  owner?: string;
  status?: PassportStatus[];
  tags?: string[];
  tag_match?: 'all' | 'any';
  search?: string; // Full-text search on name/description
  
  // Model-specific filters
  runtime?: string; // runtime_recommended
  format?: string;
  min_vram_max?: number; // Models that require at most this VRAM
  
  // Compute-specific filters
  regions?: string[];
  runtimes?: string[]; // Compute supports these runtimes
  provider_type?: 'depin' | 'cloud' | 'onprem';
  min_vram_gb?: number; // Compute has at least this VRAM
  gpu?: string; // GPU partial match
  
  // Pagination
  page?: number;
  per_page?: number;
  
  // Sorting
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'relevance';
  sort_order?: 'asc' | 'desc';
}

/**
 * Search result with scoring
 */
export interface ScoredPassport {
  passport: Passport;
  score: number;
  highlights?: {
    field: string;
    matches: string[];
  }[];
}

/**
 * Search query result
 */
export interface SearchResult {
  items: ScoredPassport[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  facets?: {
    types: Record<string, number>;
    regions: Record<string, number>;
    runtimes: Record<string, number>;
    provider_types: Record<string, number>;
  };
}

/**
 * Search query builder class
 * Provides fluent API for building complex search queries
 */
export class SearchQueryBuilder {
  private filters: SearchFilters = {};
  
  constructor(initialFilters?: Partial<SearchFilters>) {
    if (initialFilters) {
      this.filters = { ...initialFilters };
    }
  }
  
  /**
   * Filter by passport type(s)
   */
  type(...types: PassportType[]): this {
    this.filters.type = types;
    return this;
  }
  
  /**
   * Filter by owner address
   */
  owner(address: string): this {
    this.filters.owner = address;
    return this;
  }
  
  /**
   * Filter by status
   */
  status(...statuses: PassportStatus[]): this {
    this.filters.status = statuses;
    return this;
  }
  
  /**
   * Filter by tags
   */
  tags(tags: string[], match: 'all' | 'any' = 'all'): this {
    this.filters.tags = tags;
    this.filters.tag_match = match;
    return this;
  }
  
  /**
   * Full-text search
   */
  search(query: string): this {
    this.filters.search = query;
    return this;
  }
  
  /**
   * Filter models by recommended runtime
   */
  runtime(runtime: string): this {
    this.filters.runtime = runtime;
    return this;
  }
  
  /**
   * Filter models by format
   */
  format(format: string): this {
    this.filters.format = format;
    return this;
  }
  
  /**
   * Filter models by max VRAM requirement
   */
  maxVramRequirement(vramGb: number): this {
    this.filters.min_vram_max = vramGb;
    return this;
  }
  
  /**
   * Filter compute by regions
   */
  regions(...regions: string[]): this {
    this.filters.regions = regions;
    return this;
  }
  
  /**
   * Filter compute by supported runtimes
   */
  runtimes(...runtimes: string[]): this {
    this.filters.runtimes = runtimes;
    return this;
  }
  
  /**
   * Filter compute by provider type
   */
  providerType(type: 'depin' | 'cloud' | 'onprem'): this {
    this.filters.provider_type = type;
    return this;
  }
  
  /**
   * Filter compute by minimum VRAM
   */
  minVram(vramGb: number): this {
    this.filters.min_vram_gb = vramGb;
    return this;
  }
  
  /**
   * Filter compute by GPU type
   */
  gpu(gpuName: string): this {
    this.filters.gpu = gpuName;
    return this;
  }
  
  /**
   * Set pagination
   */
  paginate(page: number, perPage: number = 20): this {
    this.filters.page = page;
    this.filters.per_page = perPage;
    return this;
  }
  
  /**
   * Set sorting
   */
  sortBy(field: 'created_at' | 'updated_at' | 'name' | 'relevance', order: 'asc' | 'desc' = 'desc'): this {
    this.filters.sort_by = field;
    this.filters.sort_order = order;
    return this;
  }
  
  /**
   * Build the filters object
   */
  build(): SearchFilters {
    return { ...this.filters };
  }
  
  /**
   * Convert to PassportFilters for basic listing
   */
  toPassportFilters(): PassportFilters {
    const pf: PassportFilters = {};
    
    if (this.filters.type && this.filters.type.length > 0) {
      pf.type = this.filters.type.length === 1 ? this.filters.type[0] : this.filters.type;
    }
    if (this.filters.owner) pf.owner = this.filters.owner;
    if (this.filters.status && this.filters.status.length > 0) {
      pf.status = this.filters.status.length === 1 ? this.filters.status[0] : this.filters.status;
    }
    if (this.filters.tags) pf.tags = this.filters.tags;
    if (this.filters.tag_match) pf.tag_match = this.filters.tag_match;
    if (this.filters.search) pf.search = this.filters.search;
    if (this.filters.page) pf.page = this.filters.page;
    if (this.filters.per_page) pf.per_page = this.filters.per_page;
    if (this.filters.sort_by && this.filters.sort_by !== 'relevance') {
      pf.sort_by = this.filters.sort_by;
    }
    if (this.filters.sort_order) pf.sort_order = this.filters.sort_order;
    
    return pf;
  }
}

/**
 * Apply advanced filters to passports (post-filtering for metadata-specific queries)
 */
export function applyAdvancedFilters(passports: Passport[], filters: SearchFilters): Passport[] {
  let result = passports;
  
  // Model-specific filters
  if (filters.runtime) {
    result = result.filter(p => {
      if (p.type !== 'model') return false;
      return p.metadata?.runtime_recommended === filters.runtime;
    });
  }
  
  if (filters.format) {
    result = result.filter(p => {
      if (p.type !== 'model') return false;
      return p.metadata?.format === filters.format;
    });
  }
  
  if (filters.min_vram_max !== undefined) {
    result = result.filter(p => {
      if (p.type !== 'model') return false;
      const minVram = p.metadata?.requirements?.min_vram_gb || 0;
      return minVram <= filters.min_vram_max!;
    });
  }
  
  // Compute-specific filters
  if (filters.regions && filters.regions.length > 0) {
    result = result.filter(p => {
      if (p.type !== 'compute') return false;
      const metaRegions = p.metadata?.regions || [];
      return filters.regions!.some(r => metaRegions.includes(r));
    });
  }
  
  if (filters.runtimes && filters.runtimes.length > 0) {
    result = result.filter(p => {
      if (p.type !== 'compute') return false;
      const metaRuntimes = (p.metadata?.runtimes || []).map((rt: any) => rt.name);
      return filters.runtimes!.some(r => metaRuntimes.includes(r));
    });
  }
  
  if (filters.provider_type) {
    result = result.filter(p => {
      if (p.type !== 'compute') return false;
      return p.metadata?.provider_type === filters.provider_type;
    });
  }
  
  if (filters.min_vram_gb !== undefined) {
    result = result.filter(p => {
      if (p.type !== 'compute') return false;
      const vram = p.metadata?.hardware?.vram_gb || 0;
      return vram >= filters.min_vram_gb!;
    });
  }
  
  if (filters.gpu) {
    result = result.filter(p => {
      if (p.type !== 'compute') return false;
      const gpu = p.metadata?.hardware?.gpu || '';
      return gpu.toLowerCase().includes(filters.gpu!.toLowerCase());
    });
  }
  
  return result;
}

/**
 * Calculate relevance score for a passport based on search query
 */
export function calculateRelevanceScore(passport: Passport, query: string): number {
  if (!query) return 0;

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);
  let score = 0;

  const nameLower = passport.name?.toLowerCase() || '';
  const descLower = passport.description?.toLowerCase() || '';
  const tagsLower = (passport.tags || []).map(t => t.toLowerCase());

  // Exact name match (highest bonus)
  if (nameLower === queryLower) {
    score += 100;
  }

  // Name contains full query string (bonus for phrase match)
  if (queryTerms.length === 1 && nameLower.includes(queryLower)) {
    score += 50;
  }

  // Per-term scoring — accumulates with more matching terms
  for (const term of queryTerms) {
    if (nameLower.includes(term)) {
      score += 30;
    }
    if (descLower.includes(term)) {
      score += 25;
    }
    if (tagsLower.some(t => t.includes(term))) {
      score += 15;
    }
  }

  // Metadata fields (for model/compute specific search)
  if (passport.type === 'model' && passport.metadata) {
    const modelName = passport.metadata.model_name?.toLowerCase() || '';
    for (const term of queryTerms) {
      if (modelName.includes(term)) {
        score += 15;
      }
    }
  }

  if (passport.type === 'compute' && passport.metadata) {
    const gpu = passport.metadata.hardware?.gpu?.toLowerCase() || '';
    for (const term of queryTerms) {
      if (gpu.includes(term)) {
        score += 10;
      }
    }
  }

  return score;
}

/**
 * Sort passports by relevance score
 */
export function sortByRelevance(passports: Passport[], query: string): ScoredPassport[] {
  const scored = passports.map(p => ({
    passport: p,
    score: calculateRelevanceScore(p, query),
  }));
  
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Generate facets from a list of passports
 */
export function generateFacets(passports: Passport[]): SearchResult['facets'] {
  const types: Record<string, number> = {};
  const regions: Record<string, number> = {};
  const runtimes: Record<string, number> = {};
  const provider_types: Record<string, number> = {};
  
  for (const p of passports) {
    // Count types
    types[p.type] = (types[p.type] || 0) + 1;
    
    // Compute-specific facets
    if (p.type === 'compute' && p.metadata) {
      // Count regions
      const metaRegions = p.metadata.regions || [];
      for (const region of metaRegions) {
        regions[region] = (regions[region] || 0) + 1;
      }
      
      // Count runtimes
      const metaRuntimes = (p.metadata.runtimes || []).map((rt: any) => rt.name);
      for (const runtime of metaRuntimes) {
        runtimes[runtime] = (runtimes[runtime] || 0) + 1;
      }
      
      // Count provider types
      if (p.metadata.provider_type) {
        provider_types[p.metadata.provider_type] = 
          (provider_types[p.metadata.provider_type] || 0) + 1;
      }
    }
    
    // Model-specific facets
    if (p.type === 'model' && p.metadata) {
      if (p.metadata.runtime_recommended) {
        runtimes[p.metadata.runtime_recommended] = 
          (runtimes[p.metadata.runtime_recommended] || 0) + 1;
      }
    }
  }
  
  return { types, regions, runtimes, provider_types };
}

/**
 * Build a full search result with pagination and facets
 */
export function buildSearchResult(
  passports: Passport[],
  filters: SearchFilters,
  includeFacets: boolean = false
): SearchResult {
  // Apply advanced filters
  const filtered = applyAdvancedFilters(passports, filters);
  
  // Calculate facets before pagination
  const facets = includeFacets ? generateFacets(filtered) : undefined;
  
  // Sort by relevance if search query exists
  let items: ScoredPassport[];
  if (filters.search && filters.sort_by === 'relevance') {
    items = sortByRelevance(filtered, filters.search);
  } else {
    items = filtered.map(p => ({ passport: p, score: 0 }));
    
    // Apply traditional sorting
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = (a.passport.name || '').localeCompare(b.passport.name || '');
      } else if (sortBy === 'updated_at') {
        cmp = a.passport.updated_at - b.passport.updated_at;
      } else if (sortBy === 'created_at') {
        cmp = a.passport.created_at - b.passport.created_at;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }
  
  // Pagination
  const page = Math.max(1, filters.page || 1);
  const perPage = Math.min(100, Math.max(1, filters.per_page || 20));
  const total = items.length;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const paginatedItems = items.slice(start, start + perPage);
  
  return {
    items: paginatedItems,
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
    facets,
  };
}

/**
 * Helper to create a query builder
 */
export function query(initialFilters?: Partial<SearchFilters>): SearchQueryBuilder {
  return new SearchQueryBuilder(initialFilters);
}

/**
 * Predefined query for finding models compatible with a compute passport
 */
export function modelsForCompute(computePassport: Passport): SearchQueryBuilder {
  const vram = computePassport.metadata?.hardware?.vram_gb || 0;
  const runtimes = (computePassport.metadata?.runtimes || [])
    .map((rt: any) => rt.name);
  
  const builder = new SearchQueryBuilder()
    .type('model')
    .status('active')
    .maxVramRequirement(vram);
  
  // Add runtime filter if compute supports specific runtimes
  if (runtimes.length > 0) {
    // Note: This would require multiple queries or OR logic
    // For now, filter by first supported runtime
    builder.runtime(runtimes[0]);
  }
  
  return builder;
}

/**
 * Predefined query for finding compute providers compatible with a model
 */
export function computeForModel(modelPassport: Passport): SearchQueryBuilder {
  const minVram = modelPassport.metadata?.requirements?.min_vram_gb || 0;
  const runtime = modelPassport.metadata?.runtime_recommended;
  
  const builder = new SearchQueryBuilder()
    .type('compute')
    .status('active')
    .minVram(minVram);
  
  if (runtime) {
    builder.runtimes(runtime);
  }
  
  return builder;
}
