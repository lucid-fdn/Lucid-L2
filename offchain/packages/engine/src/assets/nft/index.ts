// offchain/src/nft/index.ts
// Factory for NFT providers — singleton pattern matching codebase conventions

import { INFTProvider } from './INFTProvider';

export { INFTProvider, MintResult, NFTMetadata } from './INFTProvider';

let nftSingleton: INFTProvider | null = null;

/**
 * Get the primary NFT provider.
 * env: NFT_PROVIDER = 'token2022' | 'metaplex-core' | 'evm-erc721' | 'mock'
 */
export function getNFTProvider(): INFTProvider {
  if (!nftSingleton) {
    const provider = process.env.NFT_PROVIDER || 'mock';
    switch (provider) {
      case 'token2022': {
        const { Token2022Provider } = require('./Token2022Provider');
        nftSingleton = new Token2022Provider();
        break;
      }
      case 'metaplex-core': {
        const { MetaplexCoreProvider } = require('./MetaplexCoreProvider');
        nftSingleton = new MetaplexCoreProvider();
        break;
      }
      case 'evm-erc721': {
        const { EVMNFTProvider } = require('./EVMNFTProvider');
        nftSingleton = new EVMNFTProvider();
        break;
      }
      default: {
        const { MockNFTProvider } = require('./MockNFTProvider');
        nftSingleton = new MockNFTProvider();
        break;
      }
    }
    console.log(`[NFT] Provider: ${nftSingleton!.providerName} (${nftSingleton!.chain})`);
  }
  return nftSingleton!;
}

/**
 * Get all configured NFT providers for multi-chain minting.
 * env: NFT_CHAINS = comma-separated chain IDs (e.g., 'solana-devnet,base')
 */
export function getAllNFTProviders(): INFTProvider[] {
  const chains = process.env.NFT_CHAINS?.split(',').map(c => c.trim()).filter(Boolean);
  if (!chains || chains.length === 0) return [getNFTProvider()];

  const providerMap: Record<string, () => INFTProvider> = {
    'solana-devnet': () => { const { Token2022Provider } = require('./Token2022Provider'); return new Token2022Provider(); },
    'solana-mainnet': () => { const { Token2022Provider } = require('./Token2022Provider'); return new Token2022Provider(); },
    'base': () => { const { EVMNFTProvider } = require('./EVMNFTProvider'); return new EVMNFTProvider(); },
  };

  return chains
    .map(chain => providerMap[chain]?.())
    .filter((p): p is INFTProvider => !!p);
}

/** Reset singletons (for tests) */
export function resetNFTProvider(): void {
  nftSingleton = null;
}
