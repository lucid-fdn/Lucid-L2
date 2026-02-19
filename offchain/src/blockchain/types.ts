/**
 * Blockchain Adapter Abstraction - Shared Types
 *
 * Chain-agnostic types for multi-chain support.
 * Used by IBlockchainAdapter implementations (Solana, EVM, etc.)
 */

// =============================================================================
// Chain Configuration
// =============================================================================

export type ChainType = 'solana' | 'evm';

export interface ChainConfig {
  /** Unique chain identifier (e.g. 'apechain', 'base', 'ethereum', 'solana-devnet') */
  chainId: string;

  /** Human-readable name */
  name: string;

  /** Chain type */
  chainType: ChainType;

  /** EVM numeric chain ID (only for EVM chains) */
  evmChainId?: number;

  /** RPC endpoint URL */
  rpcUrl: string;

  /** Fallback RPC endpoints */
  fallbackRpcUrls?: string[];

  /** Whether this is a testnet */
  isTestnet: boolean;

  /** Block explorer URL */
  explorerUrl?: string;

  /** Native currency symbol */
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };

  /** ERC-8004 contract addresses (only for EVM chains) */
  erc8004?: {
    identityRegistry?: string;
    validationRegistry?: string;
    reputationRegistry?: string;
  };

  /** USDC contract address (for x402 payments) */
  usdcAddress?: string;

  /** LucidValidator contract address */
  lucidValidatorAddress?: string;
}

// =============================================================================
// Transaction Types
// =============================================================================

export interface TxReceipt {
  /** Transaction hash */
  hash: string;

  /** Chain the transaction was submitted on */
  chainId: string;

  /** Whether the transaction succeeded */
  success: boolean;

  /** Block number (if confirmed) */
  blockNumber?: number;

  /** Gas used */
  gasUsed?: string;

  /** Effective gas price */
  gasPrice?: string;

  /** Transaction status message */
  statusMessage?: string;

  /** Raw receipt data (chain-specific) */
  raw?: unknown;
}

export interface UnsignedTx {
  /** Destination address */
  to: string;

  /** Value to send (in native currency, wei for EVM) */
  value?: string;

  /** Encoded calldata */
  data?: string;

  /** Gas limit */
  gasLimit?: string;
}

// =============================================================================
// ERC-8004 Types
// =============================================================================

export interface AgentRegistration {
  /** Agent name */
  name: string;

  /** Agent description */
  description: string;

  /** Service endpoints */
  endpoints: string[];

  /** Agent capabilities */
  capabilities: string[];

  /** Wallet addresses by chain */
  wallets?: Record<string, string>;

  /** Trust models supported */
  trustModels?: string[];

  /** Token URI (IPFS CID or URL) */
  tokenURI?: string;
}

export interface AgentIdentity {
  /** On-chain token ID */
  tokenId: string;

  /** Owner address */
  owner: string;

  /** Token URI pointing to metadata */
  tokenURI: string;

  /** Registration timestamp */
  registeredAt?: number;

  /** Whether the agent is active */
  isActive?: boolean;
}

export interface ValidationSubmission {
  /** Agent token ID being validated */
  agentTokenId: string;

  /** Receipt hash being validated */
  receiptHash: string;

  /** Validation result */
  valid: boolean;

  /** Validator-specific metadata */
  metadata?: string;
}

export interface ValidationResult {
  /** Validation ID */
  validationId: string;

  /** Agent token ID */
  agentTokenId: string;

  /** Validator address */
  validator: string;

  /** Whether validation passed */
  valid: boolean;

  /** Timestamp */
  timestamp: number;

  /** Additional metadata */
  metadata?: string;
}

export interface ReputationFeedback {
  /** Agent token ID */
  agentTokenId: string;

  /** Score (1-100) */
  score: number;

  /** Feedback category */
  category?: string;

  /** Optional comment hash */
  commentHash?: string;
}

export interface ReputationData {
  /** Who submitted the feedback */
  from: string;

  /** Agent token ID */
  agentTokenId: string;

  /** Score (1-100) */
  score: number;

  /** Category */
  category?: string;

  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// Adapter Health
// =============================================================================

export interface ChainHealthStatus {
  /** Chain identifier */
  chainId: string;

  /** Connection status */
  status: 'healthy' | 'degraded' | 'down';

  /** Latest block number */
  blockNumber?: number;

  /** RPC latency in ms */
  latencyMs?: number;

  /** Last check timestamp */
  lastCheck: number;

  /** Error message if unhealthy */
  error?: string;
}
