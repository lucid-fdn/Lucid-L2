/**
 * Blockchain Adapter Interface
 *
 * Chain-agnostic interface for interacting with any blockchain.
 * Implementations: EVMAdapter (viem), SolanaAdapter (web3.js)
 */

import type {
  ChainConfig,
  ChainType,
  ChainHealthStatus,
  TxReceipt,
  UnsignedTx,
  AgentRegistration,
  AgentIdentity,
} from './types';

import type {
  IEpochAdapter,
  IEscrowAdapter,
  IPassportAdapter,
  IAgentWalletAdapter,
  IGasAdapter,
  IIdentityAdapter,
  IValidationAdapter,
  ChainCapabilities,
} from './domain-interfaces';

export interface IBlockchainAdapter {
  /** Chain identifier (e.g. 'base', 'apechain') */
  readonly chainId: string;

  /** Chain type */
  readonly chainType: ChainType;

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /** Connect to the chain using the provided config */
  connect(config: ChainConfig): Promise<void>;

  /** Disconnect from the chain */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Get the current account address */
  getAccount(): Promise<{ address: string }>;

  /** Health check */
  checkHealth(): Promise<ChainHealthStatus>;

  // =========================================================================
  // ERC-8004: Identity Registry (deprecated — use identity() sub-adapter)
  // =========================================================================

  /** @deprecated Use `identity().register()` instead */
  registerAgent(metadata: AgentRegistration): Promise<TxReceipt>;

  /** @deprecated Use `identity().query()` instead */
  queryAgent(agentId: string): Promise<AgentIdentity | null>;

  // =========================================================================
  // Generic Transaction
  // =========================================================================

  /** Send a raw transaction */
  sendTransaction(tx: UnsignedTx): Promise<TxReceipt>;

  /** Get transaction status by hash */
  getTransactionStatus(hash: string): Promise<TxReceipt>;

  // =========================================================================
  // Domain Sub-Adapters
  // =========================================================================

  /** Epoch commitment and verification */
  epochs(): IEpochAdapter;

  /** Escrow lifecycle (create, release, timeout, dispute) */
  escrow(): IEscrowAdapter;

  /** Passport anchoring, payment gates, and access control */
  passports(): IPassportAdapter;

  /** Agent PDA/smart-account wallet (optional — not all chains support this) */
  agentWallet?(): IAgentWalletAdapter;

  /** Gas collection and revenue splitting (optional) */
  gas?(): IGasAdapter;

  /** Identity registry (register, query, TBA, modules) */
  identity(): IIdentityAdapter;

  /** Validation registry (request, submit, verify) */
  validation(): IValidationAdapter;

  /** Return a map of which features this chain supports */
  capabilities(): ChainCapabilities;
}
