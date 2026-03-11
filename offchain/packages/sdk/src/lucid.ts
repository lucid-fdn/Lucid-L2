/**
 * Lucid SDK — Main Entry Point
 *
 * new Lucid({ ... }) creates a configured SDK instance with namespaced access
 * to all Lucid-L2 functionality: passports, receipts, epochs, agents,
 * payments, deploy, crypto, and chain operations.
 */

import type {
  ChainCapabilities,
  CreatePassportInput,
  OperationResult,
  InferenceReceipt,
  InferenceReceiptInput,
  ComputeReceipt,
  ComputeReceiptInput,
  ReceiptVerifyResult,
  Epoch,
  EpochStatus,
  AnchorResult,
  DeploymentResult,
  DeploymentStatus,
  RuntimeArtifact,
  LogOptions,
  DeployAgentInput,
  DeployAgentResult,
  AgentRevenuePool,
  MMRProof,
  TxReceipt,
  ChainHealthStatus,
} from '@lucid-l2/engine';

// =============================================================================
// Config Types
// =============================================================================

export interface SolanaChainConfig {
  rpc: string;
  keypairPath?: string;
  keypair?: Uint8Array;
}

export interface EVMChainConfig {
  rpc: string;
  privateKey?: string;
}

export type DeployerTarget = 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';
export type NFTProvider = 'token2022' | 'metaplex-core' | 'evm-erc721' | 'mock';
export type DepinProvider = 'arweave' | 'lighthouse' | 'mock';

export interface LucidConfig {
  /** Ed25519 secret key (hex) for receipt signing */
  orchestratorKey: string;

  /** Chain connections (at least one required) */
  chains: {
    solana?: SolanaChainConfig;
    evm?: EVMChainConfig;
  };

  /** Which chains receive epoch anchoring (e.g. ['solana-devnet', 'base']) */
  anchoringChains?: string[];

  /** PostgreSQL connection string */
  db?: string;

  /** NFT minting provider */
  nftProvider?: NFTProvider;

  /** Default agent deployment target */
  deployTarget?: DeployerTarget;

  /** DePIN storage provider */
  depinStorage?: DepinProvider;

  /** Custom logger (defaults to console) */
  logger?: { info: Function; warn: Function; error: Function };

  /** Retry config for transient failures. Set to false to disable. */
  retry?: { maxRetries?: number; baseDelayMs?: number } | false;

  /** Timeout in ms for async operations (default: 30000). Set to 0 to disable. */
  timeout?: number;
}

// =============================================================================
// Namespace Interfaces
// =============================================================================

