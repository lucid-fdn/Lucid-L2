/**
 * Solana-native agent wallet provider.
 * Wraps the SolanaAdapter's agentWallet() methods to create on-chain PDA wallets
 * for agents using the lucid_agent_wallet Anchor program.
 */

import {
  IAgentWalletProvider,
  AgentWallet,
  WalletBalance,
  TransactionRequest,
  TransactionResult,
  SpendingLimits,
} from './IAgentWalletProvider';

export class SolanaWalletProvider implements IAgentWalletProvider {
  readonly providerName = 'solana-native';
  readonly chain = 'solana';

  private wallets = new Map<string, AgentWallet>();
  private chainId: string;

  constructor(chainId?: string) {
    this.chainId = chainId || process.env.SOLANA_CHAIN_ID || 'solana-devnet';
  }

  async createWallet(agentPassportId: string): Promise<AgentWallet> {
    const adapter = await this.getAdapter();
    const agentWalletAdapter = adapter.agentWallet();
    const result = await agentWalletAdapter.createWallet(agentPassportId);

    const wallet: AgentWallet = {
      address: result.walletAddress,
      chain: 'solana',
      provider: this.providerName,
      agent_passport_id: agentPassportId,
      created_at: Date.now(),
    };

    this.wallets.set(agentPassportId, wallet);
    return wallet;
  }

  async getWallet(agentPassportId: string): Promise<AgentWallet | null> {
    return this.wallets.get(agentPassportId) ?? null;
  }

  async getBalance(walletAddress: string): Promise<WalletBalance> {
    try {
      const adapter = await this.getAdapter();
      const agentWalletAdapter = adapter.agentWallet!();
      const result = await agentWalletAdapter.getBalance(walletAddress);

      return {
        address: walletAddress,
        balances: [{
          token: result.currency,
          amount: result.balance,
          decimals: 9,
        }],
      };
    } catch {
      return { address: walletAddress, balances: [] };
    }
  }

  async executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult> {
    try {
      const adapter = await this.getAdapter();
      const agentWalletAdapter = adapter.agentWallet();
      // Solana adapter's execute throws — it requires instruction-specific methods.
      // Wrap the error gracefully.
      const result = await agentWalletAdapter.execute(walletAddress, tx.data || '');
      return { success: result.success, tx_signature: result.hash, chain: 'solana' };
    } catch (err) {
      return {
        success: false,
        tx_signature: '',
        chain: 'solana',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void> {
    const adapter = await this.getAdapter();
    const agentWalletAdapter = adapter.agentWallet();
    await agentWalletAdapter.setPolicy(walletAddress, {
      maxAmount: Math.floor(limits.per_tx_usd * 1e9).toString(),
      allowedTargets: [],
      allowNativeTransfer: true,
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getAdapter();
      return true;
    } catch {
      return false;
    }
  }

  private async getAdapter() {
    const { BlockchainAdapterFactory } = await import('../../chains/factory');
    const factory = BlockchainAdapterFactory.getInstance();
    return factory.getAdapter(this.chainId);
  }
}
