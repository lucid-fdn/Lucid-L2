// offchain/src/nft/EVMNFTProvider.ts
// EVM NFT provider — wraps existing EVMAdapter.registerAgent() + TBA service

import { INFTProvider, MintResult, NFTMetadata } from './INFTProvider';
import { ChainFeatureUnavailable } from '../../errors';

export class EVMNFTProvider implements INFTProvider {
  readonly providerName = 'evm-erc721';
  readonly chain: string;

  constructor() {
    this.chain = process.env.EVM_CHAIN_ID || 'base';
  }

  private async getAdapter(): Promise<any> {
    const { blockchainAdapterFactory } = require('../../chain/blockchain/BlockchainAdapterFactory');
    const adapter = blockchainAdapterFactory.getAdapter(this.chain);
    if (!adapter) throw new Error(`No blockchain adapter for chain: ${this.chain}`);
    if (!adapter.isConnected()) {
      const { CHAIN_CONFIGS } = require('../../chain/blockchain/chains');
      const config = CHAIN_CONFIGS[this.chain];
      if (config) await adapter.connect(config);
    }
    return adapter;
  }

  async mint(owner: string, metadata: NFTMetadata): Promise<MintResult> {
    const adapter = await this.getAdapter();

    const receipt = await adapter.registerAgent({
      name: metadata.name,
      description: metadata.description || `Lucid ${metadata.passportType} passport`,
      metadataURI: metadata.uri,
      capabilities: metadata.attributes?.map(a => `${a.trait_type}:${a.value}`) || [],
    });

    const result: MintResult = {
      mint: receipt.contractAddress || receipt.transactionHash,
      txSignature: receipt.transactionHash,
      chain: this.chain,
      provider: this.providerName,
    };

    // Auto-create ERC-6551 TBA if enabled
    if (process.env.AUTO_CREATE_TBA !== 'false' && receipt.contractAddress) {
      try {
        const { getTBAService } = require('../../identity/tbaService');
        const tba = await getTBAService().createTBA(
          this.chain,
          receipt.contractAddress,
          receipt.tokenId || '0',
        );
        result.tbaAddress = tba.address;
      } catch (err) {
        console.warn(`[EVMNFTProvider] TBA creation failed:`, err instanceof Error ? err.message : err);
      }
    }

    return result;
  }

  async burn(_mint: string): Promise<string> {
    throw new ChainFeatureUnavailable('NFT burn', 'evm');
  }

  async updateMetadata(_mint: string, _newMetadata: Partial<NFTMetadata>): Promise<string> {
    throw new ChainFeatureUnavailable('NFT metadata update', 'evm');
  }

  async getAsset(mint: string): Promise<any | null> {
    try {
      const adapter = await this.getAdapter();
      return adapter.queryAgent(mint);
    } catch {
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const adapter = await this.getAdapter();
      return adapter.isConnected();
    } catch {
      return false;
    }
  }
}
