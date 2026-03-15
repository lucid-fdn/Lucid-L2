// offchain/src/agent/wallet/CrossmintWalletProvider.ts
// Crossmint Smart Wallet provider for Solana agent wallets

import { IAgentWalletProvider, AgentWallet, WalletBalance, TransactionRequest, TransactionResult, SpendingLimits } from './IAgentWalletProvider';
import { logger } from '../../lib/logger';

/**
 * Crossmint Wallet Provider (Solana)
 *
 * Creates non-custodial Solana Smart Wallets via Crossmint API.
 * Dual-key architecture: platform key + agent key (neither alone controls).
 * Best for: Solana agent wallets with spending limits.
 *
 * Requires: CROSSMINT_API_KEY, CROSSMINT_PROJECT_ID
 */
export class CrossmintWalletProvider implements IAgentWalletProvider {
  readonly providerName = 'crossmint';
  readonly chain = 'solana';

  private apiKey: string;
  private projectId: string;
  private baseUrl: string;
  private walletCache = new Map<string, AgentWallet>();

  constructor() {
    this.apiKey = process.env.CROSSMINT_API_KEY || '';
    this.projectId = process.env.CROSSMINT_PROJECT_ID || '';
    this.baseUrl = process.env.CROSSMINT_API_URL || 'https://www.crossmint.com/api/v1';
  }

  async createWallet(agentPassportId: string, _chain?: string): Promise<AgentWallet> {
    if (!this.apiKey) throw new Error('CROSSMINT_API_KEY not set');

    const res = await fetch(`${this.baseUrl}/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({
        type: 'solana-smart-wallet',
        linkedUser: `agent:${agentPassportId}`,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Crossmint wallet creation failed: ${error}`);
    }

    const data = await res.json() as any;

    const wallet: AgentWallet = {
      address: data.address || data.publicKey,
      chain: 'solana',
      provider: this.providerName,
      agent_passport_id: agentPassportId,
      created_at: Date.now(),
    };

    this.walletCache.set(agentPassportId, wallet);
    logger.info(`[AgentWallet] Crossmint wallet created: ${wallet.address} for agent ${agentPassportId}`);
    return wallet;
  }

  async getWallet(agentPassportId: string): Promise<AgentWallet | null> {
    const cached = this.walletCache.get(agentPassportId);
    if (cached) return cached;

    if (!this.apiKey) return null;

    try {
      const res = await fetch(`${this.baseUrl}/wallets?linkedUser=agent:${agentPassportId}`, {
        headers: { 'X-API-KEY': this.apiKey },
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      if (!data.address && !data.publicKey) return null;

      const wallet: AgentWallet = {
        address: data.address || data.publicKey,
        chain: 'solana',
        provider: this.providerName,
        agent_passport_id: agentPassportId,
        created_at: data.createdAt || Date.now(),
      };
      this.walletCache.set(agentPassportId, wallet);
      return wallet;
    } catch {
      return null;
    }
  }

  async getBalance(walletAddress: string): Promise<WalletBalance> {
    if (!this.apiKey) throw new Error('CROSSMINT_API_KEY not set');

    const res = await fetch(`${this.baseUrl}/wallets/${walletAddress}/balances`, {
      headers: { 'X-API-KEY': this.apiKey },
    });

    if (!res.ok) throw new Error(`Failed to get balance: ${res.status}`);
    const data = await res.json() as any;

    return {
      address: walletAddress,
      balances: (data.balances || []).map((b: any) => ({
        token: b.token || 'SOL',
        amount: b.amount || '0',
        decimals: b.decimals || 9,
        usd_value: b.usdValue,
      })),
    };
  }

  async executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult> {
    if (!this.apiKey) throw new Error('CROSSMINT_API_KEY not set');

    const res = await fetch(`${this.baseUrl}/wallets/${walletAddress}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({
        to: tx.to,
        value: tx.value,
        tokenMint: tx.token_mint,
        amount: tx.amount,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      return { success: false, tx_signature: '', chain: 'solana', error };
    }

    const data = await res.json() as any;
    return {
      success: true,
      tx_signature: data.txSignature || data.hash || '',
      chain: 'solana',
    };
  }

  async setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void> {
    if (!this.apiKey) throw new Error('CROSSMINT_API_KEY not set');

    await fetch(`${this.baseUrl}/wallets/${walletAddress}/limits`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({
        perTransaction: limits.per_tx_usd,
        daily: limits.daily_usd,
      }),
    });
    logger.info(`[AgentWallet] Spending limits set for ${walletAddress}: $${limits.per_tx_usd}/tx, $${limits.daily_usd}/day`);
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiKey;
  }
}
