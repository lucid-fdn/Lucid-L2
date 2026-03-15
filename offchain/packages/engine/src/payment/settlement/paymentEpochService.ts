// offchain/packages/engine/src/finance/paymentEpochService.ts

import pool from '../../db/pool';

export interface PaymentEpoch {
  id: string;
  epoch_index: number;
  status: 'open' | 'settling' | 'settled';
  receipt_epoch_refs: string[];
  settlement_root?: string;
  chain_tx?: Record<string, string>;
  total_settled_usd: number;
  entry_count: number;
  opened_at: Date;
  settled_at?: Date;
}

export interface SettlementEntry {
  payer: string;
  payee: string;
  token: string;
  total_amount: string;
  call_count: number;
}

export class PaymentEpochService {
  private static instance: PaymentEpochService | null = null;

  private constructor() {}

  static getInstance(): PaymentEpochService {
    if (!PaymentEpochService.instance) {
      PaymentEpochService.instance = new PaymentEpochService();
    }
    return PaymentEpochService.instance;
  }

  /**
   * Get or create current open payment epoch.
   */
  async getCurrentEpoch(): Promise<PaymentEpoch> {
    const { rows } = await pool.query(
      "SELECT * FROM payment_epochs WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1"
    );

    if (rows.length > 0) return this.mapRow(rows[0]);

    // Create new epoch
    const { rows: newRows } = await pool.query(
      `INSERT INTO payment_epochs (epoch_index, status)
       VALUES ((SELECT COALESCE(MAX(epoch_index), 0) + 1 FROM payment_epochs), 'open')
       RETURNING *`
    );

    return this.mapRow(newRows[0]);
  }

  /**
   * Aggregate payment_events into settlement entries for current epoch.
   * Triggered: >$100 accumulated OR >24 hours since epoch opened.
   */
  async aggregateAndSettle(): Promise<{ epochId: string; entries: SettlementEntry[] } | null> {
    const epoch = await this.getCurrentEpoch();

    // Check thresholds
    const ageHours = (Date.now() - epoch.opened_at.getTime()) / (1000 * 3600);
    const { rows: totalRows } = await pool.query(
      "SELECT COALESCE(SUM(amount_usd), 0) as total FROM payment_events WHERE created_at >= $1",
      [epoch.opened_at]
    );
    const totalUsd = parseFloat(totalRows[0].total);

    if (totalUsd < 100 && ageHours < 24) {
      return null; // Not ready to settle
    }

    // Aggregate
    const { rows: entries } = await pool.query(
      `SELECT payer_address as payer, payee_address as payee, token,
              SUM(CAST(amount_raw AS NUMERIC))::TEXT as total_amount,
              COUNT(*)::INTEGER as call_count
       FROM payment_events
       WHERE created_at >= $1
       GROUP BY payer_address, payee_address, token`,
      [epoch.opened_at]
    );

    // Mark epoch as settling
    await pool.query(
      "UPDATE payment_epochs SET status = 'settling', entry_count = $1, total_settled_usd = $2 WHERE id = $3",
      [entries.length, totalUsd, epoch.id]
    );

    return { epochId: epoch.id, entries };
  }

  /**
   * Finalize a payment epoch after on-chain settlement.
   */
  async finalizeEpoch(epochId: string, chainTx: Record<string, string>, settlementRoot: string): Promise<void> {
    await pool.query(
      "UPDATE payment_epochs SET status = 'settled', chain_tx = $1, settlement_root = $2, settled_at = NOW() WHERE id = $3",
      [JSON.stringify(chainTx), settlementRoot, epochId]
    );
  }

  /**
   * Get payment epoch by ID.
   */
  async getEpoch(epochId: string): Promise<PaymentEpoch | null> {
    const { rows } = await pool.query(
      "SELECT * FROM payment_epochs WHERE id = $1",
      [epochId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  /**
   * List payment epochs with optional status filter.
   */
  async listEpochs(status?: string, limit: number = 20): Promise<PaymentEpoch[]> {
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM payment_epochs ${where} ORDER BY opened_at DESC LIMIT $${params.length}`,
      params
    );
    return rows.map((r: any) => this.mapRow(r));
  }

  private mapRow(row: any): PaymentEpoch {
    return {
      id: row.id,
      epoch_index: row.epoch_index,
      status: row.status,
      receipt_epoch_refs: row.receipt_epoch_refs || [],
      settlement_root: row.settlement_root,
      chain_tx: row.chain_tx ? (typeof row.chain_tx === 'string' ? JSON.parse(row.chain_tx) : row.chain_tx) : undefined,
      total_settled_usd: parseFloat(row.total_settled_usd || '0'),
      entry_count: row.entry_count || 0,
      opened_at: new Date(row.opened_at),
      settled_at: row.settled_at ? new Date(row.settled_at) : undefined,
    };
  }
}

export function getPaymentEpochService(): PaymentEpochService {
  return PaymentEpochService.getInstance();
}
