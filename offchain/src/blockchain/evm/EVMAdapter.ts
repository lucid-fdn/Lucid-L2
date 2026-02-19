/**
 * EVM Blockchain Adapter
 *
 * Implements IBlockchainAdapter for any EVM-compatible chain using viem.
 * Reads/writes ERC-8004 registries (Identity, Validation, Reputation).
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { IBlockchainAdapter } from '../IBlockchainAdapter';
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

import { IdentityRegistryClient } from './erc8004/IdentityRegistryClient';
import { ValidationRegistryClient } from './erc8004/ValidationRegistryClient';
import { ReputationRegistryClient } from './erc8004/ReputationRegistryClient';

export class EVMAdapter implements IBlockchainAdapter {
  readonly chainType: ChainType = 'evm';

  private _chainId: string = '';
  private _connected = false;
  private _config: ChainConfig | null = null;
  private _publicClient: any = null;
  private _walletClient: any = null;
  private _account: any = null;

  // ERC-8004 registry clients
  private _identityRegistry: IdentityRegistryClient | null = null;
  private _validationRegistry: ValidationRegistryClient | null = null;
  private _reputationRegistry: ReputationRegistryClient | null = null;

  get chainId(): string {
    return this._chainId;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async connect(config: ChainConfig): Promise<void> {
    if (config.chainType !== 'evm') {
      throw new Error(`EVMAdapter cannot connect to ${config.chainType} chain`);
    }

    this._config = config;
    this._chainId = config.chainId;

    // Build viem Chain object
    const viemChain = this.buildViemChain(config);

    // Create public client (read-only)
    this._publicClient = createPublicClient({
      chain: viemChain,
      transport: http(config.rpcUrl),
    });

    // Create wallet client if private key is available
    const privateKey = process.env.EVM_PRIVATE_KEY;
    if (privateKey) {
      const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      this._account = privateKeyToAccount(key as `0x${string}`);
      this._walletClient = createWalletClient({
        account: this._account,
        chain: viemChain,
        transport: http(config.rpcUrl),
      });
    }

    const erc8004 = config.erc8004;

    // Initialize ERC-8004 registry clients if contract addresses are configured
    if (erc8004?.identityRegistry) {
      this._identityRegistry = new IdentityRegistryClient(
        this._publicClient,
        this._walletClient,
        erc8004.identityRegistry as `0x${string}`,
      );
    }

    if (erc8004?.validationRegistry) {
      this._validationRegistry = new ValidationRegistryClient(
        this._publicClient,
        this._walletClient,
        erc8004.validationRegistry as `0x${string}`,
        config.lucidValidatorAddress as `0x${string}` | undefined,
      );
    }

    if (erc8004?.reputationRegistry) {
      this._reputationRegistry = new ReputationRegistryClient(
        this._publicClient,
        this._walletClient,
        erc8004.reputationRegistry as `0x${string}`,
      );
    }

    this._connected = true;
    console.log(`EVMAdapter connected: ${config.name} (chainId: ${config.evmChainId})`);
  }

  async disconnect(): Promise<void> {
    this._publicClient = null;
    this._walletClient = null;
    this._account = null;
    this._identityRegistry = null;
    this._validationRegistry = null;
    this._reputationRegistry = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getAccount(): Promise<{ address: string }> {
    if (!this._account) {
      throw new Error('No wallet configured. Set EVM_PRIVATE_KEY environment variable.');
    }
    return { address: this._account.address };
  }

  async checkHealth(): Promise<ChainHealthStatus> {
    const start = Date.now();
    try {
      if (!this._connected || !this._publicClient) {
        return {
          chainId: this._chainId,
          status: 'down',
          lastCheck: Date.now(),
          error: 'Not connected',
        };
      }

      const blockNumber = await this._publicClient.getBlockNumber();
      const latencyMs = Date.now() - start;

      return {
        chainId: this._chainId,
        status: latencyMs > 5000 ? 'degraded' : 'healthy',
        blockNumber: Number(blockNumber),
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
  // ERC-8004 Identity Registry
  // =========================================================================

  async registerAgent(metadata: AgentRegistration): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._identityRegistry) {
      throw new Error(`No Identity Registry configured for chain ${this._chainId}`);
    }
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for write operations');
    }

    const tokenURI = metadata.tokenURI || '';
    const hash = await this._identityRegistry.register(
      tokenURI,
      this._account.address,
    );

    return this.waitForTx(hash);
  }

  async queryAgent(agentId: string): Promise<AgentIdentity | null> {
    this.ensureConnected();
    if (!this._identityRegistry) {
      throw new Error(`No Identity Registry configured for chain ${this._chainId}`);
    }

    return this._identityRegistry.getAgent(agentId, this._chainId);
  }

  // =========================================================================
  // ERC-8004 Validation Registry
  // =========================================================================

  async submitValidation(params: ValidationSubmission): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._validationRegistry) {
      throw new Error(`No Validation Registry configured for chain ${this._chainId}`);
    }
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for write operations');
    }

    const hash = await this._validationRegistry.submitResult(
      params.agentTokenId,
      params.receiptHash,
      params.valid,
    );

    return this.waitForTx(hash);
  }

  async getValidation(validationId: string): Promise<ValidationResult | null> {
    this.ensureConnected();
    if (!this._validationRegistry) {
      throw new Error(`No Validation Registry configured for chain ${this._chainId}`);
    }

    const record = await this._validationRegistry.getValidation(validationId);
    if (!record) return null;

    return {
      validationId: record.validationId.toString(),
      agentTokenId: record.agentTokenId.toString(),
      validator: record.validator,
      valid: record.valid,
      timestamp: Number(record.timestamp),
      metadata: record.metadata,
    };
  }

  // =========================================================================
  // ERC-8004 Reputation Registry
  // =========================================================================

  async submitReputation(params: ReputationFeedback): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._reputationRegistry) {
      throw new Error(`No Reputation Registry configured for chain ${this._chainId}`);
    }
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for write operations');
    }

    const hash = await this._reputationRegistry.submitFeedback(
      params.agentTokenId,
      params.score,
      params.category || '',
    );

    return this.waitForTx(hash);
  }

  async readReputation(agentId: string): Promise<ReputationData[]> {
    this.ensureConnected();
    if (!this._reputationRegistry) {
      throw new Error(`No Reputation Registry configured for chain ${this._chainId}`);
    }

    return this._reputationRegistry.getFeedback(agentId);
  }

  // =========================================================================
  // Generic Blockchain Operations
  // =========================================================================

  async sendTransaction(tx: UnsignedTx): Promise<TxReceipt> {
    this.ensureConnected();
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for write operations');
    }

    const hash = await this._walletClient.sendTransaction({
      account: this._account,
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}` | undefined,
      value: tx.value ? BigInt(tx.value) : undefined,
      gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
    });

    return this.waitForTx(hash);
  }

  async getTransactionStatus(hash: string): Promise<TxReceipt> {
    this.ensureConnected();
    try {
      const receipt = await this._publicClient.getTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      return this.mapReceipt(receipt);
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
  // Public accessors for registry clients
  // =========================================================================

  get identityRegistry(): IdentityRegistryClient | null {
    return this._identityRegistry;
  }

  get validationRegistry(): ValidationRegistryClient | null {
    return this._validationRegistry;
  }

  get reputationRegistry(): ReputationRegistryClient | null {
    return this._reputationRegistry;
  }

  get publicClient(): any {
    return this._publicClient;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private ensureConnected(): void {
    if (!this._connected || !this._publicClient) {
      throw new Error(`EVMAdapter not connected to ${this._chainId}`);
    }
  }

  private async waitForTx(hash: Hash): Promise<TxReceipt> {
    const receipt = await this._publicClient.waitForTransactionReceipt({ hash });
    return this.mapReceipt(receipt);
  }

  private mapReceipt(receipt: any): TxReceipt {
    return {
      hash: receipt.transactionHash,
      chainId: this._chainId,
      success: receipt.status === 'success',
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed?.toString(),
      gasPrice: receipt.effectiveGasPrice?.toString(),
      raw: receipt,
    };
  }

  private buildViemChain(config: ChainConfig): Chain {
    return {
      id: config.evmChainId || 1,
      name: config.name,
      nativeCurrency: config.nativeCurrency || { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: {
          http: [config.rpcUrl, ...(config.fallbackRpcUrls || [])],
        },
      },
      blockExplorers: config.explorerUrl
        ? {
            default: {
              name: 'Explorer',
              url: config.explorerUrl,
            },
          }
        : undefined,
    } as Chain;
  }
}
