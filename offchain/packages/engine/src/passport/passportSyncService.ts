// offchain/src/services/passportSyncService.ts
// On-chain sync service for passports - implements OnChainSyncHandler

import { Connection, PublicKey, Keypair, Commitment, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider, Idl, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PATHS } from '../config/paths';
import { getSolanaKeypair } from '../chain/solana/keypair';

import { Passport, PassportType } from '../storage/passportStore';
import { OnChainSyncHandler } from './passportManager';
import { logger } from '../lib/logger';

// Program ID - deployed to devnet on Jan 27, 2026
const PASSPORT_PROGRAM_ID = process.env.PASSPORT_PROGRAM_ID || 'FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL';

// Asset type mapping (offchain -> on-chain enum)
const ASSET_TYPE_MAP: Record<PassportType, number> = {
  model: 0,    // AssetType::Model
  dataset: 1,  // AssetType::Dataset
  tool: 2,     // AssetType::Tool
  agent: 3,    // AssetType::Agent
  compute: 5,  // AssetType::Other (compute maps to Other)
};

// On-chain Version struct
interface OnChainVersion {
  major: number;
  minor: number;
  patch: number;
}

// Maximum instructions per transaction (fits within 1232-byte limit)
const MAX_IX_PER_TX = 3;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Parse version string to on-chain Version struct
 */
