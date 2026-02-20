/**
 * Routing and compute matching wrappers.
 */

import { LucidClient } from './client';
import type { RouteRequest, RouteResult, MatchResult, Policy } from './types';

export class RoutingClient {
  constructor(
    private client: LucidClient,
    private defaultChainId?: string,
  ) {}

  /**
   * Route a model to the best available compute node.
   */
  async route(request: RouteRequest): Promise<RouteResult> {
    const body = {
      model_meta: request.model_meta,
      model_passport_id: request.model_passport_id,
      policy: request.policy,
      compute_catalog: request.compute_catalog,
      chainId: request.chainId || this.defaultChainId,
    };

    const chainId = request.chainId || this.defaultChainId;
    const path = chainId ? '/v2/route' : '/v1/route';

    const response = await this.client.post<RouteResult>(path, body);
    return response.data;
  }

  /**
   * Match compute for a model against a catalog with policy constraints.
   */
  async match(request: {
    model_meta: Record<string, unknown>;
    compute_catalog: Record<string, unknown>[];
    policy: Policy;
  }): Promise<MatchResult> {
    const response = await this.client.post<MatchResult>('/v1/match', request);
    return response.data;
  }

  /**
   * Evaluate a policy against compute/model metadata and get detailed explanation.
   */
  async explain(request: {
    policy: Policy;
    compute_meta?: Record<string, unknown>;
    model_meta?: Record<string, unknown>;
  }): Promise<{ success: boolean; allowed: boolean; reasons: string[]; policy_hash: string }> {
    const response = await this.client.post('/v1/match/explain', request);
    return response.data as any;
  }
}
