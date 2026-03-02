// offchain/src/shares/index.ts
// Factory for token launchers — singleton pattern

import { ITokenLauncher } from './ITokenLauncher';

export { ITokenLauncher, TokenLaunchResult, TokenLaunchParams, TokenInfo } from './ITokenLauncher';

let launcherSingleton: ITokenLauncher | null = null;

/**
 * Get the token launcher provider.
 * env: TOKEN_LAUNCHER = 'direct-mint' | 'genesis' | 'mock'
 */
export function getTokenLauncher(): ITokenLauncher {
  if (!launcherSingleton) {
    const provider = process.env.TOKEN_LAUNCHER || 'mock';
    switch (provider) {
      case 'direct-mint': {
        const { DirectMintLauncher } = require('./DirectMintLauncher');
        launcherSingleton = new DirectMintLauncher();
        break;
      }
      case 'genesis': {
        const { GenesisLauncher } = require('./GenesisLauncher');
        launcherSingleton = new GenesisLauncher();
        break;
      }
      default: {
        const { MockTokenLauncher } = require('./MockTokenLauncher');
        launcherSingleton = new MockTokenLauncher();
        break;
      }
    }
    console.log(`[Shares] Token launcher: ${launcherSingleton!.providerName}`);
  }
  return launcherSingleton!;
}

/** Reset singleton (for tests) */
export function resetTokenLauncher(): void {
  launcherSingleton = null;
}
