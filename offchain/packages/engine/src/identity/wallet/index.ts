// offchain/src/agent/wallet/index.ts
// Factory for agent wallet providers — singleton pattern matching codebase conventions

import { IAgentWalletProvider } from './IAgentWalletProvider';
import { logger } from '../../lib/logger';

export { IAgentWalletProvider, AgentWallet, WalletBalance, TransactionRequest, TransactionResult, SpendingLimits } from './IAgentWalletProvider';

let walletSingleton: IAgentWalletProvider | null = null;

/**
 * Get the agent wallet provider.
 * env: AGENT_WALLET_PROVIDER = 'crossmint' | 'erc6551' | 'solana-native' | 'mock'
 */
export function getAgentWalletProvider(): IAgentWalletProvider {
  if (!walletSingleton) {
    const provider = process.env.AGENT_WALLET_PROVIDER || 'mock';
    switch (provider) {
      case 'crossmint': {
        const { CrossmintWalletProvider } = require('./CrossmintWalletProvider');
        walletSingleton = new CrossmintWalletProvider();
        break;
      }
      case 'erc6551': {
        const { ERC6551WalletProvider } = require('./ERC6551WalletProvider');
        walletSingleton = new ERC6551WalletProvider();
        break;
      }
      case 'solana-native': {
        const { SolanaWalletProvider } = require('./SolanaWalletProvider');
        walletSingleton = new SolanaWalletProvider();
        break;
      }
      default: {
        const { MockWalletProvider } = require('./MockWalletProvider');
        walletSingleton = new MockWalletProvider();
        break;
      }
    }
    logger.info(`[AgentWallet] Provider: ${walletSingleton!.providerName} (${walletSingleton!.chain})`);
  }
  return walletSingleton!;
}

/** Reset singleton (for tests) */
export function resetAgentWalletProvider(): void {
  walletSingleton = null;
}
