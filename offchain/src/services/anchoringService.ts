/**
 * Anchoring Service - Commits MMR roots to Solana blockchain.
 * 
 * Uses the thought-epoch program to anchor epoch roots on-chain.
 * This provides cryptographic proof that receipts existed at a specific time.
 * 
 * Program ID: J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c
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

// thought-epoch program ID
const THOUGHT_EPOCH_PROGRAM_ID = new PublicKey('J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c');

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
// Pre-computed for commit_epoch and commit_epochs
const COMMIT_EPOCH_DISCRIMINATOR = Buffer.from([
  0x0d, 0x98, 0x02, 0x2a, 0x45, 0x05, 0x71, 0x00, // sha256("global:commit_epoch")[0:8]
]);

const COMMIT_EPOCHS_DISCRIMINATOR = Buffer.from([
  0xa5, 0x7e, 0xc3, 0x41, 0xc6, 0x02, 0x8c, 0xb9, // sha256("global:commit_epochs")[0:8]
]);

// Note: Actual discriminators should be verified against the deployed program
// These are placeholder values and should be updated with correct discriminators

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
    THOUGHT_EPOCH_PROGRAM_ID
  );
}

/**
 * Derive the PDA for a batch epoch record.
 */
export function deriveEpochBatchRecordPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epochs'), authority.toBuffer()],
    THOUGHT_EPOCH_PROGRAM_ID
  );
}

// =============================================================================
// INSTRUCTION BUILDERS
// =============================================================================

/**
 * Build a commit_epoch instruction.
 */
export function buildCommitEpochInstruction(
  authority: PublicKey,
  root: Buffer
): TransactionInstruction {
  if (root.length !== 32) {
    throw new Error('Root must be exactly 32 bytes');
  }

  const [epochRecordPDA] = deriveEpochRecordPDA(authority);

  // Build instruction data: discriminator + root
  const data = Buffer.concat([
    COMMIT_EPOCH_DISCRIMINATOR,
    root,
  ]);

  return new TransactionInstruction({
    programId: THOUGHT_EPOCH_PROGRAM_ID,
    keys: [
      { pubkey: epochRecordPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a commit_epochs instruction for batch commits.
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

  // Build instruction data: discriminator + vec length (4 bytes LE) + roots
  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(roots.length, 0);
  
  const data = Buffer.concat([
    COMMIT_EPOCHS_DISCRIMINATOR,
    vecLen,
    ...roots,
  ]);

  return new TransactionInstruction({
    programId: THOUGHT_EPOCH_PROGRAM_ID,
    keys: [
      { pubkey: epochBatchRecordPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
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

  // Build transaction
  const instruction = buildCommitEpochInstruction(
    authority.publicKey,
    rootBuffer
  );

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

  // Prepare all epochs
  const epochs: Epoch[] = [];
  const results: AnchorResult[] = [];

  for (const epoch_id of epoch_ids) {
    const epoch = prepareEpochForFinalization(epoch_id);
    if (!epoch) {
      results.push({
        success: false,
        root: '',
        epoch_id,
        error: 'Epoch not found or not in open state',
      });
      continue;
    }
    if (epoch.leaf_count === 0) {
      failEpoch(epoch_id, 'Empty epoch');
      results.push({
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
    return results;
  }

  // Mock mode
  if (config.mock_mode) {
    const mockTx = `mock_batch_tx_${Date.now()}`;
    for (const epoch of epochs) {
      finalizeEpoch(epoch.epoch_id, mockTx, epoch.mmr_root);
      await updateReceiptsWithAnchor(epoch, mockTx);
      results.push({
        success: true,
        signature: mockTx,
        root: epoch.mmr_root,
        epoch_id: epoch.epoch_id,
      });
    }
    return results;
  }

  // Check for authority keypair
  if (!config.authority_keypair) {
    for (const epoch of epochs) {
      failEpoch(epoch.epoch_id, 'No authority keypair configured');
      results.push({
        success: false,
        root: epoch.mmr_root,
        epoch_id: epoch.epoch_id,
        error: 'No authority keypair configured',
      });
    }
    return results;
  }

  const authority = config.authority_keypair;
  const conn = getConnection();

  // Convert roots to buffers
  const rootBuffers = epochs.map(e => Buffer.from(e.mmr_root, 'hex'));

  // Build batch transaction
  const instruction = buildCommitEpochsInstruction(authority.publicKey, rootBuffers);
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
        results.push({
          success: true,
          signature,
          root: epoch.mmr_root,
          epoch_id: epoch.epoch_id,
        });
      }

      return results;
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
    results.push({
      success: false,
      root: epoch.mmr_root,
      epoch_id: epoch.epoch_id,
      error: lastError?.message || 'Unknown error',
    });
  }

  return results;
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
    const [epochRecordPDA] = deriveEpochRecordPDA(config.authority_keypair.publicKey);
    
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
