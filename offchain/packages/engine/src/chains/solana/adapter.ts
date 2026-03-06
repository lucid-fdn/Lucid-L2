/**
 * Solana Blockchain Adapter
 *
 * Implements IBlockchainAdapter for Solana using @solana/web3.js.
 * Passport NFTs are minted via Token-2022 with metadata extension.
 * Validation/reputation are stored locally (no on-chain registry on Solana yet).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  type Commitment,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import * as fs from 'fs';
import * as crypto from 'crypto';
import bs58 from 'bs58';
import type { IBlockchainAdapter } from '../adapter-interface';
import type {
  ChainConfig,
  ChainType,
  ChainHealthStatus,
  TxReceipt,
  UnsignedTx,
  AgentRegistration,
  AgentIdentity,
  ValidationSubmission,
  ValidationResult,
  ReputationFeedback,
  ReputationData,
} from '../types';
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter } from '../domain-interfaces';
import { SolanaPassportClient } from '../../passport/nft/solana-token2022';
import pool from '../../db/pool';

// =============================================================================
// ANCHOR INSTRUCTION DISCRIMINATORS
// =============================================================================
// First 8 bytes of sha256("global:<instruction_name>")

const CREATE_WALLET_DISCRIMINATOR = Buffer.from([
  0x52, 0xac, 0x80, 0x12, 0xa1, 0xcf, 0x58, 0x3f, // sha256("global:create_wallet")[0:8]
]);

const SET_POLICY_DISCRIMINATOR = Buffer.from([
  0x28, 0x85, 0x0c, 0x9d, 0xeb, 0xca, 0x02, 0x84, // sha256("global:set_policy")[0:8]
]);

const CREATE_ESCROW_DISCRIMINATOR = Buffer.from([
  0xfd, 0xd7, 0xa5, 0x74, 0x24, 0x6c, 0x44, 0x50, // sha256("global:create_escrow")[0:8]
]);

const RELEASE_ESCROW_DISCRIMINATOR = Buffer.from([
  0x92, 0xfd, 0x81, 0xe9, 0x14, 0x91, 0xb5, 0xce, // sha256("global:release_escrow")[0:8]
]);

// PDA seeds (must match on-chain program)
const AGENT_WALLET_SEED = Buffer.from('agent_wallet');
const POLICY_SEED = Buffer.from('policy');
const ESCROW_SEED = Buffer.from('escrow');

// AgentWallet account layout offsets (after 8-byte Anchor discriminator):
//   owner: Pubkey (32) | passport_mint: Pubkey (32) | nonce: u64 (8) | bump: u8 (1) | created_at: i64 (8)
const WALLET_NONCE_OFFSET = 8 + 32 + 32; // = 72

export class SolanaAdapter implements IBlockchainAdapter {
  readonly chainType: ChainType = 'solana';

  private _chainId: string = '';
  private _connected = false;
  private _config: ChainConfig | null = null;
  private _connection: Connection | null = null;
  private _keypair: Keypair | null = null;
  private _passportClient: SolanaPassportClient | null = null;
  private _commitment: Commitment = 'confirmed';

  get chainId(): string {
    return this._chainId;
  }

  get connection(): Connection | null {
    return this._connection;
  }

  get passportClient(): SolanaPassportClient | null {
    return this._passportClient;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async connect(config: ChainConfig): Promise<void> {
    if (config.chainType !== 'solana') {
      throw new Error(`SolanaAdapter cannot connect to ${config.chainType} chain`);
    }

    this._config = config;
    this._chainId = config.chainId;

    // Create connection
    this._connection = new Connection(config.rpcUrl, this._commitment);

    // Load keypair from environment
    this._keypair = this.loadKeypair();

    // Initialize passport client
    this._passportClient = new SolanaPassportClient(
      this._connection,
      this._keypair,
      this._commitment,
    );

    this._connected = true;
    console.log(`SolanaAdapter connected: ${config.name} (chainId: ${config.chainId})`);
  }

  async disconnect(): Promise<void> {
    this._connection = null;
    this._keypair = null;
    this._passportClient = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getAccount(): Promise<{ address: string }> {
    if (!this._keypair) {
      throw new Error('No keypair configured. Set SOLANA_PRIVATE_KEY or ANCHOR_WALLET environment variable.');
    }
    return { address: this._keypair.publicKey.toBase58() };
  }

  async checkHealth(): Promise<ChainHealthStatus> {
    const start = Date.now();
    try {
      if (!this._connected || !this._connection) {
        return {
          chainId: this._chainId,
          status: 'down',
          lastCheck: Date.now(),
          error: 'Not connected',
        };
      }

      const slot = await this._connection.getSlot();
      const latencyMs = Date.now() - start;

      return {
        chainId: this._chainId,
        status: latencyMs > 5000 ? 'degraded' : 'healthy',
        blockNumber: slot,
        latencyMs,
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        chainId: this._chainId,
        status: 'down',
        latencyMs: Date.now() - start,
        lastCheck: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // =========================================================================
  // ERC-8004 Identity Registry (via Token-2022 Passport NFTs)
  // =========================================================================

  async registerAgent(metadata: AgentRegistration): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._passportClient) {
      throw new Error('Passport client not initialized');
    }
    if (!this._keypair) {
      throw new Error('Keypair required for write operations');
    }

    const result = await this._passportClient.registerPassportNFT({
      name: metadata.name,
      description: metadata.description,
      endpoints: metadata.endpoints,
      capabilities: metadata.capabilities,
      uri: metadata.tokenURI,
    });

    return {
      hash: result.txSignature,
      chainId: this._chainId,
      success: true,
      statusMessage: `Passport NFT minted: ${result.mintAddress}`,
      raw: result,
    };
  }

  async queryAgent(agentId: string): Promise<AgentIdentity | null> {
    this.ensureConnected();
    if (!this._passportClient) {
      throw new Error('Passport client not initialized');
    }

    return this._passportClient.getPassportNFT(agentId);
  }

  // =========================================================================
  // Validation Registry (DB-backed — no on-chain registry on Solana yet)
  // =========================================================================

  async submitValidation(params: ValidationSubmission): Promise<TxReceipt> {
    this.ensureConnected();

    const validationId = `val_${crypto.randomUUID().replace(/-/g, '')}`;
    const validator = this._keypair?.publicKey.toBase58() ?? 'unknown';

    try {
      await pool.query(
        `INSERT INTO validations (validation_id, agent_token_id, validator, valid, receipt_hash, metadata, chain_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          validationId,
          params.agentTokenId,
          validator,
          params.valid,
          params.receiptHash,
          params.metadata ?? null,
          this._chainId,
        ],
      );
    } catch (err) {
      console.error('[SolanaAdapter] submitValidation DB error:', err);
      return {
        hash: '',
        chainId: this._chainId,
        success: false,
        statusMessage: `DB error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }

    return {
      hash: validationId,
      chainId: this._chainId,
      success: true,
      statusMessage: `Validation ${validationId} recorded for agent ${params.agentTokenId}`,
    };
  }

  async getValidation(validationId: string): Promise<ValidationResult | null> {
    this.ensureConnected();

    try {
      const { rows } = await pool.query(
        `SELECT validation_id, agent_token_id, validator, valid, metadata, created_at
         FROM validations WHERE validation_id = $1`,
        [validationId],
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        validationId: row.validation_id,
        agentTokenId: row.agent_token_id,
        validator: row.validator,
        valid: row.valid,
        timestamp: new Date(row.created_at).getTime(),
        metadata: row.metadata ?? undefined,
      };
    } catch (err) {
      console.error('[SolanaAdapter] getValidation DB error:', err);
      return null;
    }
  }

  // =========================================================================
  // Reputation Registry (DB-backed — no on-chain registry on Solana yet)
  // =========================================================================

  async submitReputation(params: ReputationFeedback): Promise<TxReceipt> {
    this.ensureConnected();

    const fromAddress = this._keypair?.publicKey.toBase58() ?? 'unknown';
    let insertedId = '';

    try {
      const { rows } = await pool.query(
        `INSERT INTO reputation_scores (agent_token_id, from_address, score, category, comment_hash, chain_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          params.agentTokenId,
          fromAddress,
          params.score,
          params.category ?? null,
          params.commentHash ?? null,
          this._chainId,
        ],
      );
      insertedId = rows[0]?.id ?? '';
    } catch (err) {
      console.error('[SolanaAdapter] submitReputation DB error:', err);
      return {
        hash: '',
        chainId: this._chainId,
        success: false,
        statusMessage: `DB error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }

    return {
      hash: insertedId,
      chainId: this._chainId,
      success: true,
      statusMessage: `Reputation score ${params.score} recorded for agent ${params.agentTokenId}`,
    };
  }

  async readReputation(agentId: string): Promise<ReputationData[]> {
    this.ensureConnected();

    try {
      const { rows } = await pool.query(
        `SELECT from_address, agent_token_id, score, category, created_at
         FROM reputation_scores
         WHERE agent_token_id = $1
         ORDER BY created_at DESC`,
        [agentId],
      );

      return rows.map((row: Record<string, unknown>) => ({
        from: row.from_address as string,
        agentTokenId: row.agent_token_id as string,
        score: row.score as number,
        category: (row.category as string) ?? undefined,
        timestamp: new Date(row.created_at as string).getTime(),
      }));
    } catch (err) {
      console.error('[SolanaAdapter] readReputation DB error:', err);
      return [];
    }
  }

  // =========================================================================
  // Generic Transaction
  // =========================================================================

  async sendTransaction(tx: UnsignedTx): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for transactions');
    }

    try {
      // tx.data is expected to be a base64-encoded serialized Solana transaction
      const buffer = Buffer.from(tx.data || '', 'base64');
      const transaction = Transaction.from(buffer);

      const signature = await this._connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false },
      );

      await this._connection.confirmTransaction(signature, this._commitment);

      return {
        hash: signature,
        chainId: this._chainId,
        success: true,
      };
    } catch (error) {
      return {
        hash: '',
        chainId: this._chainId,
        success: false,
        statusMessage: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  async getTransactionStatus(hash: string): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._connection) {
      throw new Error('Not connected');
    }

    try {
      const status = await this._connection.getSignatureStatus(hash);

      if (!status.value) {
        return {
          hash,
          chainId: this._chainId,
          success: false,
          statusMessage: 'pending',
        };
      }

      const confirmed = status.value.confirmationStatus === 'confirmed' ||
        status.value.confirmationStatus === 'finalized';

      return {
        hash,
        chainId: this._chainId,
        success: confirmed && !status.value.err,
        blockNumber: status.value.slot,
        statusMessage: status.value.confirmationStatus || 'unknown',
      };
    } catch {
      return {
        hash,
        chainId: this._chainId,
        success: false,
        statusMessage: 'pending',
      };
    }
  }

  // =========================================================================
  // Lucid Program Operations (Agent Wallet, Escrow, zkML, Gas Distribution)
  // =========================================================================

  /**
   * Create an agent wallet PDA bound to a passport NFT mint.
   * Uses the LucidAgentWallet program's create_wallet instruction.
   */
  async createAgentWallet(passportMint: string): Promise<{ walletPda: string; txHash: string }> {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for transactions');
    }
    const agentWalletProgram = this._config?.agentWalletProgram;
    if (!agentWalletProgram) throw new Error('LucidAgentWallet program not configured');

    const mintPubkey = new PublicKey(passportMint);
    const programId = new PublicKey(agentWalletProgram);
    const [walletPda, bump] = PublicKey.findProgramAddressSync(
      [AGENT_WALLET_SEED, mintPubkey.toBuffer()],
      programId,
    );

    // Instruction data: discriminator (8) + bump (1)
    const data = Buffer.concat([
      CREATE_WALLET_DISCRIMINATOR,
      Buffer.from([bump]),
    ]);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: walletPda, isSigner: false, isWritable: true },        // wallet (PDA, init)
        { pubkey: mintPubkey, isSigner: false, isWritable: false },       // passport_mint
        { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true }, // owner (payer)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this._connection,
      transaction,
      [this._keypair],
      { commitment: this._commitment, maxRetries: 2 },
    );

    console.log(`[SolanaAdapter] createAgentWallet: PDA=${walletPda.toBase58()} tx=${signature}`);
    return { walletPda: walletPda.toBase58(), txHash: signature };
  }

  /**
   * Set policy constraints on an agent wallet.
   *
   * On-chain signature:
   *   set_policy(max_per_tx: u64, daily_limit: u64, allowed_programs: Vec<Pubkey>,
   *              time_window_start: i64, time_window_end: i64)
   */
  async setPolicy(walletPda: string, params: {
    maxPerTx: bigint;
    dailyLimit: bigint;
    allowedPrograms: string[];
    timeWindowStart?: number;
    timeWindowEnd?: number;
  }): Promise<{ txHash: string }> {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for transactions');
    }
    if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');

    const programId = new PublicKey(this._config.agentWalletProgram);
    const walletPubkey = new PublicKey(walletPda);

    // Derive policy PDA: seeds = ["policy", wallet.key()]
    const [policyPda] = PublicKey.findProgramAddressSync(
      [POLICY_SEED, walletPubkey.toBuffer()],
      programId,
    );

    // Serialize instruction data
    const maxPerTxBuf = Buffer.alloc(8);
    maxPerTxBuf.writeBigUInt64LE(BigInt(params.maxPerTx), 0);

    const dailyLimitBuf = Buffer.alloc(8);
    dailyLimitBuf.writeBigUInt64LE(BigInt(params.dailyLimit), 0);

    // Vec<Pubkey>: 4-byte LE length prefix + N * 32-byte pubkeys
    const allowedPubkeys = params.allowedPrograms.map(p => new PublicKey(p));
    const vecLenBuf = Buffer.alloc(4);
    vecLenBuf.writeUInt32LE(allowedPubkeys.length, 0);

    const timeWindowStartBuf = Buffer.alloc(8);
    timeWindowStartBuf.writeBigInt64LE(BigInt(params.timeWindowStart ?? 0), 0);

    const timeWindowEndBuf = Buffer.alloc(8);
    timeWindowEndBuf.writeBigInt64LE(BigInt(params.timeWindowEnd ?? 0), 0);

    const data = Buffer.concat([
      SET_POLICY_DISCRIMINATOR,
      maxPerTxBuf,
      dailyLimitBuf,
      vecLenBuf,
      ...allowedPubkeys.map(p => p.toBuffer()),
      timeWindowStartBuf,
      timeWindowEndBuf,
    ]);

    // Accounts per SetPolicy context (init_if_needed — requires system_program)
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: policyPda, isSigner: false, isWritable: true },          // policy (PDA, init_if_needed)
        { pubkey: walletPubkey, isSigner: false, isWritable: false },       // wallet (read-only, has_one = owner)
        { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true }, // owner (payer)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this._connection,
      transaction,
      [this._keypair],
      { commitment: this._commitment, maxRetries: 2 },
    );

    console.log(`[SolanaAdapter] setPolicy: wallet=${walletPda} tx=${signature}`);
    return { txHash: signature };
  }

  /**
   * Create a time-locked escrow from an agent wallet.
   *
   * On-chain signature:
   *   create_escrow(amount: u64, duration_seconds: i64, expected_receipt_hash: [u8; 32])
   *
   * Reads the wallet account to obtain the current nonce for PDA derivation:
   *   seeds = ["escrow", wallet.key(), nonce.to_le_bytes()]
   */
  async createEscrow(walletPda: string, params: {
    beneficiary: string;
    tokenMint: string;
    amount: bigint;
    durationSeconds: number;
    expectedReceiptHash: Uint8Array;
  }): Promise<{ escrowPda: string; txHash: string }> {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for transactions');
    }
    if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');

    const programId = new PublicKey(this._config.agentWalletProgram);
    const walletPubkey = new PublicKey(walletPda);
    const beneficiaryPubkey = new PublicKey(params.beneficiary);
    const tokenMintPubkey = new PublicKey(params.tokenMint);

    // Read wallet account to get current nonce at offset 72 (8 disc + 32 owner + 32 mint)
    const walletAccountInfo = await this._connection.getAccountInfo(walletPubkey);
    if (!walletAccountInfo) {
      throw new Error(`Agent wallet account not found: ${walletPda}`);
    }
    const nonce = walletAccountInfo.data.readBigUInt64LE(WALLET_NONCE_OFFSET);
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce, 0);

    // Derive escrow PDA: seeds = ["escrow", wallet.key(), nonce.to_le_bytes()]
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, walletPubkey.toBuffer(), nonceBuf],
      programId,
    );

    // Serialize instruction data
    if (params.expectedReceiptHash.length !== 32) {
      throw new Error('expectedReceiptHash must be exactly 32 bytes');
    }
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(params.amount), 0);

    const durationBuf = Buffer.alloc(8);
    durationBuf.writeBigInt64LE(BigInt(params.durationSeconds), 0);

    const data = Buffer.concat([
      CREATE_ESCROW_DISCRIMINATOR,
      amountBuf,
      durationBuf,
      Buffer.from(params.expectedReceiptHash),
    ]);

    // Derive ATAs for depositor and escrow
    const depositorAta = await getAssociatedTokenAddress(
      tokenMintPubkey,
      this._keypair.publicKey,
    );
    const escrowAta = await getAssociatedTokenAddress(
      tokenMintPubkey,
      walletPubkey,
      true, // allowOwnerOffCurve — PDA-owned ATA
    );

    // Accounts per CreateEscrow context
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },            // escrow (PDA, init)
        { pubkey: walletPubkey, isSigner: false, isWritable: true },          // wallet (mut, has_one = owner)
        { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true }, // owner (payer)
        { pubkey: beneficiaryPubkey, isSigner: false, isWritable: false },    // beneficiary
        { pubkey: tokenMintPubkey, isSigner: false, isWritable: false },      // token_mint
        { pubkey: depositorAta, isSigner: false, isWritable: true },          // depositor_ata
        { pubkey: escrowAta, isSigner: false, isWritable: true },             // escrow_ata
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },     // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this._connection,
      transaction,
      [this._keypair],
      { commitment: this._commitment, maxRetries: 2 },
    );

    console.log(`[SolanaAdapter] createEscrow: escrow=${escrowPda.toBase58()} tx=${signature}`);
    return { escrowPda: escrowPda.toBase58(), txHash: signature };
  }

  /**
   * Release escrow funds to the beneficiary upon verified receipt.
   *
   * On-chain signature:
   *   release_escrow(receipt_hash: [u8; 32], receipt_signature: [u8; 64])
   *
   * The caller must provide the escrow ATA and beneficiary ATA. We derive
   * them from the escrow account data read on-chain.
   */
  async releaseEscrow(escrowPda: string, params: {
    walletPda: string;
    receiptHash: Uint8Array;
    receiptSignature: Uint8Array;
  }): Promise<{ txHash: string }> {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for transactions');
    }
    if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');

    if (params.receiptHash.length !== 32) {
      throw new Error('receiptHash must be exactly 32 bytes');
    }
    if (params.receiptSignature.length !== 64) {
      throw new Error('receiptSignature must be exactly 64 bytes');
    }

    const programId = new PublicKey(this._config.agentWalletProgram);
    const escrowPubkey = new PublicKey(escrowPda);
    const walletPubkey = new PublicKey(params.walletPda);

    // Read escrow account to get beneficiary (offset 8+32+32 = 72) and token_mint (offset 72+32 = 104)
    const escrowAccountInfo = await this._connection.getAccountInfo(escrowPubkey);
    if (!escrowAccountInfo) {
      throw new Error(`Escrow account not found: ${escrowPda}`);
    }
    const escrowData = escrowAccountInfo.data;
    // EscrowRecord layout: 8 disc | 32 wallet | 32 depositor | 32 beneficiary | 32 token_mint | ...
    const beneficiaryPubkey = new PublicKey(escrowData.subarray(8 + 32 + 32, 8 + 32 + 32 + 32));
    const tokenMintPubkey = new PublicKey(escrowData.subarray(8 + 32 + 32 + 32, 8 + 32 + 32 + 32 + 32));

    // Derive ATAs
    const escrowAta = await getAssociatedTokenAddress(
      tokenMintPubkey,
      walletPubkey,
      true, // PDA-owned ATA
    );
    const beneficiaryAta = await getAssociatedTokenAddress(
      tokenMintPubkey,
      beneficiaryPubkey,
    );

    // Serialize instruction data: discriminator + receipt_hash (32) + receipt_signature (64)
    const data = Buffer.concat([
      RELEASE_ESCROW_DISCRIMINATOR,
      Buffer.from(params.receiptHash),
      Buffer.from(params.receiptSignature),
    ]);

    // Accounts per ReleaseEscrow context
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: escrowPubkey, isSigner: false, isWritable: true },          // escrow (mut, has_one = wallet)
        { pubkey: walletPubkey, isSigner: false, isWritable: false },          // wallet
        { pubkey: this._keypair.publicKey, isSigner: true, isWritable: false }, // releaser (signer)
        { pubkey: escrowAta, isSigner: false, isWritable: true },              // escrow_ata
        { pubkey: beneficiaryAta, isSigner: false, isWritable: true },         // beneficiary_ata
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },      // token_program
      ],
      data,
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this._connection,
      transaction,
      [this._keypair],
      { commitment: this._commitment, maxRetries: 2 },
    );

    console.log(`[SolanaAdapter] releaseEscrow: escrow=${escrowPda} tx=${signature}`);
    return { txHash: signature };
  }

  /**
   * Verify a zkML proof on-chain via the LucidZkMLVerifier program.
   *
   * NOTE: Solana does not yet expose the alt_bn128 elliptic-curve syscalls
   * required for on-chain Groth16 verification. Use the EVM chain adapter
   * (which has a native precompile at 0x06-0x08) for zkML proof verification.
   */
  async verifyZkMLProof(_params: {
    modelHash: Uint8Array;
    proofA: Uint8Array;
    proofB: Uint8Array;
    proofC: Uint8Array;
    publicInputs: Uint8Array[];
    receiptHash: Uint8Array;
  }): Promise<{ proofHash: string; txHash: string }> {
    this.ensureConnected();
    if (!this._config?.zkmlVerifierProgram) throw new Error('LucidZkMLVerifier program not configured');

    throw new Error(
      'zkML verification not yet supported on Solana — alt_bn128 syscalls required. Use EVM chain.',
    );
  }

  // =========================================================================
  // Domain Sub-Adapters
  // =========================================================================

  epochs(): IEpochAdapter {
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for epoch operations');
    }

    const conn = this._connection;
    const keypair = this._keypair;
    const chainId = this._chainId;
    const commitment = this._commitment;
    const config = this._config;

    return {
      async commitEpoch(
        agentId: string,
        root: string,
        epochId: number,
        leafCount: number,
        mmrSize: number,
      ): Promise<TxReceipt> {
        // Lazy import to avoid circular dependencies
        const {
          buildCommitEpochV2Instruction,
          buildInitEpochV2Instruction,
          deriveEpochRecordV2PDA,
        } = await import('../../receipt/anchoringService');

        const rootBuffer = Buffer.from(root, 'hex');
        const timestamp = Math.floor(Date.now() / 1000);

        // Check if PDA already exists to decide init vs commit
        const [epochRecordPDA] = deriveEpochRecordV2PDA(keypair.publicKey);
        const existingAccount = await conn.getAccountInfo(epochRecordPDA);

        const instruction = existingAccount
          ? buildCommitEpochV2Instruction(
              keypair.publicKey, rootBuffer, agentId, epochId, leafCount, timestamp, mmrSize,
            )
          : buildInitEpochV2Instruction(
              keypair.publicKey, rootBuffer, agentId, epochId, leafCount, timestamp, mmrSize,
            );

        const transaction = new Transaction().add(instruction);

        try {
          const signature = await sendAndConfirmTransaction(
            conn,
            transaction,
            [keypair],
            { commitment, maxRetries: 2 },
          );

          return {
            hash: signature,
            chainId,
            success: true,
            statusMessage: `Epoch ${epochId} committed for agent ${agentId}`,
          };
        } catch (error) {
          return {
            hash: '',
            chainId,
            success: false,
            statusMessage: error instanceof Error ? error.message : 'commitEpoch failed',
          };
        }
      },

      async commitEpochBatch(
        epochs: Array<{
          agentId: string;
          root: string;
          epochId: number;
          leafCount: number;
          mmrSize: number;
        }>,
      ): Promise<TxReceipt> {
        // Lazy import to avoid circular dependencies
        const {
          buildCommitEpochsInstruction,
          buildInitEpochsInstruction,
          deriveEpochBatchRecordPDA,
        } = await import('../../receipt/anchoringService');

        const rootBuffers = epochs.map(e => Buffer.from(e.root, 'hex'));

        // Check if batch PDA already exists
        const [batchPDA] = deriveEpochBatchRecordPDA(keypair.publicKey);
        const existingBatch = await conn.getAccountInfo(batchPDA);

        const instruction = existingBatch
          ? buildCommitEpochsInstruction(keypair.publicKey, rootBuffers)
          : buildInitEpochsInstruction(keypair.publicKey, rootBuffers);

        const transaction = new Transaction().add(instruction);

        try {
          const signature = await sendAndConfirmTransaction(
            conn,
            transaction,
            [keypair],
            { commitment, maxRetries: 2 },
          );

          return {
            hash: signature,
            chainId,
            success: true,
            statusMessage: `Batch of ${epochs.length} epochs committed`,
          };
        } catch (error) {
          return {
            hash: '',
            chainId,
            success: false,
            statusMessage: error instanceof Error ? error.message : 'commitEpochBatch failed',
          };
        }
      },

      async verifyEpoch(
        agentId: string,
        epochId: number,
        expectedRoot: string,
      ): Promise<boolean> {
        // Lazy import to avoid circular dependencies
        const { deriveEpochRecordV2PDA } = await import('../../receipt/anchoringService');

        try {
          const [epochRecordPDA] = deriveEpochRecordV2PDA(keypair.publicKey);
          const accountInfo = await conn.getAccountInfo(epochRecordPDA);

          if (!accountInfo) {
            return false;
          }

          // Parse account data: skip 8-byte Anchor discriminator, root is bytes 8-40
          const onChainRoot = accountInfo.data.subarray(8, 40).toString('hex');
          return onChainRoot === expectedRoot;
        } catch {
          return false;
        }
      },
    };
  }

  escrow(): IEscrowAdapter {
    throw new Error('IEscrowAdapter not yet implemented on Solana — see Task 7');
  }

  passports(): IPassportAdapter {
    throw new Error('IPassportAdapter not yet implemented on Solana — see Task 13');
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private ensureConnected(): void {
    if (!this._connected || !this._connection) {
      throw new Error(`SolanaAdapter not connected to ${this._chainId}`);
    }
  }

  private loadKeypair(): Keypair | null {
    // Try SOLANA_PRIVATE_KEY env (base58 or JSON byte array)
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (privateKey) {
      try {
        // Try JSON byte array format first
        const bytes = JSON.parse(privateKey);
        if (Array.isArray(bytes)) {
          return Keypair.fromSecretKey(Uint8Array.from(bytes));
        }
      } catch {
        // Not JSON, try base58
        try {
          return Keypair.fromSecretKey(bs58.decode(privateKey));
        } catch {
          console.warn('Failed to parse SOLANA_PRIVATE_KEY');
        }
      }
    }

    // Try ANCHOR_WALLET path
    const walletPath = process.env.ANCHOR_WALLET;
    if (walletPath) {
      try {
        const data = fs.readFileSync(walletPath, 'utf8');
        const bytes = JSON.parse(data);
        return Keypair.fromSecretKey(Uint8Array.from(bytes));
      } catch {
        console.warn(`Failed to load keypair from ANCHOR_WALLET: ${walletPath}`);
      }
    }

    return null;
  }
}