export interface PassportNamespace {
  create(params: CreatePassportInput): Promise<OperationResult<unknown>>;
  get(passportId: string): Promise<Record<string, unknown> | null>;
  update(passportId: string, params: Partial<CreatePassportInput>): Promise<OperationResult<unknown>>;
  list(params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  anchor(passportId: string, opts?: { chains?: string[] }): Promise<PromiseSettledResult<TxReceipt>[]>;
  setPaymentGate(passportId: string, params: { price: number; priceLucid?: number }): Promise<string>;
}

export interface ReceiptNamespace {
  create(params: InferenceReceiptInput): Promise<InferenceReceipt>;
  get(receiptId: string): Promise<InferenceReceipt | null>;
  verify(receiptId: string): Promise<ReceiptVerifyResult>;
  prove(receiptId: string): Promise<MMRProof | null>;
  list(params?: Record<string, unknown>): Promise<InferenceReceipt[]>;
  compute: {
    create(params: ComputeReceiptInput): Promise<ComputeReceipt>;
    get(receiptId: string): Promise<ComputeReceipt | null>;
    verify(receiptId: string): Promise<ReceiptVerifyResult>;
    list(): Promise<ComputeReceipt[]>;
  };
}

export interface EpochNamespace {
  current(): Promise<Epoch | null>;
  finalize(epochId: string): Promise<Epoch>;
  anchor(epochId: string): Promise<AnchorResult>;
  verify(epochId: string, chain: string): Promise<boolean>;
  list(): Promise<Epoch[]>;
}

export interface AgentDeployOpts {
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface WalletBalance {
  balance: string;
  currency: string;
}

export interface AgentNamespace {
  deploy(passportId: string, target: DeployerTarget, opts?: AgentDeployOpts): Promise<DeployAgentResult>;
  status(passportId: string): Promise<DeploymentStatus>;
  logs(passportId: string, opts?: LogOptions): Promise<string[]>;
  terminate(passportId: string): Promise<void>;
  wallet: {
    create(passportId: string): Promise<{ walletAddress: string; tx: TxReceipt }>;
    balance(passportId: string): Promise<WalletBalance>;
  };
  marketplace: {
    list(passportId: string): Promise<AgentRevenuePool | null>;
  };
}

export interface PaymentNamespace {
  createGrant(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  verifyGrant(grantHeader: string): Promise<boolean>;
  calculateSplit(receipt: InferenceReceipt): Promise<Record<string, unknown>>;
  settle(epochId: string): Promise<Record<string, unknown>>;
}

export interface DeployNamespace {
  build(passportId: string, artifact: RuntimeArtifact): Promise<DeploymentResult>;
  push(passportId: string, tag: string): Promise<DeploymentResult>;
  targets(): string[];
}

export interface CryptoNamespace {
  hash(data: string | Buffer): string;
  sign(message: string | Buffer): string;
  verify(signature: string, publicKey: string, message: string | Buffer): boolean;
  canonicalJson(obj: unknown): string;
  mmr: MMRNamespace;
}

export interface MMRNamespace {
  /** Append a leaf hash and return the new root (hex) */
  append(leaf: string): string;
  /** Get the current MMR root (hex) */
  root(): string;
  /** Generate an inclusion proof for the leaf at the given index */
  prove(index: number): MMRProof | null;
  /** Reset the MMR state */
  reset(): void;
  /** Get the current number of nodes in the MMR */
  size(): number;
}

export interface ChainNamespace {
  capabilities(chain: string): ChainCapabilities;
  health(chain: string): Promise<ChainHealthStatus>;
  /** Returns a Promise resolving to the raw blockchain adapter */
  adapter(chain: string): Promise<unknown>;
}

export interface PreviewNamespace {
  readonly reputation: Record<string, unknown>;
  readonly identity: Record<string, unknown>;
  readonly zkml: Record<string, unknown>;
}

// =============================================================================
// Lucid Class
// =============================================================================

export class Lucid {
  private _config: LucidConfig;
  private _previewWarned = false;
  private _preview: PreviewNamespace | null = null;

  /** Wrap an async call with the configured retry + timeout policy */
  private _wrap<T>(fn: () => Promise<T>): Promise<T> {
    const { withRetryAndTimeout } = require('@lucid-l2/engine');
    const retryOpts = this._config.retry === false
      ? { maxRetries: 0 }
      : this._config.retry || undefined;
    const timeoutMs = this._config.timeout === 0
      ? undefined
      : (this._config.timeout ?? 30_000);
    return withRetryAndTimeout(fn, retryOpts, timeoutMs);
  }

  readonly passport: PassportNamespace;
  readonly receipt: ReceiptNamespace;
  readonly epoch: EpochNamespace;
  readonly agent: AgentNamespace;
  readonly payment: PaymentNamespace;
  readonly deploy: DeployNamespace;
  readonly crypto: CryptoNamespace;
  readonly chain: ChainNamespace;

  constructor(config: LucidConfig) {
    this._config = config;

    // Set env vars from config so engine factories pick them up
    if (config.orchestratorKey) process.env.LUCID_ORCHESTRATOR_SECRET_KEY = config.orchestratorKey;
    if (config.db) process.env.DATABASE_URL = config.db;
    if (config.nftProvider) process.env.NFT_PROVIDER = config.nftProvider;
    if (config.deployTarget) process.env.DEPLOY_TARGET = config.deployTarget;
    if (config.depinStorage) process.env.DEPIN_PERMANENT_PROVIDER = config.depinStorage;
    if (config.anchoringChains) process.env.ANCHORING_CHAINS = config.anchoringChains.join(',');

    // Solana RPC
    if (config.chains.solana?.rpc) process.env.SOLANA_RPC_URL = config.chains.solana.rpc;

    // Wire namespaces to engine
    this.passport = this._buildPassportNamespace();
    this.receipt = this._buildReceiptNamespace();
    this.epoch = this._buildEpochNamespace();
    this.agent = this._buildAgentNamespace();
    this.payment = this._buildPaymentNamespace();
    this.deploy = this._buildDeployNamespace();
    this.crypto = this._buildCryptoNamespace();
    this.chain = this._buildChainNamespace();
  }

