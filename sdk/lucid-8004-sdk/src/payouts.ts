/**
 * Payout calculation and execution wrappers.
 */

import { LucidClient } from './client';
import type {
  PayoutCalculateRequest,
  PayoutResult,
  PayoutExecuteRequest,
  PayoutExecution,
} from './types';

export class PayoutClient {
  constructor(private client: LucidClient) {}

  /**
   * Calculate a payout split for a run.
   */
  async calculate(request: PayoutCalculateRequest): Promise<PayoutResult> {
    const response = await this.client.post<PayoutResult>(
      '/v1/payouts/calculate',
      request
    );
    return response.data;
  }

  /**
   * Calculate payout from receipt token data.
   */
  async fromReceipt(request: {
    run_id: string;
    tokens_in: number;
    tokens_out: number;
    price_per_1k_tokens_lamports: string;
    compute_wallet: string;
    model_wallet?: string;
    orchestrator_wallet?: string;
  }): Promise<PayoutResult> {
    const response = await this.client.post<PayoutResult>(
      '/v1/payouts/from-receipt',
      request
    );
    return response.data;
  }

  /**
   * Get a stored payout split.
   */
  async get(runId: string): Promise<PayoutResult> {
    const response = await this.client.get<PayoutResult>(
      `/v1/payouts/${runId}`
    );
    return response.data;
  }

  /**
   * Verify payout split integrity.
   */
  async verify(runId: string): Promise<{ success: boolean; valid: boolean; error?: string }> {
    const response = await this.client.get(`/v1/payouts/${runId}/verify`);
    return response.data as any;
  }

  /**
   * Execute a payout split on-chain via USDC transfers.
   */
  async execute(request: PayoutExecuteRequest): Promise<PayoutExecution> {
    const response = await this.client.post<PayoutExecution>(
      '/v2/payouts/execute',
      request
    );
    return response.data;
  }

  /**
   * Get payout execution status.
   */
  async getExecution(
    runId: string,
    chainId: string
  ): Promise<PayoutExecution> {
    const response = await this.client.get<PayoutExecution>(
      `/v2/payouts/${runId}/execution`,
      { chainId }
    );
    return response.data;
  }
}
