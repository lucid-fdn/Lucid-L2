/**
 * LucidOnChainProvider — IReputationProvider backed by Solana/Anchor program.
 *
 * Reads and writes reputation data (feedback, validations, summaries) via
 * on-chain PDAs using the Anchor framework.
 */

import { PublicKey } from '@solana/web3.js';
import { IReputationProvider } from '../IReputationProvider';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
  ASSET_TYPE_MAP,
  ASSET_TYPE_REVERSE,
  AssetType,
} from '../types';

/**
 * Convert a hex-encoded string to a number[] (byte array).
 */
function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Write a u32 value as a 4-byte little-endian Buffer.
 */
function u32LEBuffer(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

export class LucidOnChainProvider implements IReputationProvider {
  readonly providerName = 'lucid-onchain';

  private program: any;
  private wallet: any;

  constructor(program: any, wallet: any) {
    this.program = program;
    this.wallet = wallet;
  }

  // ---------------------------------------------------------------------------
  // PDA derivation helpers
  // ---------------------------------------------------------------------------

  private findStatsPDA(passportId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stats'), Buffer.from(passportId)],
      this.program.programId,
    );
  }

  private findFeedbackPDA(passportId: string, index: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('feedback'), Buffer.from(passportId), u32LEBuffer(index)],
      this.program.programId,
    );
  }

  private findValidationPDA(passportId: string, receiptHash: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('validation'), Buffer.from(passportId), receiptHash],
      this.program.programId,
    );
  }

  // ---------------------------------------------------------------------------
  // IReputationProvider implementation
  // ---------------------------------------------------------------------------

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    try {
      const [statsPDA] = this.findStatsPDA(params.passportId);

      // Auto-init stats account if it doesn't exist yet
      let statsExists = true;
      try {
        await this.program.account.passportStats.fetch(statsPDA);
      } catch {
        statsExists = false;
      }

      if (!statsExists) {
        await this.program.methods
          .initStats(params.passportId)
          .accounts({
            stats: statsPDA,
            authority: this.wallet.publicKey,
            systemProgram: PublicKey.default,
          })
          .rpc();
      }

      // Fetch current stats to determine the next feedback index
      const stats = await this.program.account.passportStats.fetch(statsPDA);
      const nextIndex = stats.feedbackCount;
      const [feedbackPDA] = this.findFeedbackPDA(params.passportId, nextIndex);

      const receiptBytes = hexToBytes(params.receiptHash);
      const assetTypeValue = ASSET_TYPE_MAP[params.assetType];

      const txHash = await this.program.methods
        .submitFeedback(
          params.passportId,
          params.score,
          params.category,
          receiptBytes,
          assetTypeValue,
          params.metadata ?? null,
        )
        .accounts({
          feedback: feedbackPDA,
          stats: statsPDA,
          authority: this.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return { success: true, txHash };
    } catch (error: any) {
      return { success: false, txHash: undefined };
    }
  }

  async readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]> {
    try {
      const [statsPDA] = this.findStatsPDA(passportId);
      const stats = await this.program.account.passportStats.fetch(statsPDA);
      const count: number = typeof stats.feedbackCount === 'number'
        ? stats.feedbackCount
        : stats.feedbackCount.toNumber();

      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? count;
      const results: ReputationData[] = [];

      for (let i = offset; i < Math.min(offset + limit, count); i++) {
        try {
          const [feedbackPDA] = this.findFeedbackPDA(passportId, i);
          const entry = await this.program.account.feedbackEntry.fetch(feedbackPDA);

          const assetType: AssetType = ASSET_TYPE_REVERSE[entry.assetType] ?? 'model';

          // Apply optional filters
          if (options?.category && entry.category !== options.category) continue;
          if (options?.assetType && assetType !== options.assetType) continue;

          results.push({
            passportId: entry.passportId,
            from: entry.from.toBase58 ? entry.from.toBase58() : String(entry.from),
            score: entry.score,
            category: entry.category,
            receiptHash: entry.receiptHash,
            assetType,
            timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : entry.timestamp.toNumber(),
            revoked: entry.revoked ?? false,
            index: i,
          });
        } catch {
          // Skip entries that can't be fetched (e.g. closed accounts)
          continue;
        }
      }

      return results;
    } catch {
      // Stats PDA doesn't exist → no feedback
      return [];
    }
  }

  async getSummary(passportId: string): Promise<ReputationSummary> {
    try {
      const [statsPDA] = this.findStatsPDA(passportId);
      const stats = await this.program.account.passportStats.fetch(statsPDA);

      const feedbackCount = typeof stats.feedbackCount === 'number'
        ? stats.feedbackCount
        : stats.feedbackCount.toNumber();

      const validationCount = typeof stats.validationCount === 'number'
        ? stats.validationCount
        : stats.validationCount.toNumber();

      const totalScore = typeof stats.totalScore === 'number'
        ? stats.totalScore
        : stats.totalScore.toNumber();

      const lastUpdated = typeof stats.lastUpdated === 'number'
        ? stats.lastUpdated
        : stats.lastUpdated.toNumber();

      // On-chain avgScore is stored as integer * 100 (e.g. 8500 = 85.00)
      const avgScore = typeof stats.avgScore === 'number'
        ? stats.avgScore / 100
        : stats.avgScore.toNumber() / 100;

      return {
        passportId,
        feedbackCount,
        validationCount,
        avgScore,
        totalScore,
        lastUpdated,
      };
    } catch {
      // PDA doesn't exist — return zero summary
      return {
        passportId,
        feedbackCount: 0,
        validationCount: 0,
        avgScore: 0,
        totalScore: 0,
        lastUpdated: 0,
      };
    }
  }

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    try {
      const receiptBytes = hexToBytes(params.receiptHash);
      const receiptBuffer = Buffer.from(receiptBytes);

      const [validationPDA] = this.findValidationPDA(params.passportId, receiptBuffer);
      const [statsPDA] = this.findStatsPDA(params.passportId);
      const assetTypeValue = ASSET_TYPE_MAP[params.assetType];

      const txHash = await this.program.methods
        .submitValidation(
          params.passportId,
          receiptBytes,
          params.valid,
          assetTypeValue,
          params.metadata ?? null,
        )
        .accounts({
          validation: validationPDA,
          stats: statsPDA,
          authority: this.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return { success: true, txHash };
    } catch (error: any) {
      return { success: false, txHash: undefined };
    }
  }

  async getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null> {
    try {
      const receiptBytes = hexToBytes(receiptHash);
      const receiptBuffer = Buffer.from(receiptBytes);
      const [validationPDA] = this.findValidationPDA(passportId, receiptBuffer);
      const entry = await this.program.account.validationEntry.fetch(validationPDA);

      const assetType: AssetType = ASSET_TYPE_REVERSE[entry.assetType] ?? 'model';

      return {
        passportId: entry.passportId,
        validator: entry.validator.toBase58 ? entry.validator.toBase58() : String(entry.validator),
        valid: entry.valid,
        receiptHash: entry.receiptHash,
        assetType,
        timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : entry.timestamp.toNumber(),
      };
    } catch {
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
