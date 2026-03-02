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
  type Commitment,
} from '@solana/web3.js';
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
  ValidationSubmission,
  ValidationResult,
  ReputationFeedback,
  ReputationData,
} from '../types';
import { SolanaPassportClient } from '../../passport/nft/solana-token2022';

export class SolanaAdapter implements IBlockchainAdapter {
  readonly chainType: ChainType = 'solana';

  private _chainId: string = '';
  private _connected = false;
  private _config: ChainConfig | null = null;
  private _connection: Connection | null = null;
  private _keypair: Keypair | null = null;
  private _passportClient: SolanaPassportClient | null = null;
  private _commitment: Commitment = 'confirmed';

  // Local stores for validation/reputation (no on-chain registry on Solana yet)
  private _validationStore = new Map<string, ValidationResult>();
  private _reputationStore = new Map<string, ReputationData[]>();

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
  // Validation Registry (local store — no on-chain registry on Solana yet)
  // =========================================================================

  async submitValidation(params: ValidationSubmission): Promise<TxReceipt> {
    this.ensureConnected();

    const validationId = `sol-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result: ValidationResult = {
      validationId,
      agentTokenId: params.agentTokenId,
      validator: this._keypair?.publicKey.toBase58() || 'unknown',
      valid: params.valid,
      timestamp: Math.floor(Date.now() / 1000),
      metadata: params.metadata,
    };

    this._validationStore.set(validationId, result);

    return {
      hash: validationId,
      chainId: this._chainId,
      success: true,
      statusMessage: 'Validation stored locally (no on-chain Solana registry)',
    };
  }

  async getValidation(validationId: string): Promise<ValidationResult | null> {
    this.ensureConnected();
    return this._validationStore.get(validationId) || null;
  }

  // =========================================================================
  // Reputation Registry (local store — no on-chain registry on Solana yet)
  // =========================================================================

  async submitReputation(params: ReputationFeedback): Promise<TxReceipt> {
    this.ensureConnected();

    const record: ReputationData = {
      from: this._keypair?.publicKey.toBase58() || 'unknown',
      agentTokenId: params.agentTokenId,
      score: params.score,
      category: params.category,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const existing = this._reputationStore.get(params.agentTokenId) || [];
    existing.push(record);
    this._reputationStore.set(params.agentTokenId, existing);

    return {
      hash: `sol-rep-${Date.now()}`,
      chainId: this._chainId,
      success: true,
      statusMessage: 'Reputation stored locally (no on-chain Solana registry)',
    };
  }

  async readReputation(agentId: string): Promise<ReputationData[]> {
    this.ensureConnected();
    return this._reputationStore.get(agentId) || [];
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
