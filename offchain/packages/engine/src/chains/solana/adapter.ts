/**
 * Solana Blockchain Adapter
 *
 * Implements IBlockchainAdapter for Solana using @solana/web3.js.
 * Passport NFTs are minted via Token-2022 with metadata extension.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  type Commitment,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import * as fs from 'fs';
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
} from '../types';
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter, IIdentityAdapter, IValidationAdapter, ChainCapabilities } from '../domain-interfaces';
import { ChainFeatureUnavailable } from '../../errors';
import { SolanaPassportClient } from '../../passport/nft/solana-token2022';
import { logger } from '../../lib/logger';

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

const CLAIM_TIMEOUT_DISCRIMINATOR = Buffer.from([
  0x82, 0xea, 0x2d, 0x35, 0x78, 0x5a, 0x56, 0xb2, // sha256("global:claim_timeout")[0:8]
]);

const DISPUTE_ESCROW_DISCRIMINATOR = Buffer.from([
  0xc6, 0xae, 0x8b, 0x46, 0x57, 0x4f, 0xb5, 0x8b, // sha256("global:dispute_escrow")[0:8]
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
    logger.info(`SolanaAdapter connected: ${config.name} (chainId: ${config.chainId})`);
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

    logger.info(`[SolanaAdapter] createAgentWallet: PDA=${walletPda.toBase58()} tx=${signature}`);
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

    logger.info(`[SolanaAdapter] setPolicy: wallet=${walletPda} tx=${signature}`);
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

    logger.info(`[SolanaAdapter] createEscrow: escrow=${escrowPda.toBase58()} tx=${signature}`);
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

    logger.info(`[SolanaAdapter] releaseEscrow: escrow=${escrowPda} tx=${signature}`);
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
    if (!this._config?.zkmlVerifierProgram) throw new ChainFeatureUnavailable('zkML verification (LucidZkMLVerifier program not configured)', this._chainId);

    throw new ChainFeatureUnavailable('zkML on-chain verification (alt_bn128 syscalls required — use EVM chain)', this._chainId);
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
        } = await import('../../epoch/services/anchoringService');

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
        } = await import('../../epoch/services/anchoringService');

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
        const { deriveEpochRecordV2PDA } = await import('../../epoch/services/anchoringService');

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
    this.ensureConnected();
    if (!this._keypair || !this._connection) {
      throw new Error('Keypair and connection required for escrow operations');
    }
    if (!this._config?.agentWalletProgram) {
      throw new ChainFeatureUnavailable('escrow (LucidAgentWallet program not configured)', this._chainId);
    }

    const adapter = this;
    const conn = this._connection;
    const keypair = this._keypair;
    const chainId = this._chainId;
    const config = this._config;
    const commitment = this._commitment;
    const programId = new PublicKey(config.agentWalletProgram);

    // EscrowRecord layout offsets (after 8-byte Anchor discriminator):
    //   wallet: Pubkey (32) | depositor: Pubkey (32) | beneficiary: Pubkey (32)
    //   token_mint: Pubkey (32) | amount: u64 (8) | ...
    const ESCROW_WALLET_OFFSET = 8;
    const ESCROW_DEPOSITOR_OFFSET = 8 + 32;
    const ESCROW_BENEFICIARY_OFFSET = 8 + 32 + 32;
    const ESCROW_TOKEN_MINT_OFFSET = 8 + 32 + 32 + 32;

    return {
      async createEscrow(params) {
        // We need a wallet PDA. Derive from payer's public key (used as passport_mint proxy)
        // The caller must have already created an agent wallet.
        const tokenMint = config.lucidTokenAddress;
        if (!tokenMint) {
          throw new Error(`No lucidTokenAddress configured for chain ${chainId} — required for escrow`);
        }

        // params.payer is the wallet PDA address
        const result = await adapter.createEscrow(params.payer, {
          beneficiary: params.payee,
          tokenMint,
          amount: BigInt(params.amount),
          durationSeconds: params.timeoutSeconds,
          expectedReceiptHash: params.receiptHash
            ? Uint8Array.from(Buffer.from(params.receiptHash.replace(/^0x/, ''), 'hex'))
            : new Uint8Array(32),
        });

        return {
          escrowId: result.escrowPda,
          tx: { hash: result.txHash, chainId, success: true },
        };
      },

      async releaseEscrow(escrowId, receiptHash, signature) {
        // Read escrow account to get the wallet PDA
        const escrowPubkey = new PublicKey(escrowId);
        const escrowAccount = await conn.getAccountInfo(escrowPubkey);
        if (!escrowAccount) throw new Error(`Escrow account not found: ${escrowId}`);

        const walletPda = new PublicKey(
          escrowAccount.data.subarray(ESCROW_WALLET_OFFSET, ESCROW_WALLET_OFFSET + 32),
        ).toBase58();

        // Parse "sig_hex:pubkey_hex" format or just raw sig+hash
        const receiptHashBytes = Uint8Array.from(
          Buffer.from(receiptHash.replace(/^0x/, ''), 'hex'),
        );
        const sigBytes = Uint8Array.from(
          Buffer.from(signature.replace(/^0x/, '').split(':')[0], 'hex'),
        );

        const result = await adapter.releaseEscrow(escrowId, {
          walletPda,
          receiptHash: receiptHashBytes,
          receiptSignature: sigBytes,
        });

        return { hash: result.txHash, chainId, success: true };
      },

      async claimTimeout(escrowId) {
        const escrowPubkey = new PublicKey(escrowId);
        const escrowAccount = await conn.getAccountInfo(escrowPubkey);
        if (!escrowAccount) throw new Error(`Escrow account not found: ${escrowId}`);

        const escrowData = escrowAccount.data;
        const walletPubkey = new PublicKey(escrowData.subarray(ESCROW_WALLET_OFFSET, ESCROW_WALLET_OFFSET + 32));
        const depositorPubkey = new PublicKey(escrowData.subarray(ESCROW_DEPOSITOR_OFFSET, ESCROW_DEPOSITOR_OFFSET + 32));
        const tokenMintPubkey = new PublicKey(escrowData.subarray(ESCROW_TOKEN_MINT_OFFSET, ESCROW_TOKEN_MINT_OFFSET + 32));

        // Derive ATAs
        const escrowAta = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey, true);
        const depositorAta = await getAssociatedTokenAddress(tokenMintPubkey, depositorPubkey);

        const instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },        // escrow (mut, has_one = wallet)
            { pubkey: walletPubkey, isSigner: false, isWritable: false },        // wallet
            { pubkey: keypair.publicKey, isSigner: true, isWritable: false },    // claimer (must be depositor)
            { pubkey: escrowAta, isSigner: false, isWritable: true },            // escrow_ata
            { pubkey: depositorAta, isSigner: false, isWritable: true },         // depositor_ata
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // token_program
          ],
          data: CLAIM_TIMEOUT_DISCRIMINATOR,
        });

        const transaction = new Transaction().add(instruction);
        const sig = await sendAndConfirmTransaction(conn, transaction, [keypair], { commitment, maxRetries: 2 });
        return { hash: sig, chainId, success: true };
      },

      async disputeEscrow(escrowId, reason) {
        const escrowPubkey = new PublicKey(escrowId);
        const escrowAccount = await conn.getAccountInfo(escrowPubkey);
        if (!escrowAccount) throw new Error(`Escrow account not found: ${escrowId}`);

        const walletPubkey = new PublicKey(
          escrowAccount.data.subarray(ESCROW_WALLET_OFFSET, ESCROW_WALLET_OFFSET + 32),
        );

        // Instruction data: discriminator (8) + string (4-byte LE length + UTF-8 bytes)
        const reasonBytes = Buffer.from(reason, 'utf-8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32LE(reasonBytes.length, 0);
        const data = Buffer.concat([DISPUTE_ESCROW_DISCRIMINATOR, lenBuf, reasonBytes]);

        const instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },        // escrow (mut, has_one = wallet)
            { pubkey: walletPubkey, isSigner: false, isWritable: false },        // wallet
            { pubkey: keypair.publicKey, isSigner: true, isWritable: false },    // disputer (depositor or beneficiary)
          ],
          data,
        });

        const transaction = new Transaction().add(instruction);
        const sig = await sendAndConfirmTransaction(conn, transaction, [keypair], { commitment, maxRetries: 2 });
        return { hash: sig, chainId, success: true };
      },
    };
  }

  passports(): IPassportAdapter {
    const chainId = this._chainId;

    return {
      async anchorPassport(passportId, _contentHash, _owner) {
        // Delegate to PassportSyncService which handles full Anchor IDL interaction
        const { getPassportSyncService } = await import('../../passport/passportSyncService');
        const { getPassportStore } = await import('../../storage/passportStore');
        const syncService = getPassportSyncService();
        const passport = await getPassportStore().get(passportId);
        if (!passport) {
          throw new Error(`Passport ${passportId} not found in store`);
        }
        const result = await syncService.syncToChain(passport);
        if (!result) {
          throw new Error(`Failed to anchor passport ${passportId} on-chain`);
        }
        return { hash: result.tx, chainId, success: true };
      },
      async updatePassportStatus(passportId, status) {
        // Delegate to PassportSyncService which handles Anchor IDL interaction
        const { getPassportSyncService } = await import('../../passport/passportSyncService');
        const { getPassportStore } = await import('../../storage/passportStore');
        const syncService = getPassportSyncService();
        const passport = await getPassportStore().get(passportId);
        if (!passport?.on_chain_pda) {
          throw new Error(`Passport ${passportId} has no on-chain PDA — anchor it first`);
        }
        const statusMap: Record<string, number> = { active: 0, deprecated: 1, superseded: 2, revoked: 3 };
        const statusNum = statusMap[status];
        if (statusNum === undefined) {
          throw new Error(`Invalid status "${status}" — expected: active, deprecated, superseded, revoked`);
        }
        const tx = await syncService.updatePassportStatus(passport.on_chain_pda, statusNum);
        if (!tx) {
          throw new Error(`Failed to update passport ${passportId} status to ${status}`);
        }
        return { hash: tx, chainId, success: true };
      },
      async verifyAnchor(passportId, contentHash) {
        try {
          // Look up the passport from the store to find the on-chain PDA address
          const { getPassportStore } = await import('../../storage/passportStore');
          const store = getPassportStore();
          const passport = await store.get(passportId);

          if (!passport) {
            // Passport not found in the local store — cannot verify
            return false;
          }

          const pdaAddress = passport.on_chain_pda;
          if (!pdaAddress) {
            // Passport has never been synced to chain — nothing to verify against
            return false;
          }

          // Use PassportSyncService to fetch the deserialized on-chain account via Anchor IDL
          const { getPassportSyncService } = await import('../../passport/passportSyncService');
          const syncService = getPassportSyncService();
          const onChainData = await syncService.getOnChainPassport(pdaAddress);

          if (!onChainData) {
            // Account does not exist on-chain (closed or never created)
            return false;
          }

          // on-chain content_hash is [u8; 32] — Anchor deserializes it as number[]
          const onChainHash: number[] = onChainData.contentHash;
          if (!onChainHash || !Array.isArray(onChainHash) || onChainHash.length !== 32) {
            return false;
          }

          // Normalize the provided contentHash to a comparable hex string
          // Accept hex strings with or without 0x prefix
          const providedHex = contentHash.replace(/^0x/, '').toLowerCase();
          const onChainHex = Buffer.from(onChainHash).toString('hex').toLowerCase();

          return providedHex === onChainHex;
        } catch {
          // Any error (network, deserialization, missing IDL, etc.) → not verified
          return false;
        }
      },
      async setPaymentGate(passportId, priceNative, priceLucid) {
        const { getPaymentGateService } = await import('../../finance/paymentGateService');
        const svc = getPaymentGateService();
        const txHash = await svc.setPaymentGate(passportId, Number(priceNative), Number(priceLucid));
        return { hash: txHash, chainId, success: true };
      },
      async payForAccess(passportId, duration) {
        const { getPaymentGateService } = await import('../../finance/paymentGateService');
        const svc = getPaymentGateService();
        const expiresAt = Math.floor(Date.now() / 1000) + duration;
        const txHash = await svc.payForAccess(passportId, undefined, expiresAt);
        return { hash: txHash, chainId, success: true };
      },
      async checkAccess(passportId, user) {
        const { getPaymentGateService } = await import('../../finance/paymentGateService');
        const svc = getPaymentGateService();
        return svc.checkAccess(passportId, user);
      },
      async withdrawRevenue(passportId) {
        const { getPaymentGateService } = await import('../../finance/paymentGateService');
        const svc = getPaymentGateService();
        const txHash = await svc.withdrawRevenue(passportId);
        return { hash: txHash, chainId, success: true };
      },
    };
  }

  agentWallet(): IAgentWalletAdapter {
    this.ensureConnected();

    const adapter = this;
    const chainId = this._chainId;
    const conn = this._connection!;
    const keypair = this._keypair!;
    const config = this._config;
    const commitment = this._commitment;

    return {
      async createWallet(passportRef) {
        const result = await adapter.createAgentWallet(passportRef);
        return {
          walletAddress: result.walletPda,
          tx: { hash: result.txHash, chainId, success: true },
        };
      },

      async getBalance(passportId) {
        const programId = new PublicKey(
          config?.agentWalletProgram || 'AJGpTWXbhvdYMxSah6GAKzykvfkYo2ViQpWGMbimQsph',
        );
        const [walletPda] = PublicKey.findProgramAddressSync(
          [AGENT_WALLET_SEED, Buffer.from(passportId)],
          programId,
        );
        const lamports = await conn.getBalance(walletPda);
        return {
          balance: (lamports / LAMPORTS_PER_SOL).toString(),
          currency: 'SOL',
        };
      },

      async execute(_walletAddress, _instruction) {
        throw new ChainFeatureUnavailable('agentWallet.execute (use instruction-specific methods: createEscrow, releaseEscrow)', chainId);
      },

      async setPolicy(walletAddress, policy) {
        const result = await adapter.setPolicy(walletAddress, {
          maxPerTx: BigInt(policy.maxAmount ?? '0'),
          dailyLimit: BigInt(policy.maxAmount ?? '0'),
          allowedPrograms: policy.allowedTargets ?? [],
          timeWindowStart: policy.rateLimit ? 0 : undefined,
          timeWindowEnd: policy.rateLimit ? policy.rateLimit.windowSeconds : undefined,
        });
        return { hash: result.txHash, chainId, success: true };
      },

      async createSession(walletAddress, delegate, permissions, expiresAt, maxAmount) {
        if (!config?.agentWalletProgram) throw new ChainFeatureUnavailable('sessionKeys (LucidAgentWallet program not configured)', chainId);

        const programId = new PublicKey(config.agentWalletProgram);
        const walletPubkey = new PublicKey(walletAddress);
        const delegatePubkey = new PublicKey(delegate);

        // Derive session PDA: seeds = ["session", wallet.key(), delegate.key()]
        const SESSION_SEED = Buffer.from('session');
        const [sessionPda] = PublicKey.findProgramAddressSync(
          [SESSION_SEED, walletPubkey.toBuffer(), delegatePubkey.toBuffer()],
          programId,
        );

        // Encode permissions as a bitmask: each permission string maps to a bit position
        let permBitmask = 0;
        for (let i = 0; i < permissions.length; i++) {
          permBitmask |= (1 << i);
        }

        // sha256("global:create_session")[0:8]
        const CREATE_SESSION_DISC = Buffer.from([
          0xfc, 0xa0, 0x9a, 0xbe, 0x7e, 0x43, 0x17, 0x02,
        ]);

        // Instruction data: discriminator (8) + permissions u16 (2) + expires_at i64 (8) + max_amount u64 (8)
        const permBuf = Buffer.alloc(2);
        permBuf.writeUInt16LE(permBitmask, 0);

        const expiresAtBuf = Buffer.alloc(8);
        expiresAtBuf.writeBigInt64LE(BigInt(expiresAt), 0);

        const maxAmountBuf = Buffer.alloc(8);
        maxAmountBuf.writeBigUInt64LE(BigInt(maxAmount), 0);

        const data = Buffer.concat([
          CREATE_SESSION_DISC,
          permBuf,
          expiresAtBuf,
          maxAmountBuf,
        ]);

        const instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: sessionPda, isSigner: false, isWritable: true },          // session (PDA, init)
            { pubkey: walletPubkey, isSigner: false, isWritable: false },        // wallet (has_one = owner)
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },     // owner (payer)
            { pubkey: delegatePubkey, isSigner: false, isWritable: false },      // delegate
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          ],
          data,
        });

        const transaction = new Transaction().add(instruction);
        const signature = await sendAndConfirmTransaction(
          conn,
          transaction,
          [keypair],
          { commitment, maxRetries: 2 },
        );

        logger.info(`[SolanaAdapter] createSession: wallet=${walletAddress} delegate=${delegate} tx=${signature}`);
        return { hash: signature, chainId, success: true };
      },

      async revokeSession(walletAddress, delegate) {
        if (!config?.agentWalletProgram) throw new ChainFeatureUnavailable('sessionKeys (LucidAgentWallet program not configured)', chainId);

        const programId = new PublicKey(config.agentWalletProgram);
        const walletPubkey = new PublicKey(walletAddress);
        const delegatePubkey = new PublicKey(delegate);

        // Derive session PDA: seeds = ["session", wallet.key(), delegate.key()]
        const SESSION_SEED = Buffer.from('session');
        const [sessionPda] = PublicKey.findProgramAddressSync(
          [SESSION_SEED, walletPubkey.toBuffer(), delegatePubkey.toBuffer()],
          programId,
        );

        // sha256("global:revoke_session")[0:8]
        const REVOKE_SESSION_DISC = Buffer.from([
          0x79, 0x7b, 0x7c, 0x72, 0x5f, 0x5d, 0xf3, 0x6e,
        ]);

        const data = Buffer.concat([REVOKE_SESSION_DISC]);

        const instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: sessionPda, isSigner: false, isWritable: true },          // session (mut, has_one = wallet)
            { pubkey: walletPubkey, isSigner: false, isWritable: false },        // wallet (has_one = owner)
            { pubkey: keypair.publicKey, isSigner: true, isWritable: false },    // owner
          ],
          data,
        });

        const transaction = new Transaction().add(instruction);
        const signature = await sendAndConfirmTransaction(
          conn,
          transaction,
          [keypair],
          { commitment, maxRetries: 2 },
        );

        logger.info(`[SolanaAdapter] revokeSession: wallet=${walletAddress} delegate=${delegate} tx=${signature}`);
        return { hash: signature, chainId, success: true };
      },
    };
  }

  // =========================================================================
  // IGasAdapter — gas collection and revenue splitting via gas-utils program
  // =========================================================================

  gas(): IGasAdapter {
    const adapter = this;
    const config = this._config;
    const chainId = this._chainId;

    return {
      async collectAndSplit(iGas, mGas, recipients, burnBps) {
        adapter.ensureConnected();
        const conn = adapter._connection!;
        const keypair = adapter.loadKeypair();
        if (!keypair) throw new Error('No Solana keypair configured');
        if (!config?.gasUtilsProgram) throw new ChainFeatureUnavailable('gas.collectAndSplit (gas-utils program not configured)', chainId);

        const { getLUCID_MINT } = await import('../../config/config');
        const mint = getLUCID_MINT();
        const programId = new PublicKey(config.gasUtilsProgram);

        // Calculate amounts
        const iGasAmount = BigInt(iGas);
        const mGasAmount = BigInt(mGas);
        const totalAmount = iGasAmount + mGasAmount;
        const burnAmount = (totalAmount * BigInt(burnBps)) / BigInt(10000);
        const distributeAmount = totalAmount - burnAmount;

        // Build burn instruction for the burn portion
        const userAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
        const { makeBurnIx, makeComputeIx } = await import('./gas');
        const transaction = new Transaction();
        transaction.add(makeComputeIx());

        if (burnAmount > 0n) {
          transaction.add(makeBurnIx('iGas', userAta, mint, keypair.publicKey, burnAmount));
        }

        // Build transfer instructions for each recipient's share
        if (distributeAmount > 0n) {
          const { createTransferInstruction } = await import('@solana/spl-token');
          for (const recipient of recipients) {
            const recipientPubkey = new PublicKey(recipient.address);
            const recipientAta = await getAssociatedTokenAddress(mint, recipientPubkey);
            const share = (distributeAmount * BigInt(recipient.bps)) / BigInt(10000);
            if (share > 0n) {
              transaction.add(createTransferInstruction(userAta, recipientAta, keypair.publicKey, share));
            }
          }
        }

        const sig = await sendAndConfirmTransaction(conn, transaction, [keypair], { commitment: adapter._commitment, maxRetries: 2 });
        logger.info(`[SolanaAdapter] gas.collectAndSplit: burn=${burnAmount} distribute=${distributeAmount} tx=${sig}`);
        return { hash: sig, chainId, success: true };
      },
    };
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
          logger.warn('Failed to parse SOLANA_PRIVATE_KEY');
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
        logger.warn(`Failed to load keypair from ANCHOR_WALLET: ${walletPath}`);
      }
    }

    return null;
  }

  identity(): IIdentityAdapter {
    const chainId = this._chainId;
    return {
      async register() { throw new ChainFeatureUnavailable('identity.register', chainId); },
      async query() { throw new ChainFeatureUnavailable('identity.query', chainId); },
      async createTBA() { throw new ChainFeatureUnavailable('identity.createTBA', chainId); },
      async getTBA() { throw new ChainFeatureUnavailable('identity.getTBA', chainId); },
      async isTBADeployed() { throw new ChainFeatureUnavailable('identity.isTBADeployed', chainId); },
      async installModule() { throw new ChainFeatureUnavailable('identity.installModule', chainId); },
      async uninstallModule() { throw new ChainFeatureUnavailable('identity.uninstallModule', chainId); },
      async configurePolicy() { throw new ChainFeatureUnavailable('identity.configurePolicy', chainId); },
      async configurePayout() { throw new ChainFeatureUnavailable('identity.configurePayout', chainId); },
    };
  }

  validation(): IValidationAdapter {
    const chainId = this._chainId;
    return {
      async requestValidation() { throw new ChainFeatureUnavailable('validation.requestValidation', chainId); },
      async submitResult() { throw new ChainFeatureUnavailable('validation.submitResult', chainId); },
      async getValidation() { throw new ChainFeatureUnavailable('validation.getValidation', chainId); },
      async getValidationCount() { throw new ChainFeatureUnavailable('validation.getValidationCount', chainId); },
      async verifyMMRProof() { throw new ChainFeatureUnavailable('validation.verifyMMRProof', chainId); },
    };
  }

  capabilities(): ChainCapabilities {
    return {
      epoch: true,
      passport: true,
      escrow: !!this._config?.agentWalletProgram,
      verifyAnchor: true,
      sessionKeys: !!this._config?.agentWalletProgram,
      zkml: false,           // alt_bn128 syscalls not available on Solana
      paymaster: false,
      identity: false,
      validation: false,
    };
  }
}