  /**
   * Create a Lucid instance from environment variables.
   *
   * Reads: LUCID_ORCHESTRATOR_SECRET_KEY, SOLANA_RPC_URL, EVM_RPC_URL,
   * EVM_PRIVATE_KEY, DATABASE_URL, NFT_PROVIDER, DEPLOY_TARGET,
   * DEPIN_PERMANENT_PROVIDER, ANCHORING_CHAINS
   */
  static fromEnv(): Lucid {
    const orchestratorKey = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
    if (!orchestratorKey) throw new Error('LUCID_ORCHESTRATOR_SECRET_KEY is required');

    const chains: LucidConfig['chains'] = {};
    if (process.env.SOLANA_RPC_URL) {
      chains.solana = { rpc: process.env.SOLANA_RPC_URL };
    }
    if (process.env.EVM_RPC_URL) {
      chains.evm = {
        rpc: process.env.EVM_RPC_URL,
        ...(process.env.EVM_PRIVATE_KEY && { privateKey: process.env.EVM_PRIVATE_KEY }),
      };
    }
    if (!chains.solana && !chains.evm) {
      throw new Error('At least one of SOLANA_RPC_URL or EVM_RPC_URL must be set');
    }

    return new Lucid({
      orchestratorKey,
      chains,
      db: process.env.DATABASE_URL,
      anchoringChains: process.env.ANCHORING_CHAINS?.split(',').filter(Boolean),
      nftProvider: (process.env.NFT_PROVIDER as NFTProvider) || undefined,
      deployTarget: (process.env.DEPLOY_TARGET as DeployerTarget) || undefined,
      depinStorage: (process.env.DEPIN_PERMANENT_PROVIDER as DepinProvider) || undefined,
    });
  }

  get preview(): PreviewNamespace {
    if (!this._previewWarned) {
      (this._config.logger || console).warn(
        '[lucid] Warning: preview features are not covered by semver stability guarantees.',
      );
      this._previewWarned = true;
    }
    if (!this._preview) {
      this._preview = this._buildPreviewNamespace();
    }
    return this._preview;
  }

  // ─── Namespace Builders ─────────────────────────────────────────────────

  private _buildPassportNamespace(): PassportNamespace {
    let manager: any = null;
    const getManager = () => {
      if (!manager) {
        const { getPassportManager } = require('@lucid-l2/engine');
        manager = getPassportManager();
      }
      return manager;
    };

    return {
      create: (params) => this._wrap(() => getManager().createPassport(params)),
      get: (id) => this._wrap(() => getManager().getPassport(id)),
      update: (id, params) => this._wrap(() => getManager().updatePassport(id, params)),
      list: (params) => this._wrap(() => getManager().listPassports(params)),
      anchor: async (id, opts) => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const chains = opts?.chains || this._config.anchoringChains || [];
        return Promise.allSettled(
          chains.map(async (chain: string) => {
            return this._wrap(async () => {
              const adapter = await blockchainAdapterFactory.getAdapter(chain);
              return adapter.passports().anchorPassport(id, '', '');
            });
          }),
        );
      },
      setPaymentGate: (id, params) => this._wrap(async () => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().setPaymentGate(id, params.price, params.priceLucid || 0);
      }),
    };
  }

