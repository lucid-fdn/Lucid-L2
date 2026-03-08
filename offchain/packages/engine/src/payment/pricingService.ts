import { getClient } from '../db/pool';

export interface AssetPricing {
  passport_id: string;
  price_per_call: bigint | null;
  price_per_token: bigint | null;
  price_subscription_hour: bigint | null;
  accepted_tokens: string[];
  accepted_chains: string[];
  payout_address: string;
  custom_split_bps: Record<string, number> | null;
  updated_at?: Date;
}

export interface SetPricingParams {
  passport_id: string;
  price_per_call?: bigint;
  price_per_token?: bigint;
  price_subscription_hour?: bigint;
  accepted_tokens?: string[];
  accepted_chains?: string[];
  payout_address: string;
  custom_split_bps?: Record<string, number>;
}

export class PricingService {
  async getPricing(passportId: string): Promise<AssetPricing | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        'SELECT * FROM asset_pricing WHERE passport_id = $1',
        [passportId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        passport_id: row.passport_id,
        price_per_call: row.price_per_call ? BigInt(row.price_per_call) : null,
        price_per_token: row.price_per_token ? BigInt(row.price_per_token) : null,
        price_subscription_hour: row.price_subscription_hour ? BigInt(row.price_subscription_hour) : null,
        accepted_tokens: row.accepted_tokens || ['USDC'],
        accepted_chains: row.accepted_chains || ['base'],
        payout_address: row.payout_address,
        custom_split_bps: row.custom_split_bps,
        updated_at: row.updated_at,
      };
    } finally {
      client.release();
    }
  }

  async setPricing(params: SetPricingParams): Promise<void> {
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO asset_pricing (passport_id, price_per_call, price_per_token, price_subscription_hour,
         accepted_tokens, accepted_chains, payout_address, custom_split_bps, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (passport_id) DO UPDATE SET
           price_per_call = EXCLUDED.price_per_call,
           price_per_token = EXCLUDED.price_per_token,
           price_subscription_hour = EXCLUDED.price_subscription_hour,
           accepted_tokens = EXCLUDED.accepted_tokens,
           accepted_chains = EXCLUDED.accepted_chains,
           payout_address = EXCLUDED.payout_address,
           custom_split_bps = EXCLUDED.custom_split_bps,
           updated_at = now()`,
        [
          params.passport_id,
          params.price_per_call?.toString() ?? null,
          params.price_per_token?.toString() ?? null,
          params.price_subscription_hour?.toString() ?? null,
          params.accepted_tokens ?? ['USDC'],
          params.accepted_chains ?? ['base'],
          params.payout_address,
          params.custom_split_bps ? JSON.stringify(params.custom_split_bps) : null,
        ],
      );
    } finally {
      client.release();
    }
  }

  async deletePricing(passportId: string): Promise<boolean> {
    const client = await getClient();
    try {
      const result = await client.query(
        'DELETE FROM asset_pricing WHERE passport_id = $1',
        [passportId],
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
