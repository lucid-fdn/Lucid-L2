/**
 * @lucid/8004-sdk — TypeScript SDK for LucidLayer
 *
 * Compute routing, validation, reputation, and payouts for ERC-8004 agents.
 * Zero dependencies beyond native fetch.
 *
 * @example
 * ```typescript
 * import { LucidLayer } from '@lucid/8004-sdk';
 *
 * const lucid = new LucidLayer({
 *   baseUrl: 'https://api.lucidlayer.com',
 *   chainId: 'apechain',
 * });
 *
 * // Route a model to compute
 * const route = await lucid.route({
 *   model_meta: { name: 'llama-3-70b', format: 'gguf', vram_gb: 40 },
 *   policy: { policy_version: '1.0', allow_regions: ['us', 'eu'] },
 * });
 *
 * // Get receipt-based reputation
 * const rep = await lucid.reputation.getReceiptBased('agent-123');
 *
 * // Execute payout split on-chain
 * const payout = await lucid.payouts.execute({ run_id: 'run_abc', chainId: 'base' });
 * ```
 */

import { LucidClient } from './client';
import { RoutingClient } from './routing';
import { ValidationClient } from './validation';
import { ReputationClient } from './reputation';
import { PayoutClient } from './payouts';
import { createX402Handler, createDryRunX402Handler } from './x402';
import type { LucidLayerConfig, RouteRequest, RouteResult, ValidateRequest, ValidateResult, InferRequest, InferResult, ChainInfo, ChainStatus } from './types';

export class LucidLayer {
  private client: LucidClient;

  /** Routing and compute matching */
  public readonly routing: RoutingClient;

  /** Receipt validation and proofs */
  public readonly validation: ValidationClient;

  /** Cross-chain and receipt-based reputation */
  public readonly reputation: ReputationClient;

  /** Payout calculation and execution */
  public readonly payouts: PayoutClient;

  private defaultChainId?: string;

  constructor(config: LucidLayerConfig) {
    this.client = new LucidClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs || 30_000,
    });

    this.defaultChainId = config.chainId;

    this.routing = new RoutingClient(this.client, config.chainId);
    this.validation = new ValidationClient(this.client, config.chainId);
    this.reputation = new ReputationClient(this.client);
    this.payouts = new PayoutClient(this.client);
  }

  // ─── Convenience methods ───────────────────────────────────

  /**
   * Route a model to the best compute node.
   * Shorthand for lucid.routing.route().
   */
  async route(request: RouteRequest): Promise<RouteResult> {
    return this.routing.route(request);
  }

  /**
   * Validate a receipt.
   * Shorthand for lucid.validation.validate().
   */
  async validate(request: ValidateRequest): Promise<ValidateResult> {
    return this.validation.validate(request);
  }

  /**
   * Run inference through LucidLayer.
   */
  async infer(request: InferRequest): Promise<InferResult> {
    const response = await this.client.post<InferResult>('/v1/run/inference', {
      model: request.model,
      model_passport_id: request.model_passport_id,
      compute_passport_id: request.compute_passport_id,
      policy: request.policy,
      prompt: request.prompt,
      messages: request.messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
    });
    return response.data;
  }

  /**
   * OpenAI-compatible chat completions through LucidLayer.
   */
  async chat(request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
  }): Promise<InferResult> {
    const response = await this.client.post<InferResult>(
      '/v1/chat/completions',
      request
    );
    return response.data;
  }

  /**
   * List all available chains and their connection status.
   */
  async chains(): Promise<ChainInfo[]> {
    const response = await this.client.get<{ success: boolean; chains: ChainInfo[] }>(
      '/v2/chains'
    );
    return response.data.chains || [];
  }

  /**
   * Get status of a specific chain.
   */
  async chainStatus(chainId: string): Promise<ChainStatus> {
    const response = await this.client.get<ChainStatus>(
      `/v2/chains/${chainId}/status`
    );
    return response.data;
  }

  /**
   * Get Merkle inclusion proof for a receipt.
   * Shorthand for lucid.validation.getProof().
   */
  async getProof(runId: string) {
    return this.validation.getProof(runId);
  }

  /**
   * Get unified cross-chain reputation for an agent.
   * Shorthand for lucid.reputation.getUnified().
   */
  async reputationScore(agentId: string) {
    return this.reputation.getUnified(agentId);
  }

  /**
   * Get per-chain reputation breakdown.
   * Shorthand for lucid.reputation.getBreakdown().
   */
  async reputationBreakdown(agentId: string) {
    return this.reputation.getBreakdown(agentId);
  }
}

// Re-export everything
export { LucidClient } from './client';
export { RoutingClient } from './routing';
export { ValidationClient } from './validation';
export { ReputationClient } from './reputation';
export { PayoutClient } from './payouts';
export { createX402Handler, createDryRunX402Handler } from './x402';
export type { X402PaymentInfo, PayTransactionFn } from './x402';
export * from './types';