  private _buildReceiptNamespace(): ReceiptNamespace {
    return {
      create: (params) => this._wrap(() => {
        const { createInferenceReceipt } = require('@lucid-l2/engine');
        return createInferenceReceipt(params);
      }),
      get: (id) => this._wrap(() => {
        const { getInferenceReceipt } = require('@lucid-l2/engine');
        return getInferenceReceipt(id);
      }),
      verify: (id) => this._wrap(() => {
        const { verifyInferenceReceipt } = require('@lucid-l2/engine');
        return verifyInferenceReceipt(id);
      }),
      prove: (id) => this._wrap(() => {
        const { getInferenceReceiptProof } = require('@lucid-l2/engine');
        return getInferenceReceiptProof(id);
      }),
      list: (params) => this._wrap(() => {
        const { listInferenceReceipts } = require('@lucid-l2/engine');
        return listInferenceReceipts(params);
      }),
      compute: {
        create: (params) => this._wrap(() => {
          const { createComputeReceipt } = require('@lucid-l2/engine');
          return createComputeReceipt(params);
        }),
        get: (id) => this._wrap(() => {
          const { getComputeReceipt } = require('@lucid-l2/engine');
          return getComputeReceipt(id);
        }),
        verify: (id) => this._wrap(() => {
          const { verifyComputeReceipt } = require('@lucid-l2/engine');
          return verifyComputeReceipt(id);
        }),
        list: () => this._wrap(() => {
          const { listComputeReceipts } = require('@lucid-l2/engine');
          return listComputeReceipts();
        }),
      },
    };
  }

  private _buildEpochNamespace(): EpochNamespace {
    return {
      current: () => this._wrap(() => {
        const { getCurrentEpoch } = require('@lucid-l2/engine');
        return getCurrentEpoch();
      }),
      finalize: (id) => this._wrap(() => {
        const { finalizeEpoch } = require('@lucid-l2/engine');
        return finalizeEpoch(id);
      }),
      anchor: (id) => this._wrap(() => {
        const { commitEpochRoot } = require('@lucid-l2/engine');
        return commitEpochRoot(id);
      }),
      verify: (id, chain) => this._wrap(async () => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const adapter = await blockchainAdapterFactory.getAdapter(chain);
        return adapter.epochs().verifyEpoch('', 0, id);
      }),
      list: () => this._wrap(() => {
        const { getAllEpochs } = require('@lucid-l2/engine');
        return getAllEpochs();
      }),
    };
  }

