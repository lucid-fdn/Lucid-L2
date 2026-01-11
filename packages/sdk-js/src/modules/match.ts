// @lucidlayer/sdk - Match Module
// Compute matching and policy evaluation operations

import type { LucidClient } from '../client';
import type { Policy, MatchResult } from '../types';

/**
 * MatchModule - Find compatible compute for models based on policy
 * 
 * @example
 * ```typescript
 * // Find compute for a model
 * const match = await client.match.computeForModel('model-passport-id', {
 *   version: '1.0',
 *   constraints: {
 *     allowed_regions: ['us-east', 'eu-west'],
 *     min_vram_gb: 24
 *   }
 * });
 * 
 * // Explain matching decision
 * const explanation = await client.match.explain('model-passport-id', policy);
 * ```
 */
export class MatchModule {
  constructor(private client: LucidClient) {}

  /**
   * Find compatible compute for a model
   * 
   * @param modelId Model passport ID
   * @param policy Optional policy constraints
   * @param computeCatalog Optional compute catalog (defaults to registry)
   * @returns Match result with selected compute and fallbacks
   */
  async computeForModel(
    modelId: string,
    policy?: Policy,
    computeCatalog?: any[]
  ): Promise<MatchResult> {
    const response = await this.client.request<{
      success: boolean;
      match?: MatchResult['match'];
      explain?: MatchResult['explain'];
      error?: string;
    }>('POST', '/v1/match', {
      body: {
        model_meta: { passport_id: modelId },
        policy: policy || { version: '1.0' },
        compute_catalog: computeCatalog,
        require_live_healthy: true,
      },
    });

    return {
      success: response.success,
      match: response.match,
      explain: response.explain,
      error: response.error,
    };
  }

  /**
   * Alias for computeForModel
   */
  async best(
    modelId: string,
    policy?: Policy,
    computeCatalog?: any[]
  ): Promise<MatchResult> {
    return this.computeForModel(modelId, policy, computeCatalog);
  }

  /**
   * Explain policy evaluation against compute
   * 
   * @param policy Policy to evaluate
   * @param computeMeta Compute metadata to check
   * @param modelMeta Optional model metadata
   * @returns Policy evaluation result
   */
  async explain(
    policy: Policy,
    computeMeta: any,
    modelMeta?: any
  ): Promise<{
    allowed: boolean;
    reasons: string[];
    policy_hash: string;
  }> {
    const response = await this.client.request<{
      success: boolean;
      allowed: boolean;
      reasons: string[];
      policy_hash: string;
    }>('POST', '/v1/match/explain', {
      body: {
        policy,
        compute_meta: computeMeta,
        model_meta: modelMeta,
      },
    });

    return {
      allowed: response.allowed,
      reasons: response.reasons,
      policy_hash: response.policy_hash,
    };
  }

  /**
   * Get an executable route for a model
   * 
   * @param modelMeta Model metadata
   * @param policy Policy constraints
   * @param computeCatalog Available compute catalog
   * @param requestId Optional request ID
   * @returns Route with endpoint, runtime, and fallbacks
   */
  async route(
    modelMeta: any,
    policy: Policy,
    computeCatalog: any[],
    requestId?: string
  ): Promise<{
    success: boolean;
    request_id?: string;
    route?: {
      compute_passport_id: string;
      model_passport_id: string;
      endpoint: string;
      runtime: string;
      policy_hash: string;
      fallbacks: string[];
    };
    explain?: any;
    error?: string;
  }> {
    const response = await this.client.request<{
      success: boolean;
      request_id?: string;
      route?: any;
      explain?: any;
      error?: string;
    }>('POST', '/v1/route', {
      body: {
        model_meta: modelMeta,
        policy,
        compute_catalog: computeCatalog,
        request_id: requestId,
        require_live_healthy: true,
      },
    });

    return {
      success: response.success,
      request_id: response.request_id,
      route: response.route,
      explain: response.explain,
      error: response.error,
    };
  }
}
