// offchain/src/nft/Token2022Provider.ts
// Solana Token-2022 NFT provider — wraps existing SolanaPassportClient

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { INFTProvider, MintResult, NFTMetadata } from './INFTProvider';
import { ChainFeatureUnavailable } from '../../errors';
import { SolanaPassportClient } from './solana/solana-token2022';
import { getSolanaKeypair } from '../../chain/solana/keypair';
import { getChainConfig } from '../../shared/chains/configs';
import { logger } from '../../shared/lib/logger';

export class Token2022Provider implements INFTProvider {
  readonly providerName = 'token2022';
  readonly chain: string;
  private client: SolanaPassportClient | null = null;

  constructor() {
    this.chain = process.env.SOLANA_CHAIN_ID || (process.env.SOLANA_CLUSTER === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet');
  }

  private getClient(): SolanaPassportClient {
    if (this.client) return this.client;

    // Get connection config from centralized chain config
    const config = getChainConfig(this.chain);
    const rpcUrl = config?.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    let payer: Keypair | null = null;
    try {
      payer = getSolanaKeypair('LUCID_ORCHESTRATOR_SECRET_KEY');
    } catch {
      logger.warn('[Token2022Provider] Could not load Solana keypair');
    }

    this.client = new SolanaPassportClient(connection, payer);
    return this.client;
  }

  async mint(owner: string, metadata: NFTMetadata): Promise<MintResult> {
    const client = this.getClient();
    const result = await client.registerPassportNFT({
      name: metadata.name,
      description: metadata.description || `Lucid ${metadata.passportType} passport`,
      uri: metadata.uri,
      endpoints: [],
      capabilities: metadata.attributes?.map(a => `${a.trait_type}:${a.value}`) || [],
    });

    return {
      mint: result.mintAddress,
      txSignature: result.txSignature,
      chain: this.chain,
      provider: this.providerName,
    };
  }

  async burn(_mint: string): Promise<string> {
    // Token-2022 burn requires burning the token then closing the mint
    // For now, just mark as not implemented — revocation is handled off-chain
    throw new ChainFeatureUnavailable('NFT burn', 'solana');
  }

  async updateMetadata(_mint: string, _newMetadata: Partial<NFTMetadata>): Promise<string> {
    // Token-2022 metadata update requires update authority
    throw new ChainFeatureUnavailable('NFT metadata update', 'solana');
  }

  async getAsset(mint: string): Promise<any | null> {
    const client = this.getClient();
    return client.getPassportNFT(mint);
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.getClient();
      return true;
    } catch {
      return false;
    }
  }
}
