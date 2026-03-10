/**
 * Lucid SDK — Main Entry Point
 *
 * new Lucid({ ... }) creates a configured SDK instance with namespaced access
 * to all Lucid-L2 functionality: passports, receipts, epochs, agents,
 * payments, deploy, crypto, and chain operations.
 */

import type { ChainCapabilities } from '@lucid-l2/engine';

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
  nftProvider?: 'token2022' | 'metaplex-core' | 'evm-erc721' | 'mock';

  /** Default agent deployment target */
  deployTarget?: 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';

  /** DePIN storage provider */
  depinStorage?: 'arweave' | 'lighthouse' | 'mock';

  /** Custom logger (defaults to console) */
  logger?: { info: Function; warn: Function; error: Function };
}

// =============================================================================
// Namespace Interfaces
// =============================================================================

export interface PassportNamespace {
  create(params: any): Promise<any>;
  get(passportId: string): Promise<any>;
  update(passportId: string, params: any): Promise<any>;
  list(params?: any): Promise<any[]>;
  anchor(passportId: string, opts?: { chains?: string[] }): Promise<any>;
  setPaymentGate(passportId: string, params: { price: number; priceLucid?: number }): Promise<any>;
}

export interface ReceiptNamespace {
  create(params: any): Promise<any>;
  get(receiptId: string): Promise<any>;
  verify(receiptId: string): Promise<boolean>;
  prove(receiptId: string): Promise<any>;
  list(params?: any): Promise<any[]>;
}

export interface EpochNamespace {
  current(): Promise<any>;
  finalize(epochId: string): Promise<any>;
  anchor(epochId: string): Promise<any>;
  verify(epochId: string, chain: string): Promise<boolean>;
  list(): Promise<any[]>;
}

export interface AgentNamespace {
  deploy(passportId: string, target: string, opts?: any): Promise<any>;
  status(passportId: string): Promise<any>;
  logs(passportId: string, opts?: any): Promise<string[]>;
  terminate(passportId: string): Promise<void>;
  wallet: {
    create(passportId: string): Promise<any>;
    balance(passportId: string): Promise<any>;
  };
  marketplace: {
    list(passportId: string): Promise<any>;
  };
}

export interface PaymentNamespace {
  createGrant(params: any): Promise<any>;
  verifyGrant(grantHeader: string): Promise<boolean>;
  calculateSplit(receipt: any): Promise<any>;
  settle(epochId: string): Promise<any>;
}

export interface DeployNamespace {
  build(passportId: string, artifact: any): Promise<any>;
  push(passportId: string, tag: string): Promise<any>;
  targets(): string[];
}

export interface CryptoNamespace {
  hash(data: string | Buffer): string;
  sign(message: string | Buffer): string;
  verify(signature: string, publicKey: string, message: string | Buffer): boolean;
  canonicalJson(obj: any): string;
  mmr: {
    append(leaf: string): void;
    root(): string;
    prove(index: number): any;
  };
}

export interface ChainNamespace {
  capabilities(chain: string): ChainCapabilities;
  health(chain: string): Promise<any>;
  adapter(chain: string): any;
}

export interface PreviewNamespace {
  readonly reputation: any;
  readonly identity: any;
  readonly zkml: any;
}

// =============================================================================
// Lucid Class
// =============================================================================

