// @lucidlayer/sdk - Passport Module
// CRUD operations for passports

import type { LucidClient } from '../client';
import type {
  Passport,
  CreatePassportRequest,
  UpdatePassportRequest,
  PassportFilters,
  PaginatedResponse,
} from '../types';

/**
 * PassportModule - Manage passports (models, compute, tools, datasets, agents)
 * 
 * @example
 * ```typescript
 * // Create a model passport
 * const passport = await client.passports.create({
 *   type: 'model',
 *   owner: 'wallet-address',
 *   metadata: {
 *     name: 'Llama-2-7b',
 *     format: 'safetensors',
 *     runtime_recommended: 'vllm',
 *     hf_repo: 'meta-llama/Llama-2-7b-hf'
 *   }
 * });
 * 
 * // Get a passport
 * const passport = await client.passports.get('passport-id');
 * 
 * // Update a passport
 * const updated = await client.passports.update('passport-id', {
 *   metadata: { name: 'Updated Name' }
 * });
 * 
 * // List passports
 * const result = await client.passports.list({ type: 'model', page: 1 });
 * ```
 */
export class PassportModule {
  constructor(private client: LucidClient) {}

  /**
   * Create a new passport
   * 
   * @param data Passport creation data
   * @returns Created passport
   */
  async create(data: CreatePassportRequest): Promise<Passport> {
    const response = await this.client.request<{
      success: boolean;
      passport_id: string;
      passport: Passport;
    }>('POST', '/v1/passports', { body: data });

    return response.passport;
  }

  /**
   * Get a passport by ID
   * 
   * @param passportId Passport ID
   * @returns Passport
   */
  async get(passportId: string): Promise<Passport> {
    const response = await this.client.request<{
      success: boolean;
      passport: Passport;
    }>('GET', `/v1/passports/${passportId}`);

    return response.passport;
  }

  /**
   * Update a passport
   * 
   * @param passportId Passport ID
   * @param data Update data
   * @param ownerAddress Optional owner address for authorization
   * @returns Updated passport
   */
  async update(
    passportId: string,
    data: UpdatePassportRequest,
    ownerAddress?: string
  ): Promise<Passport> {
    const headers: Record<string, string> = {};
    if (ownerAddress) {
      headers['X-Owner-Address'] = ownerAddress;
    }

    const response = await this.client.request<{
      success: boolean;
      passport: Passport;
    }>('PATCH', `/v1/passports/${passportId}`, {
      body: data,
      headers,
    });

    return response.passport;
  }

  /**
   * Delete (revoke) a passport
   * 
   * @param passportId Passport ID
   * @param ownerAddress Optional owner address for authorization
   * @returns Success status
   */
  async delete(passportId: string, ownerAddress?: string): Promise<boolean> {
    const headers: Record<string, string> = {};
    if (ownerAddress) {
      headers['X-Owner-Address'] = ownerAddress;
    }

    const response = await this.client.request<{
      success: boolean;
      deleted: boolean;
    }>('DELETE', `/v1/passports/${passportId}`, { headers });

    return response.deleted;
  }

  /**
   * List passports with filtering and pagination
   * 
   * @param filters Filter options
   * @returns Paginated list of passports
   */
  async list(filters?: PassportFilters): Promise<PaginatedResponse<Passport>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.type) {
        query.type = Array.isArray(filters.type) ? filters.type.join(',') : filters.type;
      }
      if (filters.owner) query.owner = filters.owner;
      if (filters.status) {
        query.status = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
      }
      if (filters.tags) query.tags = filters.tags.join(',');
      if (filters.tag_match) query.tag_match = filters.tag_match;
      if (filters.search) query.search = filters.search;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
      if (filters.sort_by) query.sort_by = filters.sort_by;
      if (filters.sort_order) query.sort_order = filters.sort_order;
    }

    const response = await this.client.request<{
      success: boolean;
      passports: Passport[];
      pagination: PaginatedResponse<Passport>['pagination'];
    }>('GET', '/v1/passports', { query });

    return {
      items: response.passports,
      pagination: response.pagination,
    };
  }

  /**
   * Sync a passport to the blockchain
   * 
   * @param passportId Passport ID
   * @returns On-chain sync result
   */
  async sync(passportId: string): Promise<{ pda: string; tx: string }> {
    const response = await this.client.request<{
      success: boolean;
      on_chain_pda: string;
      on_chain_tx: string;
    }>('POST', `/v1/passports/${passportId}/sync`);

    return {
      pda: response.on_chain_pda,
      tx: response.on_chain_tx,
    };
  }

  /**
   * Get passports pending on-chain sync
   * 
   * @returns List of passports pending sync
   */
  async getPendingSync(): Promise<Passport[]> {
    const response = await this.client.request<{
      success: boolean;
      count: number;
      passports: Passport[];
    }>('GET', '/v1/passports/pending-sync');

    return response.passports;
  }

  /**
   * Get passport statistics
   * 
   * @returns Passport stats by type and status
   */
  async getStats(): Promise<{
    total: number;
    by_type: Record<string, number>;
    by_status: Record<string, number>;
  }> {
    const response = await this.client.request<{
      success: boolean;
      stats: {
        total: number;
        by_type: Record<string, number>;
        by_status: Record<string, number>;
      };
    }>('GET', '/v1/passports/stats');

    return response.stats;
  }
}
