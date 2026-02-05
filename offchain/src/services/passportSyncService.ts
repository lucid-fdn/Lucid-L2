// offchain/src/services/passportSyncService.ts
// On-chain sync service for passports - implements OnChainSyncHandler

import { Connection, PublicKey, Keypair, Commitment } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider, Idl, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

import { Passport, PassportType } from '../storage/passportStore';
import { OnChainSyncHandler } from './passportManager';

// Program ID - deployed to devnet on Jan 27, 2026
const PASSPORT_PROGRAM_ID = process.env.PASSPORT_PROGRAM_ID || '38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW';

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
    const rpcUrl = options?.rpcUrl || process.env.RPC_URL || 'https://api.devnet.solana.com';
    const commitment = options?.commitment || 'confirmed';
    const programIdStr = options?.programId || PASSPORT_PROGRAM_ID;
    
    this.connection = new Connection(rpcUrl, commitment);
    this.programId = new PublicKey(programIdStr);
    this.wallet = new Wallet(this.getKeypair());
    this.provider = new AnchorProvider(this.connection, this.wallet, { commitment });
    setProvider(this.provider);
    
    console.log('🔗 PassportSyncService created');
    console.log('   RPC:', rpcUrl);
    console.log('   Program:', programIdStr);
  }
  
  /**
   * Get keypair from solana config
   */
  private getKeypair(): Keypair {
    try {
      const configOutput = execSync('solana config get', { encoding: 'utf8' });
      const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
      if (keypairMatch) {
        const configPath = keypairMatch[1].trim();
        const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Keypair.fromSecretKey(new Uint8Array(keypairData));
      }
    } catch (e) {
      console.warn('Could not load keypair from solana config:', e);
    }
    
    // Fallback: check for keypair in env
    if (process.env.SOLANA_KEYPAIR) {
      const keypairData = JSON.parse(process.env.SOLANA_KEYPAIR);
      return Keypair.fromSecretKey(new Uint8Array(keypairData));
    }
    
    // Last resort: generate new keypair (for testing only)
    console.warn('⚠️ No keypair found, generating new one (testing only)');
    return Keypair.generate();
  }
  
  /**
   * Initialize the program connection
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load IDL from target directory
      const idlPath = path.resolve(__dirname, '../../../target/idl/lucid_passports.json');
      
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
      
      console.log('✅ PassportSyncService initialized');
      console.log('   Program ID:', this.program.programId.toString());
      console.log('   Authority:', this.wallet.publicKey.toString());
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize PassportSyncService:', error);
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
  async syncToChain(passport: Passport): Promise<{ pda: string; tx: string } | null> {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.program) {
      console.error('Program not initialized');
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
      const metadataCid = getMetadataCid(passport);
      const licenseCode = getLicenseCode(passport);
      const policyFlags = getPolicyFlags(passport);
      
      // Derive PDA
      const [passportPDA] = await this.derivePassportPDA(
        ownerPubkey,
        assetType,
        slug,
        version
      );
      
      console.log(`📋 Syncing passport ${passport.passport_id} to chain...`);
      console.log(`   Slug: ${slug}`);
      console.log(`   Version: ${version.major}.${version.minor}.${version.patch}`);
      console.log(`   PDA: ${passportPDA.toString()}`);
      
      // Check if passport already exists
      const existingAccount = await this.connection.getAccountInfo(passportPDA);
      
      if (existingAccount) {
        console.log(`   ⚠️ Passport already exists on-chain, updating...`);
        
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
        
        console.log(`   ✅ Passport updated: ${tx}`);
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
      
      console.log(`   ✅ Passport registered on-chain: ${tx}`);
      return { pda: passportPDA.toString(), tx };
      
    } catch (error: any) {
      // Handle "already in use" error gracefully
      if (error.message?.includes('already in use')) {
        console.log(`   ℹ️ Passport already exists on-chain`);
        const ownerPubkey = new PublicKey(passport.owner);
        const assetType = ASSET_TYPE_MAP[passport.type] ?? 5;
        const slug = this.buildSlug(passport);
        const version = parseVersion(passport.version);
        const [passportPDA] = await this.derivePassportPDA(ownerPubkey, assetType, slug, version);
        return { pda: passportPDA.toString(), tx: 'existing' };
      }
      
      console.error(`   ❌ Failed to sync passport ${passport.passport_id}:`, error.message || error);
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
      console.error('Failed to fetch on-chain passport:', error);
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
   * Sync multiple passports (batch operation)
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
