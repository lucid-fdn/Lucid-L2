/**
 * Anchoring Service - Commits MMR roots to Solana blockchain.
 *
 * Uses the thought-epoch program to anchor epoch roots on-chain.
 * This provides cryptographic proof that receipts existed at a specific time.
 *
 * Program ID: 9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu (devnet)
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  Commitment,
} from '@solana/web3.js';
import { 
  getEpoch, 
  prepareEpochForFinalization, 
  finalizeEpoch, 
  failEpoch,
  Epoch,
} from './epochService';
import { getReceipt, SignedReceipt } from './receiptService';

// =============================================================================
// CONFIGURATION
// =============================================================================

// thought-epoch program IDs per network — must match Anchor.toml
const THOUGHT_EPOCH_PROGRAM_IDS: Record<string, string> = {
  localnet: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu',
  devnet: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu',
  testnet: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu',
  mainnet: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu', // Update when deployed to mainnet
};

// Get program ID based on configured network
function getThoughtEpochProgramId(): PublicKey {
  const programId = THOUGHT_EPOCH_PROGRAM_IDS[config.network] || THOUGHT_EPOCH_PROGRAM_IDS.devnet;
  return new PublicKey(programId);
}

// Default RPC endpoints
const DEFAULT_RPC_ENDPOINTS = {
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
  localnet: 'http://localhost:8899',
};

// Configuration
export interface AnchoringConfig {
  network: 'devnet' | 'testnet' | 'mainnet' | 'localnet' | 'custom';
  rpc_url?: string;
  authority_keypair?: Keypair;
  commitment?: Commitment;
  max_retries?: number;
  retry_delay_ms?: number;
  mock_mode?: boolean;  // For testing without real chain
}

const DEFAULT_CONFIG: AnchoringConfig = {
  network: 'devnet',
  commitment: 'confirmed',
  max_retries: 3,
  retry_delay_ms: 1000,
  mock_mode: false,
};

let config: AnchoringConfig = { ...DEFAULT_CONFIG };
let connection: Connection | null = null;

// =============================================================================
// INSTRUCTION DISCRIMINATORS
// =============================================================================

// Anchor instruction discriminators (first 8 bytes of sha256("global:<instruction_name>"))
// Init instructions: create the PDA account (first call for a given authority)
const INIT_EPOCH_DISCRIMINATOR = Buffer.from([
  0x4e, 0x51, 0x42, 0x4c, 0xd9, 0x71, 0xbd, 0x6d, // sha256("global:init_epoch")[0:8]
]);

const INIT_EPOCHS_DISCRIMINATOR = Buffer.from([
  0xb1, 0x09, 0x61, 0x24, 0x67, 0x6b, 0xb4, 0x4f, // sha256("global:init_epochs")[0:8]
]);

const INIT_EPOCH_V2_DISCRIMINATOR = Buffer.from([
  0xdc, 0x7d, 0xb8, 0xc7, 0x34, 0xf5, 0x04, 0x82, // sha256("global:init_epoch_v2")[0:8]
]);

// Update instructions: overwrite an existing PDA (authority enforced via has_one)
const COMMIT_EPOCH_DISCRIMINATOR = Buffer.from([
  0x8c, 0x00, 0x3e, 0xba, 0x49, 0xb4, 0xc9, 0xb3, // sha256("global:commit_epoch")[0:8]
]);

const COMMIT_EPOCHS_DISCRIMINATOR = Buffer.from([
  0x90, 0x95, 0x52, 0x2e, 0xc3, 0xc0, 0xa9, 0xbc, // sha256("global:commit_epochs")[0:8]
]);

const COMMIT_EPOCH_V2_DISCRIMINATOR = Buffer.from([
  0xa5, 0x30, 0x60, 0x5c, 0x09, 0xdf, 0x0c, 0x22, // sha256("global:commit_epoch_v2")[0:8]
]);

// NOTE: Discriminators verified 2026-02-26 after init/update split

// =============================================================================
// CONFIGURATION MANAGEMENT
// =============================================================================

/**
 * Set anchoring configuration.
 */
export function setAnchoringConfig(newConfig: Partial<AnchoringConfig>): void {
  config = { ...config, ...newConfig };
  connection = null; // Reset connection when config changes
}

/**
 * Get current anchoring configuration.
 */
