// offchain/src/agent/wallet/IAgentWalletProvider.ts
// Chain-agnostic agent wallet provider interface — works for Solana + EVM

/**
 * Agent Wallet Provider Interface
 *
 * Each AI agent can have its own blockchain wallet for autonomous transactions.
 * Follows the same factory/interface pattern as DePIN storage and NFT providers.
 */

export interface AgentWallet {
  /** Wallet address (Solana base58 or EVM 0x) */
  address: string;
  /** Which blockchain */
  chain: string;
  /** Which provider created it */
  provider: string;
  /** Associated agent passport ID */
  agent_passport_id: string;
  /** Creation timestamp */
  created_at: number;
}

export interface WalletBalance {
  address: string;
  balances: Array<{
    token: string;
    amount: string;
    decimals: number;
    usd_value?: number;
  }>;
}

export interface SpendingLimits {
  per_tx_usd: number;
  daily_usd: number;
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  token_mint?: string;
  amount?: string;
}

export interface TransactionResult {
  success: boolean;
  tx_signature: string;
  chain: string;
  error?: string;
}

export interface IAgentWalletProvider {
  /** Provider name */
  readonly providerName: string;
  /** Target chain */
  readonly chain: string;

  /** Create a new wallet for an agent */
  createWallet(agentPassportId: string, chain?: string): Promise<AgentWallet>;

  /** Get existing wallet for an agent */
  getWallet(agentPassportId: string): Promise<AgentWallet | null>;

  /** Get wallet balance */
  getBalance(walletAddress: string): Promise<WalletBalance>;

  /** Execute a transaction from the agent wallet */
  executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult>;

  /** Set spending limits */
  setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void>;

  /** Health check */
  isHealthy(): Promise<boolean>;
}