  private _buildAgentNamespace(): AgentNamespace {
    return {
      deploy: (passportId, target, opts) => this._wrap(async () => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        return getAgentDeploymentService().deploy({ passportId, target, ...opts });
      }),
      status: (passportId) => this._wrap(async () => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        return getAgentDeploymentService().status(passportId);
      }),
      logs: (passportId, opts) => this._wrap(async () => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        return getAgentDeploymentService().logs(passportId, opts);
      }),
      terminate: (passportId) => this._wrap(async () => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        return getAgentDeploymentService().terminate(passportId);
      }),
      wallet: {
        create: (passportId) => this._wrap(async () => {
          const { blockchainAdapterFactory } = require('@lucid-l2/engine');
          const adapter = await blockchainAdapterFactory.getAdapter('solana-devnet');
          const walletAdapter = adapter.agentWallet?.();
          if (!walletAdapter) throw new Error('Agent wallet not available on this chain');
          return walletAdapter.createWallet(passportId);
        }),
        balance: async (passportId) => {
          try {
            return await this._wrap(async () => {
              const { blockchainAdapterFactory } = require('@lucid-l2/engine');
              const adapter = await blockchainAdapterFactory.getAdapter('solana-devnet');
              const walletAdapter = adapter.agentWallet?.();
              if (!walletAdapter) return { balance: '0', currency: 'SOL' };
              return walletAdapter.getBalance(passportId);
            });
          } catch {
            return { balance: '0', currency: 'SOL' };
          }
        },
      },
      marketplace: {
        list: (passportId) => this._wrap(async () => {
          const { getAgentRevenuePool } = require('@lucid-l2/engine');
          return getAgentRevenuePool(passportId);
        }),
      },
    };
  }

  private _buildPaymentNamespace(): PaymentNamespace {
    return {
      createGrant: (params) => this._wrap(async () => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().createGrant(params);
      }),
      verifyGrant: (header) => this._wrap(async () => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().verifyGrant(header);
      }),
      calculateSplit: (receipt) => this._wrap(async () => {
        const { calculatePayoutSplit } = require('@lucid-l2/engine');
        return calculatePayoutSplit(receipt);
      }),
      settle: (epochId) => this._wrap(async () => {
        const { executePayoutSplit } = require('@lucid-l2/engine');
        return executePayoutSplit(epochId);
      }),
    };
  }

  private _buildDeployNamespace(): DeployNamespace {
    const config = this._config;
    return {
      build: (passportId, artifact) => this._wrap(async () => {
        const { getDeployer } = require('@lucid-l2/engine');
        const deployer = getDeployer(config.deployTarget || 'docker');
        return deployer.build(passportId, artifact);
      }),
      push: (passportId, tag) => this._wrap(async () => {
        const { getDeployer } = require('@lucid-l2/engine');
        const deployer = getDeployer(config.deployTarget || 'docker');
        return deployer.push(passportId, tag);
      }),
      targets: () => {
        const { listDeployerTargets } = require('@lucid-l2/engine');
        return listDeployerTargets();
      },
    };
  }

  private _buildCryptoNamespace(): CryptoNamespace {
    // Persistent MerkleTree instance — survives across calls
    let _mmrInstance: any = null;
    const getMMR = () => {
      if (!_mmrInstance) {
        const { AgentMerkleTree } = require('@lucid-l2/engine');
        _mmrInstance = new AgentMerkleTree();
      }
      return _mmrInstance;
    };

    return {
      hash: (data) => {
        const { sha256Hex } = require('@lucid-l2/engine');
        return sha256Hex(data);
      },
      sign: (msg) => {
        const { signMessage } = require('@lucid-l2/engine');
        return signMessage(msg).signature;
      },
      verify: (sig, pk, msg) => {
        const { verifySignature } = require('@lucid-l2/engine');
        return verifySignature(sig, pk, msg);
      },
      canonicalJson: (obj) => {
        const { canonicalJson } = require('@lucid-l2/engine');
        return canonicalJson(obj);
      },
      mmr: {
        append: (leaf) => {
          const mmr = getMMR();
          const leafBuf = Buffer.from(leaf, 'hex');
          const root = mmr.append(leafBuf);
          return root.toString('hex');
        },
        root: () => {
          return getMMR().getRoot().toString('hex');
        },
        prove: (idx) => {
          return getMMR().generateProof(idx);
        },
        reset: () => {
          const { AgentMerkleTree } = require('@lucid-l2/engine');
          _mmrInstance = new AgentMerkleTree();
        },
        size: () => {
          return getMMR().getSize();
        },
      },
    };
  }

  private _buildChainNamespace(): ChainNamespace {
    return {
      capabilities: (chain) => {
        try {
          const { blockchainAdapterFactory } = require('@lucid-l2/engine');
          const adapter = blockchainAdapterFactory.getAdapterSync?.(chain);
          if (adapter) return adapter.capabilities();
        } catch {
          // Adapter not configured — fall through to static map
        }

        // Fallback: conservative static capability map (matches actual adapter defaults)
        if (chain.includes('solana') || chain === 'solana') {
          return { epoch: true, passport: true, escrow: false, verifyAnchor: true, sessionKeys: false, zkml: false, paymaster: false };
        }
        // EVM chains — conservative defaults (contract-dependent features default to false)
        return { epoch: true, passport: true, escrow: false, verifyAnchor: true, sessionKeys: false, zkml: true, paymaster: false };
      },
      health: (chain) => this._wrap(async () => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const adapter = await blockchainAdapterFactory.getAdapter(chain);
        return adapter.checkHealth();
      }),
      adapter: (chain) => this._wrap(async () => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        return blockchainAdapterFactory.getAdapter(chain);
      }),
    };
  }

  private _buildPreviewNamespace(): PreviewNamespace {
    return {
      get reputation() {
        try { return require('@lucid-l2/engine/reputation'); } catch { return {}; }
      },
      get identity() {
        try { return require('@lucid-l2/engine/identity'); } catch { return {}; }
      },
      get zkml() {
        try { return require('@lucid-l2/engine/zkml'); } catch { return {}; }
      },
    };
  }
}
