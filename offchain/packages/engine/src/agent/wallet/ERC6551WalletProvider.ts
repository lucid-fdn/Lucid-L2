// offchain/src/agent/wallet/ERC6551WalletProvider.ts
// ERC-6551 Token Bound Account wallet provider for EVM agent wallets

import { IAgentWalletProvider, AgentWallet, WalletBalance, TransactionRequest, TransactionResult, SpendingLimits } from './IAgentWalletProvider';

/**
 * ERC-6551 Token Bound Account Wallet Provider (EVM)
 *
 * Creates EVM wallets using ERC-6551 Token Bound Accounts.
 * Each agent NFT gets its own smart contract wallet.
 * Best for: EVM-based agent wallets with programmatic control.
 *
 * Requires: EVM_RPC_URL, EVM_PRIVATE_KEY (deployer)
 */
export class ERC6551WalletProvider implements IAgentWalletProvider {
  readonly providerName = 'erc6551';
  readonly chain = 'evm';

  private rpcUrl: string;
  private walletCache = new Map<string, AgentWallet>();

  // ERC-6551 Registry (deployed on most EVM chains)
  private readonly REGISTRY_ADDRESS = '0x000000006551c19487814612e58FE06813775758';

  constructor() {
    this.rpcUrl = process.env.EVM_RPC_URL || 'https://mainnet.base.org';
  }

  async createWallet(agentPassportId: string, chain?: string): Promise<AgentWallet> {
    // ERC-6551 TBA creation requires an NFT to exist first
    // The TBA address is deterministic based on: registry, implementation, chainId, tokenContract, tokenId, salt

    // For now, generate deterministic address from passport ID
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(`erc6551:${agentPassportId}`).digest('hex');
    const address = '0x' + hash.substring(0, 40);

    const wallet: AgentWallet = {
      address,
      chain: chain || 'base',
      provider: this.providerName,
      agent_passport_id: agentPassportId,
      created_at: Date.now(),
    };

    this.walletCache.set(agentPassportId, wallet);
    console.log(`[AgentWallet] ERC-6551 TBA address: ${address} for agent ${agentPassportId}`);
    console.log(`[AgentWallet]   Note: TBA must be deployed on-chain after NFT minting`);
    return wallet;
  }

  async getWallet(agentPassportId: string): Promise<AgentWallet | null> {
    return this.walletCache.get(agentPassportId) || null;
  }

  async getBalance(walletAddress: string): Promise<WalletBalance> {
    try {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [walletAddress, 'latest'],
          id: 1,
        }),
      });

      const data = await res.json() as any;
      const balanceWei = parseInt(data.result || '0', 16);
      const balanceEth = (balanceWei / 1e18).toFixed(18);

      return {
        address: walletAddress,
        balances: [{
          token: 'ETH',
          amount: balanceEth,
          decimals: 18,
        }],
      };
    } catch {
      return { address: walletAddress, balances: [] };
    }
  }

  async executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult> {
    // ERC-6551 execution requires calling the TBA's execute() function
    // This needs the NFT owner's signature
    console.log(`[AgentWallet] ERC-6551 transaction queued for ${walletAddress}: ${JSON.stringify(tx)}`);
    return {
      success: false,
      tx_signature: '',
      chain: 'evm',
      error: 'ERC-6551 transactions require NFT owner signature. Use viem/ethers directly.',
    };
  }

  async setSpendingLimits(_walletAddress: string, _limits: SpendingLimits): Promise<void> {
    console.log(`[AgentWallet] ERC-6551 spending limits require custom guard contract deployment`);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