function parseVersion(versionStr?: string): OnChainVersion {
  if (!versionStr) {
    return { major: 1, minor: 0, patch: 0 };
  }

  // Handle formats like "1.0.0", "v1.2.3", "1.0", "1"
  const clean = versionStr.replace(/^v/, '');
  const parts = clean.split('.').map(p => parseInt(p, 10) || 0);

  return {
    major: parts[0] || 1,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Convert version to bytes for PDA derivation
 */
function versionToBytes(version: OnChainVersion): Buffer {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(version.major, 0);
  bytes.writeUInt32LE(version.minor, 4);
  bytes.writeUInt32LE(version.patch, 8);
  return bytes;
}

/**
 * Extract content hash from passport metadata
 * Falls back to hashing the metadata JSON if no explicit hash
 */
function getContentHash(passport: Passport): Buffer {
  // Check for explicit content_hash in metadata
  if (passport.metadata?.content_hash) {
    const hex = passport.metadata.content_hash.replace(/^0x/, '');
    return Buffer.from(hex, 'hex').slice(0, 32);
  }

  // Check for sha256 field
  if (passport.metadata?.sha256) {
    const hex = passport.metadata.sha256.replace(/^0x/, '');
    return Buffer.from(hex, 'hex').slice(0, 32);
  }

  // Fallback: hash the metadata JSON
  const hash = createHash('sha256')
    .update(JSON.stringify(passport.metadata || {}))
    .digest();
  return hash;
}

/**
 * Extract IPFS CID from metadata
 */
function getContentCid(passport: Passport): string {
  return passport.metadata?.content_cid ||
         passport.metadata?.ipfs_cid ||
         passport.metadata?.cid ||
         '';
}

/**
 * Extract metadata CID from passport
 */
function getMetadataCid(passport: Passport): string {
  return passport.metadata?.metadata_cid ||
         passport.metadata?.ipfs_cid ||
         '';
}

/**
 * Extract license code from metadata
 */
function getLicenseCode(passport: Passport): string {
  return passport.metadata?.license ||
         passport.metadata?.license_code ||
         passport.metadata?.spdx_license ||
         'UNLICENSED';
}

/**
 * Build policy flags from metadata
 */
function getPolicyFlags(passport: Passport): number {
  let flags = 0;
  const meta = passport.metadata || {};

  // Policy flag bits (matching on-chain definitions)
  const POLICY_ALLOW_COMMERCIAL = 1 << 0;
  const POLICY_ALLOW_DERIVATIVES = 1 << 1;
  const POLICY_ALLOW_FINETUNE = 1 << 2;
  const POLICY_REQUIRE_ATTRIBUTION = 1 << 3;
  const POLICY_SHARE_ALIKE = 1 << 4;

  if (meta.allow_commercial || meta.commercial_use) flags |= POLICY_ALLOW_COMMERCIAL;
  if (meta.allow_derivatives) flags |= POLICY_ALLOW_DERIVATIVES;
  if (meta.allow_finetune || meta.finetune_allowed) flags |= POLICY_ALLOW_FINETUNE;
  if (meta.require_attribution || meta.attribution_required) flags |= POLICY_REQUIRE_ATTRIBUTION;
  if (meta.share_alike || meta.copyleft) flags |= POLICY_SHARE_ALIKE;

  return flags;
}

/**
 * Sleep with exponential backoff
 */
async function sleepWithBackoff(attempt: number): Promise<void> {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * PassportSyncService - Syncs passports to Solana blockchain
 * Implements OnChainSyncHandler interface
 */
export class PassportSyncService implements OnChainSyncHandler {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program | null = null;
  private programId: PublicKey;
  private wallet: Wallet;
  private initialized: boolean = false;

  constructor(options?: {
    rpcUrl?: string;
    commitment?: Commitment;
    programId?: string;
  }) {
    // RPC resolution: QUICKNODE_RPC_URL -> RPC_URL -> devnet default
    const rpcUrl = options?.rpcUrl ||
                   process.env.QUICKNODE_RPC_URL ||
                   process.env.RPC_URL ||
                   'https://api.devnet.solana.com';
    const commitment = options?.commitment || 'confirmed';
    const programIdStr = options?.programId || PASSPORT_PROGRAM_ID;

    this.connection = new Connection(rpcUrl, commitment);
    this.programId = new PublicKey(programIdStr);
    this.wallet = new Wallet(this.getKeypair());
    this.provider = new AnchorProvider(this.connection, this.wallet, { commitment });
    setProvider(this.provider);

    logger.info('PassportSyncService created');
    logger.info('   RPC:', rpcUrl);
    logger.info('   Program:', programIdStr);
  }

  /**
   * Get keypair — delegates to shared parser (solana/keypair.ts).
   * Resolution: LUCID_ORCHESTRATOR_SECRET_KEY -> SOLANA_KEYPAIR -> SOLANA_KEYPAIR_PATH -> solana config CLI
   */
  private getKeypair(): Keypair {
    try {
      return getSolanaKeypair();
    } catch (e) {
      logger.warn('Could not load keypair via shared parser:', e);
      // Last resort: generate new keypair (for testing only)
      logger.warn('No keypair found, generating new one (testing only)');
      return Keypair.generate();
    }
  }

  /**
   * Initialize the program connection
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load IDL from target directory
      const idlPath = path.join(PATHS.IDL_DIR, 'lucid_passports.json');

      if (!fs.existsSync(idlPath)) {
        throw new Error(`IDL not found at ${idlPath}. Run 'anchor build -p lucid_passports' first.`);
      }

      const idlJson = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

      // Ensure metadata exists with program address
      if (!idlJson.metadata) {
        idlJson.metadata = {};
      }
      idlJson.metadata.address = this.programId.toString();

      // Create program
      this.program = new Program(idlJson as Idl, this.provider);

      logger.info('PassportSyncService initialized');
      logger.info('   Program ID:', this.program.programId.toString());
      logger.info('   Authority:', this.wallet.publicKey.toString());

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize PassportSyncService:', error);
      throw error;
    }
  }

  /**
   * Derive PDA for a passport
   */
  async derivePassportPDA(
    owner: PublicKey,
    assetType: number,
    slug: string,
    version: OnChainVersion
  ): Promise<[PublicKey, number]> {
    const versionBytes = versionToBytes(version);

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('passport'),
        owner.toBuffer(),
        Buffer.from([assetType]),
        Buffer.from(slug),
        versionBytes,
      ],
      this.programId
    );
  }

  /**
   * Build slug from passport metadata
   */
  private buildSlug(passport: Passport): string {
    // Use explicit slug if available
    if (passport.metadata?.slug) {
      return passport.metadata.slug.slice(0, 64);
    }

    // Build from name
    if (passport.name) {
      return passport.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 64);
    }

    // Use passport ID as fallback
    return passport.passport_id.slice(0, 64);
  }

  /**
   * Sync a passport to the blockchain
   * Implements OnChainSyncHandler interface
   */
  async syncToChain(passport: Passport, options?: { forceReupload?: boolean }): Promise<{ pda: string; tx: string } | null> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.program) {
      logger.error('Program not initialized');
      return null;
    }

    try {
      // Parse passport fields for on-chain format
      const ownerPubkey = new PublicKey(passport.owner);
      const assetType = ASSET_TYPE_MAP[passport.type] ?? 5; // Default to Other
      const slug = this.buildSlug(passport);
      const version = parseVersion(passport.version);
      const contentCid = getContentCid(passport);
      const contentHash = getContentHash(passport);
      let metadataCid = getMetadataCid(passport);
      const licenseCode = getLicenseCode(passport);

      // Upload metadata to DePIN permanent storage via AnchorDispatcher
      // Re-upload when forceReupload is true (metadata changed) or when no CID exists yet
      if (!metadataCid || options?.forceReupload) {
        try {
          const { getAnchorDispatcher } = await import('../anchoring');
          const anchorResult = await getAnchorDispatcher().dispatch({
            artifact_type: 'passport_metadata',
            artifact_id: passport.passport_id,
            agent_passport_id: passport.type === 'agent' ? passport.passport_id : null,
            producer: 'passportSyncService',
            storage_tier: 'permanent',
            payload: passport.metadata,
            tags: {
              'lucid-passport-id': passport.passport_id,
              'lucid-type': passport.type,
              'lucid-version': passport.version || '1.0.0',
            },
          });
          if (anchorResult) {
            metadataCid = anchorResult.cid;
            // Store DePIN info on the passport record
            passport.depin_metadata_cid = anchorResult.cid;
            passport.depin_provider = anchorResult.provider;
            logger.info(`   DePIN: uploaded metadata -> ${anchorResult.cid} (${anchorResult.provider})`);
          }
        } catch (err) {
          logger.warn(`   DePIN upload failed, continuing without:`, err instanceof Error ? err.message : err);
        }
      }
      const policyFlags = getPolicyFlags(passport);

      // Derive PDA
      const [passportPDA] = await this.derivePassportPDA(
        ownerPubkey,
        assetType,
        slug,
        version
      );

      logger.info(`Syncing passport ${passport.passport_id} to chain...`);
      logger.info(`   Slug: ${slug}`);
      logger.info(`   Version: ${version.major}.${version.minor}.${version.patch}`);
      logger.info(`   PDA: ${passportPDA.toString()}`);

      // Check if passport already exists
      const existingAccount = await this.connection.getAccountInfo(passportPDA);

      if (existingAccount) {
        logger.info(`   Passport already exists on-chain, updating...`);

        // Call update_passport instruction
        const tx = await this.program.methods
          .updatePassport(
            metadataCid || null, // Optional: new metadata CID
            null // Optional: new status
          )
          .accounts({
            passport: passportPDA,
            owner: ownerPubkey,
          })
          .signers([])
          .rpc();

        logger.info(`   Passport updated: ${tx}`);
        return { pda: passportPDA.toString(), tx };
      }

      // Create new passport on-chain
      // Convert content hash to array for Anchor
      const contentHashArray = Array.from(contentHash);

      const tx = await this.program.methods
        .registerPassport(
          { [Object.keys(ASSET_TYPE_MAP).find(k => ASSET_TYPE_MAP[k as PassportType] === assetType) || 'other']: {} } as any,
          slug,
          version,
          contentCid || '',
          contentHashArray,
          metadataCid || '',
          licenseCode,
          policyFlags
        )
        .accounts({
          passport: passportPDA,
          owner: ownerPubkey,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .signers([])
        .rpc();

      logger.info(`   Passport registered on-chain: ${tx}`);
      return { pda: passportPDA.toString(), tx };

    } catch (error: any) {
      // Handle "already in use" error gracefully
      if (error.message?.includes('already in use')) {
        logger.info(`   Passport already exists on-chain`);
        const ownerPubkey = new PublicKey(passport.owner);
        const assetType = ASSET_TYPE_MAP[passport.type] ?? 5;
        const slug = this.buildSlug(passport);
        const version = parseVersion(passport.version);
        const [passportPDA] = await this.derivePassportPDA(ownerPubkey, assetType, slug, version);
        return { pda: passportPDA.toString(), tx: 'existing' };
      }

      logger.error(`   Failed to sync passport ${passport.passport_id}:`, error.message || error);
      return null;
    }
  }

  /**
   * Get passport data from chain
   */
  async getOnChainPassport(pda: string): Promise<any | null> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.program) {
      return null;
    }

    try {
      const pdaPubkey = new PublicKey(pda);
      // Use type assertion since we know the IDL has a 'passport' account at runtime
      const account = await (this.program.account as any).passport.fetch(pdaPubkey);
      return account;
    } catch (error) {
      logger.error('Failed to fetch on-chain passport:', error);
      return null;
    }
  }

  /**
   * Check if a passport exists on-chain
   */
  async passportExistsOnChain(passport: Passport): Promise<boolean> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const ownerPubkey = new PublicKey(passport.owner);
      const assetType = ASSET_TYPE_MAP[passport.type] ?? 5;
      const slug = this.buildSlug(passport);
      const version = parseVersion(passport.version);

      const [passportPDA] = await this.derivePassportPDA(ownerPubkey, assetType, slug, version);
      const account = await this.connection.getAccountInfo(passportPDA);

      return account !== null;
    } catch {
      return false;
    }
  }

  /**
   * Sync multiple passports (batch operation) — sequential fallback
   */
  async syncBatch(passports: Passport[]): Promise<Map<string, { pda: string; tx: string } | null>> {
    const results = new Map<string, { pda: string; tx: string } | null>();

    for (const passport of passports) {
      const result = await this.syncToChain(passport);
      results.set(passport.passport_id, result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Optimized batch sync — packs up to 3 register_passport instructions per transaction
   * Reduces tx costs by ~67% compared to sequential sync
   */
  async syncBatchOptimized(passports: Passport[]): Promise<Map<string, { pda: string; tx: string } | null>> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.program) {
      logger.error('Program not initialized');
      return new Map();
    }

    const results = new Map<string, { pda: string; tx: string } | null>();

    // Chunk passports into groups of MAX_IX_PER_TX
    const chunks: Passport[][] = [];
    for (let i = 0; i < passports.length; i += MAX_IX_PER_TX) {
      chunks.push(passports.slice(i, i + MAX_IX_PER_TX));
    }

    logger.info(`Batch syncing ${passports.length} passports in ${chunks.length} transactions (${MAX_IX_PER_TX} per tx)`);

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];

      let attempt = 0;
      let success = false;

      while (attempt < MAX_RETRIES && !success) {
        try {
          const tx = new Transaction();

          // Add compute budget instruction
          tx.add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
          );

          // Pre-compute PDAs and build instructions for each passport in chunk
          const pdaMap: Array<{ passportId: string; pda: PublicKey }> = [];

          for (const passport of chunk) {
            const ownerPubkey = new PublicKey(passport.owner);
            const assetType = ASSET_TYPE_MAP[passport.type] ?? 5;
            const slug = this.buildSlug(passport);
            const version = parseVersion(passport.version);
            const contentCid = getContentCid(passport);
            const contentHash = getContentHash(passport);
            const metadataCid = getMetadataCid(passport);
            const licenseCode = getLicenseCode(passport);
            const policyFlags = getPolicyFlags(passport);

            const [passportPDA] = await this.derivePassportPDA(ownerPubkey, assetType, slug, version);

            // Check if already exists — skip if so
            const existing = await this.connection.getAccountInfo(passportPDA);
            if (existing) {
              logger.info(`   Skipping ${passport.passport_id} (already on-chain)`);
              results.set(passport.passport_id, { pda: passportPDA.toString(), tx: 'existing' });
              continue;
            }

            const contentHashArray = Array.from(contentHash);
            const assetTypeEnum = { [Object.keys(ASSET_TYPE_MAP).find(k => ASSET_TYPE_MAP[k as PassportType] === assetType) || 'other']: {} } as any;

            const ix = await this.program!.methods
              .registerPassport(
                assetTypeEnum,
                slug,
                version,
                contentCid || '',
                contentHashArray,
                metadataCid || '',
                licenseCode,
                policyFlags
              )
              .accounts({
                passport: passportPDA,
                owner: ownerPubkey,
                systemProgram: new PublicKey('11111111111111111111111111111111'),
              })
              .instruction();

            tx.add(ix);
            pdaMap.push({ passportId: passport.passport_id, pda: passportPDA });
          }

          // If all were skipped (already on-chain), move to next chunk
          if (pdaMap.length === 0) {
            success = true;
            break;
          }

          // Send and confirm the multi-instruction transaction
          const keypair = this.getKeypair();
          tx.feePayer = keypair.publicKey;
          tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

          const txSig = await sendAndConfirmTransaction(this.connection, tx, [keypair], {
            commitment: 'confirmed',
          });

          logger.info(`   Tx ${chunkIdx + 1}/${chunks.length}: ${txSig} (${pdaMap.length} passports)`);

          // Record results
          for (const { passportId, pda } of pdaMap) {
            results.set(passportId, { pda: pda.toString(), tx: txSig });
          }

          success = true;
        } catch (error: any) {
          attempt++;
          logger.error(`   Tx ${chunkIdx + 1} attempt ${attempt} failed:`, error.message || error);

          if (attempt < MAX_RETRIES) {
            await sleepWithBackoff(attempt);
          } else {
            // Mark all passports in this chunk as failed
            for (const passport of chunk) {
              if (!results.has(passport.passport_id)) {
                results.set(passport.passport_id, null);
              }
            }
          }
        }
      }

      // Small delay between chunks to avoid rate limiting
      if (chunkIdx < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }

  /**
   * Update passport status on-chain (for deprecation/revocation)
   */
  async updatePassportStatus(
    pda: string,
    status: number // 0=Active, 1=Deprecated, 2=Superseded, 3=Revoked
  ): Promise<string | null> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.program) {
      return null;
    }

    try {
      const pdaPubkey = new PublicKey(pda);
      const passport = await (this.program.account as any).passport.fetch(pdaPubkey);

      const statusEnum = ['active', 'deprecated', 'superseded', 'revoked'][status];
      if (!statusEnum) {
        throw new Error(`Invalid status: ${status}`);
      }

      const tx = await this.program.methods
        .updatePassport(
          null, // no metadata CID update
          { [statusEnum]: {} } as any
        )
        .accounts({
          passport: pdaPubkey,
          owner: passport.owner,
        })
        .signers([])
        .rpc();

      logger.info(`   Passport ${pda} status updated to ${statusEnum}: ${tx}`);
      return tx;
    } catch (error: any) {
      logger.error(`Failed to update passport status:`, error.message || error);
      return null;
    }
  }

  /**
   * Get the wallet public key (authority)
   */
  getAuthority(): string {
    return this.wallet.publicKey.toString();
  }

  /**
   * Check connection health
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.connection.getSlot();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let syncServiceInstance: PassportSyncService | null = null;

/**
 * Get or create PassportSyncService singleton
 */
export function getPassportSyncService(options?: {
  rpcUrl?: string;
  commitment?: Commitment;
  programId?: string;
}): PassportSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new PassportSyncService(options);
  }
  return syncServiceInstance;
}

/**
 * Initialize and wire up passport sync
 */
export async function initPassportSync(): Promise<PassportSyncService> {
  const service = getPassportSyncService();
  await service.init();
  return service;
}

/**
 * Reset singleton (for testing)
 */
export function resetPassportSyncService(): void {
  syncServiceInstance = null;
}
