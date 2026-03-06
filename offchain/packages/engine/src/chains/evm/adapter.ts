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
import type { IBlockchainAdapter } from '../adapter-interface';
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter } from '../domain-interfaces';
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

import { IdentityRegistryClient } from '../../identity/registries/evm-identity';
import { ValidationRegistryClient } from '../../identity/registries/evm-validation';
import { ReputationRegistryClient } from '../../identity/registries/evm-reputation';

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

    const receipt = await this.waitForTx(hash);

    // Auto-create TBA if ERC-6551 is configured and autoCreateTBA is enabled
    if (receipt.success && this._config?.erc6551 && process.env.AUTO_CREATE_TBA === 'true') {
      try {
        // Extract tokenId from the Transfer(address,address,uint256) event in the tx receipt
        // Transfer event topic: keccak256("Transfer(address,address,uint256)")
        const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        const rawReceipt = receipt.raw as { logs?: Array<{ address: string; topics?: string[] }> } | undefined;
        const logs = rawReceipt?.logs || [];
        const identityAddr = this._config.erc8004?.identityRegistry?.toLowerCase();

        let mintedTokenId: string | null = null;
        for (const log of logs) {
          const logAddr = (log.address || '').toLowerCase();
          if (logAddr === identityAddr && log.topics?.[0] === TRANSFER_TOPIC && log.topics.length >= 4) {
            // ERC-721 Transfer: topics[3] is the tokenId
            mintedTokenId = BigInt(log.topics[3]).toString();
            break;
          }
        }

        if (mintedTokenId && identityAddr) {
          const { getTBAService } = await import('../../identity/tbaService');
          const tbaService = getTBAService();
          const tba = await tbaService.createTBA(this._chainId, identityAddr, mintedTokenId);
          console.log(`[EVMAdapter] TBA auto-created for token ${mintedTokenId}: ${tba.address}`);
        }
      } catch (err) {
        // TBA creation is optional — log but don't fail
        console.warn(`[EVMAdapter] TBA auto-creation failed:`, err instanceof Error ? err.message : err);
      }
    }

    return receipt;
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

  get walletClient(): any {
    return this._walletClient;
  }

  // =========================================================================
  // ERC-4337 Account Abstraction (Phase 3)
  // =========================================================================

  /**
   * Submit a UserOperation to the EntryPoint's handleOps().
   * Used by the Paymaster service for $LUCID-as-gas sponsoring.
   */
  async sendUserOp(
    userOp: {
      sender: string;
      nonce: string;
      callData: string;
      paymasterAndData?: string;
      signature?: string;
    },
  ): Promise<TxReceipt> {
    this.ensureConnected();

    const entryPoint = this._config?.entryPoint;
    if (!entryPoint) {
      throw new Error(`No EntryPoint configured for chain ${this._chainId}`);
    }

    // Encode handleOps calldata — simplified for MVP
    // In production, this would use the full ERC-4337 bundler flow
    const calldata = '0x' +
      '1fad948c' + // handleOps selector
      '0000000000000000000000000000000000000000000000000000000000000040' +
      '0000000000000000000000000000000000000000000000000000000000000000';

    return this.sendTransaction({
      to: entryPoint,
      data: calldata,
    });
  }

  // =========================================================================
  // Domain Sub-Adapters
  // =========================================================================

  epochs(): IEpochAdapter {
    this.ensureConnected();

    const registryAddress = this._config?.epochRegistry;
    if (!registryAddress) {
      throw new Error(`No EpochRegistry configured for chain ${this._chainId}`);
    }
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for epoch operations');
    }

    const publicClient = this._publicClient;
    const walletClient = this._walletClient;
    const chainId = this._chainId;
    const address = registryAddress as `0x${string}`;
    const self = this;

    // Inline ABI snippets for the EpochRegistry contract
    const commitEpochAbi = [
      {
        type: 'function' as const,
        name: 'commitEpoch',
        inputs: [
          { name: 'agentId', type: 'bytes32' as const },
          { name: 'mmrRoot', type: 'bytes32' as const },
          { name: 'epochId', type: 'uint64' as const },
          { name: 'leafCount', type: 'uint64' as const },
          { name: 'mmrSize', type: 'uint64' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
      },
    ] as const;

    const commitEpochBatchAbi = [
      {
        type: 'function' as const,
        name: 'commitEpochBatch',
        inputs: [
          { name: 'agentIds', type: 'bytes32[]' as const },
          { name: 'mmrRoots', type: 'bytes32[]' as const },
          { name: 'epochIds', type: 'uint64[]' as const },
          { name: 'leafCounts', type: 'uint64[]' as const },
          { name: 'mmrSizes', type: 'uint64[]' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
      },
    ] as const;

    const getEpochAbi = [
      {
        type: 'function' as const,
        name: 'getEpoch',
        inputs: [
          { name: 'agentId', type: 'bytes32' as const },
          { name: 'epochId', type: 'uint64' as const },
        ],
        outputs: [
          { name: 'mmrRoot', type: 'bytes32' as const },
          { name: 'leafCount', type: 'uint64' as const },
          { name: 'mmrSize', type: 'uint64' as const },
          { name: 'committedAt', type: 'uint64' as const },
        ],
        stateMutability: 'view' as const,
      },
    ] as const;

    return {
      async commitEpoch(
        agentId: string,
        root: string,
        epochId: number,
        leafCount: number,
        mmrSize: number,
      ): Promise<TxReceipt> {
        const agentIdBytes = agentId.startsWith('0x')
          ? (agentId as `0x${string}`)
          : (`0x${agentId.padStart(64, '0')}` as `0x${string}`);
        const rootBytes = root.startsWith('0x')
          ? (root as `0x${string}`)
          : (`0x${root}` as `0x${string}`);

        const hash = await walletClient.writeContract({
          address,
          abi: commitEpochAbi,
          functionName: 'commitEpoch',
          args: [agentIdBytes, rootBytes, BigInt(epochId), BigInt(leafCount), BigInt(mmrSize)],
        });

        return self.waitForTx(hash);
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
        const agentIds = epochs.map(e => {
          const id = e.agentId;
          return id.startsWith('0x')
            ? (id as `0x${string}`)
            : (`0x${id.padStart(64, '0')}` as `0x${string}`);
        });
        const roots = epochs.map(e => {
          const r = e.root;
          return r.startsWith('0x')
            ? (r as `0x${string}`)
            : (`0x${r}` as `0x${string}`);
        });
        const epochIds = epochs.map(e => BigInt(e.epochId));
        const leafCounts = epochs.map(e => BigInt(e.leafCount));
        const mmrSizes = epochs.map(e => BigInt(e.mmrSize));

        const hash = await walletClient.writeContract({
          address,
          abi: commitEpochBatchAbi,
          functionName: 'commitEpochBatch',
          args: [agentIds, roots, epochIds, leafCounts, mmrSizes],
        });

        return self.waitForTx(hash);
      },

      async verifyEpoch(
        agentId: string,
        epochId: number,
        expectedRoot: string,
      ): Promise<boolean> {
        const agentIdBytes = agentId.startsWith('0x')
          ? (agentId as `0x${string}`)
          : (`0x${agentId.padStart(64, '0')}` as `0x${string}`);

        const expectedRootNorm = expectedRoot.startsWith('0x')
          ? expectedRoot.toLowerCase()
          : `0x${expectedRoot}`.toLowerCase();

        try {
          const result = await publicClient.readContract({
            address,
            abi: getEpochAbi,
            functionName: 'getEpoch',
            args: [agentIdBytes, BigInt(epochId)],
          });

          // result is a tuple: [mmrRoot, leafCount, mmrSize, committedAt]
          const onChainRoot = (result as readonly [string, bigint, bigint, bigint])[0].toLowerCase();
          return onChainRoot === expectedRootNorm;
        } catch {
          return false;
        }
      },
    };
  }

  escrow(): IEscrowAdapter {
    throw new Error('IEscrowAdapter not yet implemented on EVM');
  }

  passports(): IPassportAdapter {
    const registryAddr = this._config?.passportRegistry;
    if (!registryAddr) throw new Error(`PassportRegistry not configured on ${this._chainId}`);

    const publicClient = this._publicClient!;
    const walletClient = this._walletClient!;
    const account = this._account!;
    const chainId = this._chainId;

    const PASSPORT_ABI = [
      { name: 'anchorPassport', type: 'function', stateMutability: 'nonpayable',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'contentHash', type: 'bytes32' }, { name: 'passportOwner', type: 'address' }], outputs: [] },
      { name: 'updateStatus', type: 'function', stateMutability: 'nonpayable',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'newStatus', type: 'uint8' }], outputs: [] },
      { name: 'verifyAnchor', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'contentHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
      { name: 'setGate', type: 'function', stateMutability: 'nonpayable',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'priceNative', type: 'uint256' }, { name: 'priceLucid', type: 'uint256' }], outputs: [] },
      { name: 'payForAccess', type: 'function', stateMutability: 'payable',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'duration', type: 'uint64' }], outputs: [] },
      { name: 'checkAccess', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
      { name: 'withdrawRevenue', type: 'function', stateMutability: 'nonpayable',
        inputs: [{ name: 'passportId', type: 'bytes32' }], outputs: [] },
    ] as const;

    return {
      async anchorPassport(passportId, contentHash, owner) {
        const hash = await walletClient.writeContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'anchorPassport',
          args: [passportId as `0x${string}`, contentHash as `0x${string}`, owner as `0x${string}`], account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },
      async updatePassportStatus(passportId, status) {
        const statusNum = typeof status === 'number' ? status : parseInt(status, 10);
        const hash = await walletClient.writeContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'updateStatus',
          args: [passportId as `0x${string}`, statusNum], account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },
      async verifyAnchor(passportId, contentHash) {
        return await publicClient.readContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'verifyAnchor',
          args: [passportId as `0x${string}`, contentHash as `0x${string}`],
        }) as boolean;
      },
      async setPaymentGate(passportId, priceNative, priceLucid) {
        const hash = await walletClient.writeContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'setGate',
          args: [passportId as `0x${string}`, BigInt(priceNative), BigInt(priceLucid)], account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },
      async payForAccess(passportId, duration) {
        const hash = await walletClient.writeContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'payForAccess',
          args: [passportId as `0x${string}`, BigInt(duration)], account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },
      async checkAccess(passportId, user) {
        return await publicClient.readContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'checkAccess',
          args: [passportId as `0x${string}`, user as `0x${string}`],
        }) as boolean;
      },
      async withdrawRevenue(passportId) {
        const hash = await walletClient.writeContract({
          address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'withdrawRevenue',
          args: [passportId as `0x${string}`], account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },
    };
  }

  agentWallet(): IAgentWalletAdapter {
    this.ensureConnected();
    if (!this._walletClient || !this._account) {
      throw new Error('Wallet required for agent wallet operations');
    }

    const chainId = this._chainId;
    const config = this._config;
    const publicClient = this._publicClient!;
    const walletClient = this._walletClient!;
    const account = this._account!;

    return {
      async createWallet(passportRef) {
        // Create TBA via ERC-6551 registry using TBAService
        if (!config?.erc6551) {
          throw new Error(`No ERC-6551 configuration on chain ${chainId} — cannot create agent wallet`);
        }
        const identityRegistry = config.erc8004?.identityRegistry;
        if (!identityRegistry) {
          throw new Error(`No IdentityRegistry configured on chain ${chainId} — needed for TBA token contract`);
        }

        const { getTBAService } = await import('../../identity/tbaService');
        const tbaService = getTBAService();
        const result = await tbaService.createTBA(chainId, identityRegistry, passportRef);

        return {
          walletAddress: result.address,
          tx: { hash: result.txHash, chainId, success: true },
        };
      },

      async execute(walletAddress, instruction) {
        // Execute an arbitrary call through the TBA's execute(address,uint256,bytes,uint8)
        const TBA_EXECUTE_ABI = [{
          name: 'execute', type: 'function', stateMutability: 'payable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
            { name: 'operation', type: 'uint8' },
          ],
          outputs: [{ type: 'bytes' }],
        }] as const;

        // instruction is hex-encoded: first 20 bytes = target address, rest = calldata
        // If instruction is too short to contain a target, treat it as raw calldata to the wallet itself
        const instrHex = instruction.startsWith('0x') ? instruction.slice(2) : instruction;
        let to: `0x${string}`;
        let data: `0x${string}`;

        if (instrHex.length >= 40) {
          // First 20 bytes (40 hex chars) = target address
          to = `0x${instrHex.slice(0, 40)}` as `0x${string}`;
          data = `0x${instrHex.slice(40)}` as `0x${string}` || '0x';
        } else {
          // Fallback: instruction is calldata to wallet itself
          to = walletAddress as `0x${string}`;
          data = (instruction.startsWith('0x') ? instruction : `0x${instruction}`) as `0x${string}`;
        }

        const hash = await walletClient.writeContract({
          address: walletAddress as `0x${string}`,
          abi: TBA_EXECUTE_ABI,
          functionName: 'execute',
          args: [to, 0n, data, 0],
          account,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, chainId, success: receipt.status === 'success' };
      },

      async setPolicy(_walletAddress, _policy) {
        // ERC-7579 PolicyModule configuration — requires PolicyModule contract deployment
        throw new Error('EVM policy configuration requires PolicyModule deployment — use erc7579Service directly');
      },

      async createSession(_walletAddress, _delegate, _permissions, _expiresAt, _maxAmount) {
        throw new Error('Session keys not yet deployed on EVM — use Solana agent wallet for session delegation');
      },

      async revokeSession(_walletAddress, _delegate) {
        throw new Error('Session keys not yet deployed on EVM');
      },
    };
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
