import { getClient } from '../../db/pool';

export interface RecordRevenueParams {
  passport_id: string;
  run_id: string;
  amount: bigint;
  token: string;
  chain: string;
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  tx_hash?: string;
}

export interface RevenueInfo {
  total: bigint;
  pending: bigint;
  withdrawn: bigint;
  token: string;
}

export interface WithdrawResult {
  amount: bigint;
  token: string;
  /** Status of the withdrawal — 'pending_payout' means DB records are marked,
   *  actual on-chain transfer happens via the batch payout epoch. */
  status: 'pending_payout' | 'no_funds';
}

export class RevenueService {
  async recordRevenue(params: RecordRevenueParams): Promise<void> {
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO asset_revenue (passport_id, run_id, amount, token, chain, role, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [params.passport_id, params.run_id, params.amount.toString(), params.token, params.chain, params.role, params.tx_hash ?? null],
      );
    } finally {
      client.release();
    }
  }

  async getRevenue(passportId: string, token: string = 'USDC'): Promise<RevenueInfo> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COALESCE(SUM(amount), 0) as total,
           COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) as pending,
           COALESCE(SUM(CASE WHEN status = 'withdrawn' THEN amount ELSE 0 END), 0) as withdrawn
         FROM asset_revenue WHERE passport_id = $1 AND token = $2`,
        [passportId, token],
      );
      const row = result.rows[0];
      return {
        total: BigInt(row.total),
        pending: BigInt(row.pending),
        withdrawn: BigInt(row.withdrawn),
        token,
      };
    } finally {
      client.release();
    }
  }

  async withdraw(passportId: string, token: string = 'USDC'): Promise<WithdrawResult> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const sumResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM asset_revenue
         WHERE passport_id = $1 AND token = $2 AND status = 'confirmed'`,
        [passportId, token],
      );
      const amount = BigInt(sumResult.rows[0].total);
      if (amount > 0n) {
        await client.query(
          `UPDATE asset_revenue SET status = 'withdrawn'
           WHERE passport_id = $1 AND token = $2 AND status = 'confirmed'`,
          [passportId, token],
        );
      }
      await client.query('COMMIT');
      return { amount, token, status: amount > 0n ? 'pending_payout' as const : 'no_funds' as const };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
