import pool from '../../shared/db/pool';
import { IReputationProvider } from '../IReputationProvider';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
  AssetType,
} from '../types';
import { logger } from '../../shared/lib/logger';

export class LucidDBProvider implements IReputationProvider {
  readonly providerName = 'lucid-db';

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    try {
      const result = await pool.query(
        `INSERT INTO reputation_feedback
           (passport_id, from_address, score, category, receipt_hash, asset_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          params.passportId,
          'local',
          params.score,
          params.category,
          params.receiptHash,
          params.assetType,
          params.metadata ?? null,
        ],
      );
      const id = result.rows[0]?.id;
      return { success: true, id: String(id) };
    } catch (err) {
      logger.error('LucidDBProvider.submitFeedback error:', err);
      return { success: false };
    }
  }

  async readFeedback(
    passportId: string,
    options?: ReadOptions,
  ): Promise<ReputationData[]> {
    const conditions: string[] = ['passport_id = $1'];
    const values: unknown[] = [passportId];
    let idx = 2;

    if (options?.category) {
      conditions.push(`category = $${idx}`);
      values.push(options.category);
      idx++;
    }
    if (options?.assetType) {
      conditions.push(`asset_type = $${idx}`);
      values.push(options.assetType);
      idx++;
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const sql = `SELECT passport_id, from_address, score, category, receipt_hash,
                        asset_type, metadata, revoked, feedback_index, created_at
                 FROM reputation_feedback
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY created_at DESC
                 LIMIT $${idx} OFFSET $${idx + 1}`;
    values.push(limit, offset);

    const result = await pool.query(sql, values);
    return result.rows.map((row: Record<string, unknown>) => ({
      passportId: row.passport_id as string,
      from: row.from_address as string,
      score: Number(row.score),
      category: row.category as string,
      receiptHash: row.receipt_hash as string,
      assetType: row.asset_type as AssetType,
      timestamp: new Date(row.created_at as string).getTime(),
      revoked: Boolean(row.revoked),
      index: Number(row.feedback_index ?? 0),
    }));
  }

  async getSummary(passportId: string): Promise<ReputationSummary> {
    const feedbackResult = await pool.query(
      `SELECT COUNT(*)::int AS feedback_count,
              COALESCE(AVG(score), 0) AS avg_score,
              COALESCE(SUM(score), 0) AS total_score,
              MAX(created_at) AS last_updated
       FROM reputation_feedback
       WHERE passport_id = $1 AND revoked = false`,
      [passportId],
    );

    const validationResult = await pool.query(
      `SELECT COUNT(*)::int AS validation_count
       FROM reputation_validations
       WHERE passport_id = $1`,
      [passportId],
    );

    const fb = feedbackResult.rows[0];
    const val = validationResult.rows[0];

    return {
      passportId,
      feedbackCount: Number(fb?.feedback_count ?? 0),
      validationCount: Number(val?.validation_count ?? 0),
      avgScore: parseFloat(String(fb?.avg_score ?? 0)),
      totalScore: Number(fb?.total_score ?? 0),
      lastUpdated: fb?.last_updated
        ? new Date(fb.last_updated as string).getTime()
        : 0,
    };
  }

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    try {
      const result = await pool.query(
        `INSERT INTO reputation_validations
           (passport_id, validator, valid, receipt_hash, asset_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          params.passportId,
          'local',
          params.valid,
          params.receiptHash,
          params.assetType,
          params.metadata ?? null,
        ],
      );
      const id = result.rows[0]?.id;
      return { success: true, id: String(id) };
    } catch (err) {
      logger.error('LucidDBProvider.submitValidation error:', err);
      return { success: false };
    }
  }

  async getValidation(
    passportId: string,
    receiptHash: string,
  ): Promise<ValidationResult | null> {
    const result = await pool.query(
      `SELECT passport_id, validator, valid, receipt_hash, asset_type, created_at
       FROM reputation_validations
       WHERE passport_id = $1 AND receipt_hash = $2
       LIMIT 1`,
      [passportId, receiptHash],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      passportId: row.passport_id as string,
      validator: row.validator as string,
      valid: Boolean(row.valid),
      receiptHash: row.receipt_hash as string,
      assetType: row.asset_type as AssetType,
      timestamp: new Date(row.created_at as string).getTime(),
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await pool.query('SELECT NOW()');
      return true;
    } catch {
      return false;
    }
  }
}
