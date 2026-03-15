// offchain/src/agent/wallet/MockWalletProvider.ts
// In-memory mock wallet provider for dev/test

import { randomUUID } from 'crypto';
import { IAgentWalletProvider, AgentWallet, WalletBalance, TransactionRequest, TransactionResult, SpendingLimits } from './IAgentWalletProvider';
import { logger } from '../../lib/logger';

/**
 * Mock Wallet Provider (Dev/Test)
 *
 * In-memory mock for development and testing.
 */
export class MockWalletProvider implements IAgentWalletProvider {
  readonly providerName = 'mock';
  readonly chain = 'mock';

  private wallets = new Map<string, AgentWallet>();
  private balances = new Map<string, WalletBalance>();
  private limits = new Map<string, SpendingLimits>();
  private transactions: TransactionResult[] = [];

  async createWallet(agentPassportId: string, chain?: string): Promise<AgentWallet> {
    const address = 'mock_' + randomUUID().replace(/-/g, '').substring(0, 32);
    const wallet: AgentWallet = {
      address,
      chain: chain || 'mock',
      provider: this.providerName,
      agent_passport_id: agentPassportId,
      created_at: Date.now(),
    };
    this.wallets.set(agentPassportId, wallet);

    // Set default balance
    this.balances.set(address, {
      address,
      balances: [{ token: 'MOCK', amount: '1000.0', decimals: 6 }],
    });

    logger.info(`[AgentWallet] Mock wallet created: ${address} for agent ${agentPassportId}`);
    return wallet;
  }

  async getWallet(agentPassportId: string): Promise<AgentWallet | null> {
    return this.wallets.get(agentPassportId) || null;
  }

  async getBalance(walletAddress: string): Promise<WalletBalance> {
    return this.balances.get(walletAddress) || { address: walletAddress, balances: [] };
  }

  async executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult> {
    const result: TransactionResult = {
      success: true,
      tx_signature: 'mock_tx_' + randomUUID().replace(/-/g, '').substring(0, 16),
      chain: 'mock',
    };
    this.transactions.push(result);
    logger.info(`[AgentWallet] Mock transaction: ${walletAddress} -> ${tx.to} (${tx.amount || tx.value || '0'})`);
    return result;
  }

  async setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void> {
    this.limits.set(walletAddress, limits);
    logger.info(`[AgentWallet] Mock spending limits set: $${limits.per_tx_usd}/tx, $${limits.daily_usd}/day`);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  // Test helpers
  getTransactions(): TransactionResult[] { return this.transactions; }
  getSpendingLimits(address: string): SpendingLimits | undefined { return this.limits.get(address); }
  reset(): void {
    this.wallets.clear();
    this.balances.clear();
    this.limits.clear();
    this.transactions.length = 0;
  }
}
