// @lucidlayer/sdk - Search Module
// Search and discovery operations for passports

import type { LucidClient } from '../client';
import type {
  Passport,
  ModelSearchFilters,
  ComputeSearchFilters,
  PaginatedResponse,
} from '../types';

/**
 * SearchModule - Search and discover models, compute, tools, datasets, agents
 * 
 * @example
 * ```typescript
 * // Search models
 * const models = await client.search.models({
 *   runtime: 'vllm',
 *   max_vram: 24,
 *   search: 'llama'
 * });
 * 
 * // Search compute providers
 * const compute = await client.search.compute({
 *   regions: ['us-east', 'eu-west'],
 *   min_vram: 40,
 *   runtimes: ['vllm']
 * });
 * ```
 */
export class SearchModule {
  constructor(private client: LucidClient) {}

  /**
   * Search model passports
   * 
   * @param filters Model-specific filters
   * @returns Paginated list of model passports
   */
  async models(filters?: ModelSearchFilters): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.runtime) query.runtime = filters.runtime;
      if (filters.format) query.format = filters.format;
      if (filters.max_vram) query.max_vram = filters.max_vram;
      if (filters.owner) query.owner = filters.owner;
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      models: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/models', { query });

    return {
      items: response.models,
      pagination: response.pagination,
    };
  }

  /**
   * Search compute passports
   * 
   * @param filters Compute-specific filters
   * @returns Paginated list of compute passports
   */
  async compute(filters?: ComputeSearchFilters): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.regions) query.regions = filters.regions.join(',');
      if (filters.runtimes) query.runtimes = filters.runtimes.join(',');
      if (filters.provider_type) query.provider_type = filters.provider_type;
      if (filters.min_vram) query.min_vram = filters.min_vram;
      if (filters.gpu) query.gpu = filters.gpu;
      if (filters.owner) query.owner = filters.owner;
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      compute: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/compute', { query });

    return {
      items: response.compute,
      pagination: response.pagination,
    };
  }

  /**
   * Search tool passports
   * 
   * @param filters Basic filters
   * @returns Paginated list of tool passports
   */
  async tools(filters?: {
    owner?: string;
    tags?: string[];
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.owner) query.owner = filters.owner;
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      tools: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/tools', { query });

    return {
      items: response.tools,
      pagination: response.pagination,
    };
  }

  /**
   * Search dataset passports
   * 
   * @param filters Basic filters
   * @returns Paginated list of dataset passports
   */
  async datasets(filters?: {
    owner?: string;
    tags?: string[];
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.owner) query.owner = filters.owner;
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      datasets: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/datasets', { query });

    return {
      items: response.datasets,
      pagination: response.pagination,
    };
  }

  /**
   * Search agent passports
   * 
   * @param filters Basic filters
   * @returns Paginated list of agent passports
   */
  async agents(filters?: {
    owner?: string;
    tags?: string[];
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.owner) query.owner = filters.owner;
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      agents: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/agents', { query });

    return {
      items: response.agents,
      pagination: response.pagination,
    };
  }
}
