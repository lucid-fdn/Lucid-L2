// offchain/packages/engine/src/finance/paymentEventService.ts

import pool from '../../shared/db/pool';

export interface PaymentEvent {
  id?: string;
  run_id: string;
  agent_passport_id?: string;
  payer_address: string;
  payee_address: string;
  token: string;
  amount_raw: string;
  amount_usd?: number;
  payment_method: 'grant' | 'access_receipt' | 'x402';
  grant_id?: string;
  access_receipt_tx?: string;
  receipt_epoch_id?: string;
  created_at?: Date;
}

export class PaymentEventService {
  private static instance: PaymentEventService | null = null;

  private constructor() {}

  static getInstance(): PaymentEventService {
    if (!PaymentEventService.instance) {
      PaymentEventService.instance = new PaymentEventService();
    }
    return PaymentEventService.instance;
  }

  async recordPaymentEvent(event: PaymentEvent): Promise<string> {
    const { rows } = await pool.query(
      `INSERT INTO payment_events (run_id, agent_passport_id, payer_address, payee_address, token, amount_raw, amount_usd, payment_method, grant_id, access_receipt_tx, receipt_epoch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [event.run_id, event.agent_passport_id ?? null, event.payer_address, event.payee_address,
       event.token, event.amount_raw, event.amount_usd ?? null, event.payment_method,
       event.grant_id ?? null, event.access_receipt_tx ?? null, event.receipt_epoch_id ?? null]
    );

    return rows[0].id;
  }

  async getPaymentEvents(filters: { run_id?: string; payer?: string; limit?: number }): Promise<PaymentEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.run_id) {
      params.push(filters.run_id);
      conditions.push(`run_id = $${params.length}`);
    }
    if (filters.payer) {
      params.push(filters.payer);
      conditions.push(`payer_address = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 100;
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM payment_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );

    return rows;
  }

  async ensureGrantBudget(
    grantId: string, tenantId: string, signerPubkey: string,
    maxCalls: number, maxUsd: number, expiresAt: Date
  ): Promise<void> {
    await pool.query(
      `SELECT ensure_grant_budget($1, $2, $3, $4, $5, $6)`,
      [grantId, tenantId, signerPubkey, maxCalls, maxUsd, expiresAt]
    );
  }

  async consumeGrantBudget(grantId: string, deltaUsd: number, deltaCalls: number): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT consume_grant_budget($1, $2, $3) as ok`,
      [grantId, deltaUsd, deltaCalls]
    );
    return rows[0]?.ok === true;
  }
}

export function getPaymentEventService(): PaymentEventService {
  return PaymentEventService.getInstance();
}