export class Lucid {
  private _config: LucidConfig;
  private _previewWarned = false;
  private _preview: PreviewNamespace | null = null;

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
      create: (params) => getManager().createPassport(params),
      get: (id) => getManager().getPassport(id),
      update: (id, params) => getManager().updatePassport(id, params),
      list: (params) => getManager().listPassports(params),
      anchor: async (id, opts) => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const chains = opts?.chains || this._config.anchoringChains || [];
        const results = await Promise.allSettled(
          chains.map(async (chain: string) => {
            const adapter = await blockchainAdapterFactory.getAdapter(chain);
            return adapter.passports().anchorPassport(id, '', '');
          }),
        );
        return results;
      },
      setPaymentGate: async (id, params) => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().setPaymentGate(id, params.price, params.priceLucid || 0);
      },
    };
  }

  private _buildReceiptNamespace(): ReceiptNamespace {
    return {
      create: async (params) => {
        const { createReceipt } = require('@lucid-l2/engine');
        return createReceipt(params);
      },
      get: async (id) => {
        const { getReceipt } = require('@lucid-l2/engine');
        return getReceipt(id);
      },
      verify: async (id) => {
        const { verifyReceipt } = require('@lucid-l2/engine');
        return verifyReceipt(id);
      },
      prove: async (id) => {
        const { getReceiptProof } = require('@lucid-l2/engine');
        return getReceiptProof(id);
      },
      list: async (params) => {
        const { listReceipts } = require('@lucid-l2/engine');
        return listReceipts(params);
      },
    };
  }

  private _buildEpochNamespace(): EpochNamespace {
    return {
      current: async () => {
        const { getCurrentEpoch } = require('@lucid-l2/engine');
        return getCurrentEpoch();
      },
      finalize: async (id) => {
        const { finalizeEpoch } = require('@lucid-l2/engine');
        return finalizeEpoch(id);
      },
      anchor: async (id) => {
        const { commitEpochRoot } = require('@lucid-l2/engine');
        return commitEpochRoot(id);
      },
      verify: async (id, chain) => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const adapter = await blockchainAdapterFactory.getAdapter(chain);
        return adapter.epochs().verifyEpoch('', 0, id);
      },
      list: async () => {
        const { getAllEpochs } = require('@lucid-l2/engine');
        return getAllEpochs();
      },
    };
  }

  private _buildAgentNamespace(): AgentNamespace {
    const config = this._config;
    return {
      deploy: async (passportId, target, opts) => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        const svc = getAgentDeploymentService();
        return svc.deploy({ passportId, target: target as any, ...opts });
      },
      status: async (passportId) => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        const svc = getAgentDeploymentService();
        return svc.status(passportId);
      },
      logs: async (passportId, opts) => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        const svc = getAgentDeploymentService();
        return svc.logs(passportId, opts);
      },
      terminate: async (passportId) => {
        const { getAgentDeploymentService } = require('@lucid-l2/engine');
        const svc = getAgentDeploymentService();
        return svc.terminate(passportId);
      },
      wallet: {
        create: async (passportId) => {
          const { blockchainAdapterFactory } = require('@lucid-l2/engine');
          const adapter = await blockchainAdapterFactory.getAdapter('solana-devnet');
          const walletAdapter = adapter.agentWallet?.();
          if (!walletAdapter) throw new Error('Agent wallet not available on this chain');
          return walletAdapter.createWallet(passportId);
        },
        balance: async (_passportId) => {
          // Agent wallet balance requires looking up the PDA and querying token accounts
          return { balance: '0', currency: 'SOL' };
        },
      },
      marketplace: {
        list: async (passportId) => {
          const { getAgentRevenuePool } = require('@lucid-l2/engine');
          return getAgentRevenuePool(passportId);
        },
      },
    };
  }

  private _buildPaymentNamespace(): PaymentNamespace {
    return {
      createGrant: async (params) => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().createGrant(params);
      },
      verifyGrant: async (header) => {
        const { getPaymentGateService } = require('@lucid-l2/engine');
        return getPaymentGateService().verifyGrant(header);
      },
      calculateSplit: async (receipt) => {
        const { calculatePayoutSplit } = require('@lucid-l2/engine');
        return calculatePayoutSplit(receipt);
      },
      settle: async (epochId) => {
        const { executePayoutSplit } = require('@lucid-l2/engine');
        return executePayoutSplit(epochId);
      },
    };
  }

  private _buildDeployNamespace(): DeployNamespace {
    const config = this._config;
    return {
      build: async (passportId, artifact) => {
        const { getDeployer } = require('@lucid-l2/engine');
        const deployer = getDeployer(config.deployTarget || 'docker');
        return deployer.build(passportId, artifact);
      },
      push: async (passportId, tag) => {
        const { getDeployer } = require('@lucid-l2/engine');
        const deployer = getDeployer(config.deployTarget || 'docker');
        return deployer.push(passportId, tag);
      },
      targets: () => {
        const { listDeployerTargets } = require('@lucid-l2/engine');
        return listDeployerTargets();
      },
    };
  }

  private _buildCryptoNamespace(): CryptoNamespace {
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
          const { AgentMMR } = require('@lucid-l2/engine');
          const mmr = new AgentMMR();
          mmr.append(leaf);
        },
        root: () => {
          const { AgentMMR } = require('@lucid-l2/engine');
          const mmr = new AgentMMR();
          return mmr.getRoot();
        },
        prove: (idx) => {
          const { AgentMMR } = require('@lucid-l2/engine');
          const mmr = new AgentMMR();
          return mmr.generateProof(idx);
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
          // Adapter not configured
        }

        // Fallback: static capability map
        if (chain.includes('solana') || chain === 'solana') {
          return { epoch: true, passport: true, escrow: true, verifyAnchor: true, sessionKeys: true, zkml: false, paymaster: false };
        }
        // EVM chains
        return { epoch: true, passport: true, escrow: false, verifyAnchor: true, sessionKeys: false, zkml: true, paymaster: true };
      },
      health: async (chain) => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        const adapter = await blockchainAdapterFactory.getAdapter(chain);
        return adapter.checkHealth();
      },
      adapter: (chain) => {
        const { blockchainAdapterFactory } = require('@lucid-l2/engine');
        return blockchainAdapterFactory.getAdapter(chain);
      },
    };
  }

  private _buildPreviewNamespace(): PreviewNamespace {
    return {
      get reputation() {
        return require('@lucid-l2/engine/reputation');
      },
      get identity() {
        return require('@lucid-l2/engine/identity');
      },
      get zkml() {
        return {};
      },
    };
  }
}
