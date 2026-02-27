// offchain/src/shares/MockTokenLauncher.ts
// In-memory mock token launcher for dev/test

import { randomBytes } from 'crypto';
import { ITokenLauncher, TokenLaunchResult, TokenLaunchParams, TokenInfo } from './ITokenLauncher';

const tokenRegistry = new Map<string, TokenInfo>();

export class MockTokenLauncher implements ITokenLauncher {
  readonly providerName = 'mock';

  async launchToken(params: TokenLaunchParams): Promise<TokenLaunchResult> {
    const mint = 'mock_token_' + randomBytes(16).toString('hex');
    const txSignature = 'mock_tx_' + randomBytes(16).toString('hex');

    const info: TokenInfo = {
      mint,
      passportId: params.passportId,
      name: params.name,
      symbol: params.symbol,
      totalSupply: params.totalSupply,
      decimals: params.decimals ?? 6,
      holders: 1,
    };
    tokenRegistry.set(params.passportId, info);

    return {
      mint,
      txSignature,
      totalSupply: params.totalSupply,
      provider: this.providerName,
    };
  }

  async getTokenInfo(passportId: string): Promise<TokenInfo | null> {
    return tokenRegistry.get(passportId) || null;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
