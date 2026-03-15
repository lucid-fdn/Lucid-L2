// offchain/src/shares/GenesisLauncher.ts
// Metaplex Genesis TGE launcher — fair launch pool with price discovery
// Lazy-loaded: Genesis SDK only imported when needed

import { ITokenLauncher, TokenLaunchResult, TokenLaunchParams, TokenInfo } from './ITokenLauncher';

// In-memory registry
const tokenRegistry = new Map<string, TokenInfo>();

export class GenesisLauncher implements ITokenLauncher {
  readonly providerName = 'genesis';
  private genesisClient: any = null;

  private async getClient(): Promise<any> {
    if (this.genesisClient) return this.genesisClient;

    // Genesis SDK — lazy-loaded to avoid hard dependency
    // When available, uses the Metaplex Genesis API at https://api.metaplex.com/v1
    try {
      // For now, use the REST API directly until Genesis SDK is published
      this.genesisClient = {
        baseUrl: 'https://api.metaplex.com/v1',
        network: process.env.SOLANA_CLUSTER === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet',
      };
      return this.genesisClient;
    } catch (err) {
      throw new Error(`Failed to initialize Genesis client: ${err instanceof Error ? err.message : err}`);
    }
  }

  async launchToken(params: TokenLaunchParams): Promise<TokenLaunchResult> {
    const client = await this.getClient();

    // Step 1: Create the token via Genesis API
    const network = client.network === 'solana-mainnet' ? '' : '?network=solana-devnet';
    const response = await fetch(`${client.baseUrl}/launches/create${network}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        totalSupply: params.totalSupply,
        decimals: params.decimals ?? 6,
        type: 'launch_pool',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Genesis launch failed: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    const info: TokenInfo = {
      mint: data.mint || data.genesisAddress || '',
      passportId: params.passportId,
      name: params.name,
      symbol: params.symbol,
      totalSupply: params.totalSupply,
      decimals: params.decimals ?? 6,
    };
    tokenRegistry.set(params.passportId, info);

    return {
      mint: info.mint,
      txSignature: data.txSignature || data.signature || '',
      totalSupply: params.totalSupply,
      provider: this.providerName,
    };
  }

  async getTokenInfo(passportId: string): Promise<TokenInfo | null> {
    return tokenRegistry.get(passportId) || null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch('https://api.metaplex.com/v1/listings');
      return res.ok;
    } catch {
      return false;
    }
  }
}