export function getAnchoringConfig(): AnchoringConfig {
  return { ...config };
}

/**
 * Get or create Solana connection.
 */
export function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = config.rpc_url || DEFAULT_RPC_ENDPOINTS[config.network as keyof typeof DEFAULT_RPC_ENDPOINTS];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for network: ${config.network}`);
    }
    connection = new Connection(rpcUrl, config.commitment || 'confirmed');
  }
  return connection;
}

/**
 * Set the authority keypair for signing transactions.
 */
export function setAuthorityKeypair(keypair: Keypair): void {
  config.authority_keypair = keypair;
}

/**
 * Load authority keypair from secret key bytes.
 */
export function loadAuthorityFromSecretKey(secretKey: Uint8Array): Keypair {
  const keypair = Keypair.fromSecretKey(secretKey);
  config.authority_keypair = keypair;
  return keypair;
}

// =============================================================================
// PDA DERIVATION
// =============================================================================

/**
 * Derive the PDA for a single epoch record.
 */
export function deriveEpochRecordPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), authority.toBuffer()],
    getThoughtEpochProgramId()
  );
}

/**
 * Derive the PDA for a v2 epoch record.
 */
export function deriveEpochRecordV2PDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch_v2'), authority.toBuffer()],
    getThoughtEpochProgramId()
  );
}

/**
 * Derive the PDA for a batch epoch record.
 */
export function deriveEpochBatchRecordPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epochs'), authority.toBuffer()],
    getThoughtEpochProgramId()
  );
}

// =============================================================================
// INSTRUCTION BUILDERS
// =============================================================================

/**
 * Build a commit_epoch (update) instruction.
 */
export function buildCommitEpochInstruction(
  authority: PublicKey,
  root: Buffer
): TransactionInstruction {
  if (root.length !== 32) {
    throw new Error('Root must be exactly 32 bytes');
  }

  const [epochRecordPDA] = deriveEpochRecordPDA(authority);

  const data = Buffer.concat([
    COMMIT_EPOCH_DISCRIMINATOR,
    root,
  ]);

  // Update instruction: no system_program needed (account already exists)
  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build an init_epoch instruction (creates the PDA — first use only).
 */
export function buildInitEpochInstruction(
  authority: PublicKey,
  root: Buffer
): TransactionInstruction {
  if (root.length !== 32) {
    throw new Error('Root must be exactly 32 bytes');
  }

  const [epochRecordPDA] = deriveEpochRecordPDA(authority);

  const data = Buffer.concat([
    INIT_EPOCH_DISCRIMINATOR,
    root,
  ]);

  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a commit_epochs (update) instruction for batch commits.
 */
export function buildCommitEpochsInstruction(
  authority: PublicKey,
  roots: Buffer[]
): TransactionInstruction {
  if (roots.length > 16) {
    throw new Error('Maximum 16 roots per batch');
  }
  if (roots.some(r => r.length !== 32)) {
    throw new Error('All roots must be exactly 32 bytes');
  }

  const [epochBatchRecordPDA] = deriveEpochBatchRecordPDA(authority);

  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(roots.length, 0);

  const data = Buffer.concat([
    COMMIT_EPOCHS_DISCRIMINATOR,
    vecLen,
    ...roots,
  ]);

  // Update: no system_program (account already exists)
  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: epochBatchRecordPDA, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build an init_epochs instruction (creates the batch PDA — first use only).
 */
export function buildInitEpochsInstruction(
  authority: PublicKey,
  roots: Buffer[]
): TransactionInstruction {
  if (roots.length > 16) {
    throw new Error('Maximum 16 roots per batch');
  }
  if (roots.some(r => r.length !== 32)) {
    throw new Error('All roots must be exactly 32 bytes');
  }

  const [epochBatchRecordPDA] = deriveEpochBatchRecordPDA(authority);

  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(roots.length, 0);

  const data = Buffer.concat([
    INIT_EPOCHS_DISCRIMINATOR,
    vecLen,
    ...roots,
  ]);

  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: epochBatchRecordPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Encode the v2 instruction payload (shared between init and update).
 */
function encodeV2Payload(
  root: Buffer,
  epoch_index: number,
  leaf_count: number,
  timestamp: number,
  mmr_size: number,
): Buffer {
  const epochIdBuffer = Buffer.alloc(8);
  epochIdBuffer.writeBigUInt64LE(BigInt(epoch_index), 0);

  const leafCountBuffer = Buffer.alloc(8);
  leafCountBuffer.writeBigUInt64LE(BigInt(leaf_count), 0);

  const timestampBuffer = Buffer.alloc(8);
  timestampBuffer.writeBigInt64LE(BigInt(timestamp), 0);

  const mmrSizeBuffer = Buffer.alloc(8);
  mmrSizeBuffer.writeBigUInt64LE(BigInt(mmr_size), 0);

  return Buffer.concat([root, epochIdBuffer, leafCountBuffer, timestampBuffer, mmrSizeBuffer]);
}

/**
 * Build a commit_epoch_v2 (update) instruction with metadata.
 */
export function buildCommitEpochV2Instruction(
  authority: PublicKey,
  root: Buffer,
  epoch_id: string,
  epoch_index: number,
  leaf_count: number,
  timestamp: number,
  mmr_size: number
): TransactionInstruction {
  if (root.length !== 32) {
    throw new Error('Root must be exactly 32 bytes');
  }

  const [epochRecordPDA] = deriveEpochRecordV2PDA(authority);

  const data = Buffer.concat([
    COMMIT_EPOCH_V2_DISCRIMINATOR,
    encodeV2Payload(root, epoch_index, leaf_count, timestamp, mmr_size),
  ]);

  // Update: no system_program (account already exists)
  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build an init_epoch_v2 instruction (creates the PDA — first use only).
 */
export function buildInitEpochV2Instruction(
  authority: PublicKey,
  root: Buffer,
  epoch_id: string,
  epoch_index: number,
  leaf_count: number,
  timestamp: number,
  mmr_size: number
): TransactionInstruction {
  if (root.length !== 32) {
    throw new Error('Root must be exactly 32 bytes');
  }

  const [epochRecordPDA] = deriveEpochRecordV2PDA(authority);

  const data = Buffer.concat([
    INIT_EPOCH_V2_DISCRIMINATOR,
    encodeV2Payload(root, epoch_index, leaf_count, timestamp, mmr_size),
  ]);

  return new TransactionInstruction({
    programId: getThoughtEpochProgramId(),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// =============================================================================
// CORE ANCHORING FUNCTIONS
// =============================================================================

export interface AnchorResult {
  success: boolean;
  signature?: string;
  root: string;
  epoch_id: string;
  error?: string;
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Commit a single epoch root to the chain.
 * This is the main function for anchoring receipts.
 */
export async function commitEpochRoot(epoch_id: string): Promise<AnchorResult> {
  // Get and prepare epoch
  const epoch = prepareEpochForFinalization(epoch_id);
  if (!epoch) {
    return {
      success: false,
      root: '',
      epoch_id,
      error: 'Epoch not found or not in open state',
    };
  }

  // Check for empty epoch
  if (epoch.leaf_count === 0) {
    failEpoch(epoch_id, 'Empty epoch - no receipts to anchor');
    return {
      success: false,
      root: epoch.mmr_root,
      epoch_id,
      error: 'Empty epoch - no receipts to anchor',
    };
  }

  // Mock mode for testing
  if (config.mock_mode) {
    const mockTx = `mock_tx_${Date.now()}_${epoch_id.slice(0, 8)}`;
    const result = finalizeEpoch(epoch_id, mockTx, epoch.mmr_root);
    if (result) {
      // Update receipts with anchor info
      await updateReceiptsWithAnchor(epoch, mockTx);
    }
    return {
      success: true,
      signature: mockTx,
      root: epoch.mmr_root,
      epoch_id,
    };
  }

  // Check for authority keypair
  if (!config.authority_keypair) {
    failEpoch(epoch_id, 'No authority keypair configured');
    return {
      success: false,
      root: epoch.mmr_root,
      epoch_id,
      error: 'No authority keypair configured',
    };
  }

  const authority = config.authority_keypair;
  const conn = getConnection();

  // Convert hex root to buffer
  const rootBuffer = Buffer.from(epoch.mmr_root, 'hex');

  // Check if the v2 PDA already exists — use init if not, update if so
  const [epochRecordPDA] = deriveEpochRecordV2PDA(authority.publicKey);
  const existingAccount = await conn.getAccountInfo(epochRecordPDA);

  const v2Args = [
    authority.publicKey,
    rootBuffer,
    epoch.epoch_id.replace('epoch_', ''),
    epoch.epoch_index,
    epoch.leaf_count,
    epoch.finalized_at || Math.floor(Date.now() / 1000),
    epoch.end_leaf_index ? epoch.end_leaf_index + 1 : epoch.leaf_count,
  ] as const;

  const instruction = existingAccount
    ? buildCommitEpochV2Instruction(...v2Args)
    : buildInitEpochV2Instruction(...v2Args);

  const transaction = new Transaction().add(instruction);

  // Send with retries
  let lastError: Error | null = null;
  const maxRetries = config.max_retries || 3;
  const retryDelay = config.retry_delay_ms || 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const signature = await sendAndConfirmTransaction(
        conn,
        transaction,
        [authority],
        {
          commitment: config.commitment || 'confirmed',
          maxRetries: 2,
        }
      );

      // Success! Finalize the epoch
      const result = finalizeEpoch(epoch_id, signature, epoch.mmr_root);
      if (result) {
        // Update receipts with anchor info
        await updateReceiptsWithAnchor(epoch, signature);
      }

      // Upload epoch proof to DePIN permanent storage (non-blocking)
      if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
        try {
          const { getPermanentStorage } = require('../storage/depin');
          const proof = {
            epoch_id,
            mmr_root: epoch.mmr_root,
            tx_signature: signature,
            timestamp: Date.now(),
            leaf_count: epoch.leaf_count,
            network: config.network,
          };
          const upload = await getPermanentStorage().uploadJSON(proof, {
            tags: { type: 'epoch-proof', epoch: epoch_id },
          });
          console.log(`   DePIN: epoch proof -> ${upload.cid} (${upload.provider})`);
        } catch (err) {
          console.warn(`   DePIN epoch proof upload failed (non-blocking):`, err instanceof Error ? err.message : err);
        }
      }

      return {
        success: true,
        signature,
        root: epoch.mmr_root,
        epoch_id,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Anchoring attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        await sleep(retryDelay * attempt); // Exponential backoff
      }
    }
  }

  // All retries failed
  failEpoch(epoch_id, lastError?.message || 'Unknown error');
  return {
    success: false,
    root: epoch.mmr_root,
    epoch_id,
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * Commit multiple epoch roots in a single transaction.
 * More gas-efficient for batch anchoring.
 */
export async function commitEpochRootsBatch(epoch_ids: string[]): Promise<AnchorResult[]> {
  if (epoch_ids.length === 0) {
    return [];
  }

  if (epoch_ids.length > 16) {
    throw new Error('Maximum 16 epochs per batch');
  }

  // Prepare all epochs — use indexed array to preserve input order
  const epochs: Epoch[] = [];
  const resultsByEpochId = new Map<string, AnchorResult>();

  for (const epoch_id of epoch_ids) {
    const epoch = prepareEpochForFinalization(epoch_id);
    if (!epoch) {
      resultsByEpochId.set(epoch_id, {
        success: false,
        root: '',
        epoch_id,
        error: 'Epoch not found or not in open state',
      });
      continue;
    }
    if (epoch.leaf_count === 0) {
      failEpoch(epoch_id, 'Empty epoch');
      resultsByEpochId.set(epoch_id, {
        success: false,
        root: epoch.mmr_root,
        epoch_id,
        error: 'Empty epoch',
      });
      continue;
    }
    epochs.push(epoch);
  }

  if (epochs.length === 0) {
    return epoch_ids.map(id => resultsByEpochId.get(id)!);
  }

  // Mock mode
  if (config.mock_mode) {
    const mockTx = `mock_batch_tx_${Date.now()}`;
    for (const epoch of epochs) {
      finalizeEpoch(epoch.epoch_id, mockTx, epoch.mmr_root);
      await updateReceiptsWithAnchor(epoch, mockTx);
      resultsByEpochId.set(epoch.epoch_id, {
        success: true,
        signature: mockTx,
        root: epoch.mmr_root,
        epoch_id: epoch.epoch_id,
      });
    }
    return epoch_ids.map(id => resultsByEpochId.get(id)!);
  }

  // Check for authority keypair
  if (!config.authority_keypair) {
    for (const epoch of epochs) {
      failEpoch(epoch.epoch_id, 'No authority keypair configured');
      resultsByEpochId.set(epoch.epoch_id, {
        success: false,
        root: epoch.mmr_root,
        epoch_id: epoch.epoch_id,
        error: 'No authority keypair configured',
      });
    }
    return epoch_ids.map(id => resultsByEpochId.get(id)!);
  }

  const authority = config.authority_keypair;
  const conn = getConnection();

  // Convert roots to buffers
  const rootBuffers = epochs.map(e => Buffer.from(e.mmr_root, 'hex'));

  // Check if the batch PDA already exists — use init if not, update if so
  const [batchPDA] = deriveEpochBatchRecordPDA(authority.publicKey);
  const existingBatch = await conn.getAccountInfo(batchPDA);

  const instruction = existingBatch
    ? buildCommitEpochsInstruction(authority.publicKey, rootBuffers)
    : buildInitEpochsInstruction(authority.publicKey, rootBuffers);
  const transaction = new Transaction().add(instruction);

  // Send with retries
  let lastError: Error | null = null;
  const maxRetries = config.max_retries || 3;
  const retryDelay = config.retry_delay_ms || 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const signature = await sendAndConfirmTransaction(
        conn,
        transaction,
        [authority],
        {
          commitment: config.commitment || 'confirmed',
          maxRetries: 2,
        }
      );

      // Success! Finalize all epochs
      for (const epoch of epochs) {
        finalizeEpoch(epoch.epoch_id, signature, epoch.mmr_root);
        await updateReceiptsWithAnchor(epoch, signature);
        resultsByEpochId.set(epoch.epoch_id, {
          success: true,
          signature,
          root: epoch.mmr_root,
          epoch_id: epoch.epoch_id,
        });

        // Upload epoch proof to DePIN permanent storage (non-blocking)
        if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
          try {
            const { getPermanentStorage } = require('../storage/depin');
            const proof = {
              epoch_id: epoch.epoch_id,
              mmr_root: epoch.mmr_root,
              tx_signature: signature,
              timestamp: Date.now(),
              leaf_count: epoch.leaf_count,
              network: config.network,
            };
            const upload = await getPermanentStorage().uploadJSON(proof, {
              tags: { type: 'epoch-proof', epoch: epoch.epoch_id },
            });
            console.log(`   DePIN: epoch proof -> ${upload.cid} (${upload.provider})`);
          } catch (err) {
            console.warn(`   DePIN epoch proof upload failed (non-blocking):`, err instanceof Error ? err.message : err);
          }
        }
      }

      return epoch_ids.map(id => resultsByEpochId.get(id)!);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Batch anchoring attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        await sleep(retryDelay * attempt);
      }
    }
  }

  // All retries failed
  for (const epoch of epochs) {
    failEpoch(epoch.epoch_id, lastError?.message || 'Unknown error');
    resultsByEpochId.set(epoch.epoch_id, {
      success: false,
      root: epoch.mmr_root,
      epoch_id: epoch.epoch_id,
      error: lastError?.message || 'Unknown error',
    });
  }

  return epoch_ids.map(id => resultsByEpochId.get(id)!);
}

/**
 * Update receipts with anchor information after successful anchoring.
 */
async function updateReceiptsWithAnchor(epoch: Epoch, tx_signature: string): Promise<void> {
  // Note: This requires modifying receipts in the receipt store
  // For MVP, we'll just log this - full implementation would update each receipt
  console.log(`Anchored ${epoch.leaf_count} receipts in epoch ${epoch.epoch_id} with tx ${tx_signature}`);
  
  // In production, iterate through epoch.receipt_run_ids and update each receipt
  // with anchor info: { chain: 'solana', tx: tx_signature, root: epoch.mmr_root, epoch_id: epoch.epoch_id }
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

export interface VerifyAnchorResult {
  valid: boolean;
  on_chain_root?: string;
  expected_root: string;
  tx_signature?: string;
  error?: string;
}

/**
 * Verify that an epoch's root is anchored on-chain.
 */
export async function verifyEpochAnchor(epoch_id: string): Promise<VerifyAnchorResult> {
  const epoch = getEpoch(epoch_id);
  if (!epoch) {
    return {
      valid: false,
      expected_root: '',
      error: 'Epoch not found',
    };
  }

  if (epoch.status !== 'anchored') {
    return {
      valid: false,
      expected_root: epoch.mmr_root,
      error: `Epoch not anchored (status: ${epoch.status})`,
    };
  }

  if (config.mock_mode) {
    return {
      valid: true,
      on_chain_root: epoch.mmr_root,
      expected_root: epoch.mmr_root,
      tx_signature: epoch.chain_tx,
    };
  }

  if (!config.authority_keypair) {
    return {
      valid: false,
      expected_root: epoch.mmr_root,
      error: 'No authority keypair configured for verification',
    };
  }

  try {
    const conn = getConnection();
    const [epochRecordPDA] = deriveEpochRecordV2PDA(config.authority_keypair.publicKey);
    
    // Fetch account data
    const accountInfo = await conn.getAccountInfo(epochRecordPDA);
    if (!accountInfo) {
      return {
        valid: false,
        expected_root: epoch.mmr_root,
        tx_signature: epoch.chain_tx,
        error: 'Epoch record not found on-chain',
      };
    }

    // Parse account data (skip 8-byte discriminator)
    const data = accountInfo.data;
    const onChainRoot = data.slice(8, 40).toString('hex');

    return {
      valid: onChainRoot === epoch.mmr_root,
      on_chain_root: onChainRoot,
      expected_root: epoch.mmr_root,
      tx_signature: epoch.chain_tx,
    };
  } catch (error) {
    return {
      valid: false,
      expected_root: epoch.mmr_root,
      tx_signature: epoch.chain_tx,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get transaction details for an anchored epoch.
 */
export async function getAnchorTransaction(epoch_id: string): Promise<{
  found: boolean;
  tx_signature?: string;
  slot?: number;
  block_time?: number;
  error?: string;
}> {
  const epoch = getEpoch(epoch_id);
  if (!epoch || !epoch.chain_tx) {
    return { found: false, error: 'Epoch not found or not anchored' };
  }

  if (config.mock_mode) {
    return {
      found: true,
      tx_signature: epoch.chain_tx,
      slot: 12345678,
      block_time: epoch.finalized_at,
    };
  }

  try {
    const conn = getConnection();
    const txInfo = await conn.getTransaction(epoch.chain_tx, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      return {
        found: false,
        tx_signature: epoch.chain_tx,
        error: 'Transaction not found on-chain',
      };
    }

    return {
      found: true,
      tx_signature: epoch.chain_tx,
      slot: txInfo.slot,
      block_time: txInfo.blockTime || undefined,
    };
  } catch (error) {
    return {
      found: false,
      tx_signature: epoch.chain_tx,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export interface AnchoringHealth {
  connected: boolean;
  network: string;
  rpc_url: string;
  authority_configured: boolean;
  authority_pubkey?: string;
  authority_balance_sol?: number;
  mock_mode: boolean;
  error?: string;
}

/**
 * Check the health of the anchoring service.
 */
export async function checkAnchoringHealth(): Promise<AnchoringHealth> {
  const rpcUrl = config.rpc_url || DEFAULT_RPC_ENDPOINTS[config.network as keyof typeof DEFAULT_RPC_ENDPOINTS] || 'unknown';
  
  const health: AnchoringHealth = {
    connected: false,
    network: config.network,
    rpc_url: rpcUrl,
    authority_configured: !!config.authority_keypair,
    mock_mode: config.mock_mode || false,
  };

  if (config.authority_keypair) {
    health.authority_pubkey = config.authority_keypair.publicKey.toBase58();
  }

  if (config.mock_mode) {
    health.connected = true;
    return health;
  }

  try {
    const conn = getConnection();
    
    // Check connection by getting recent blockhash
    await conn.getLatestBlockhash();
    health.connected = true;

    // Check authority balance if configured
    if (config.authority_keypair) {
      const balance = await conn.getBalance(config.authority_keypair.publicKey);
      health.authority_balance_sol = balance / 1e9;
    }
  } catch (error) {
    health.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return health;
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Reset anchoring state (for testing).
 */
export function resetAnchoringState(): void {
  config = { ...DEFAULT_CONFIG };
  connection = null;
}

/**
 * Enable mock mode for testing without real chain.
 */
export function enableMockMode(): void {
  config.mock_mode = true;
}

/**
 * Disable mock mode.
 */
export function disableMockMode(): void {
  config.mock_mode = false;
}
