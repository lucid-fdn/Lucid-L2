// offchain/src/shares/ITokenLauncher.ts
// Token launcher interface — token IS the share, no custom on-chain program needed

export interface TokenLaunchResult {
  /** SPL token mint address */
  mint: string;
  /** Transaction signature */
  txSignature: string;
  /** Total supply minted */
  totalSupply: number;
  /** Provider used */
  provider: string;
}

export interface TokenLaunchParams {
  passportId: string;
  name: string;
  symbol: string;
  /** Arweave metadata URI */
  uri: string;
  totalSupply: number;
  /** Token decimals (default: 6) */
  decimals?: number;
  /** Owner address — receives total supply */
  owner: string;
}

export interface TokenInfo {
  mint: string;
  passportId: string;
  name: string;
  symbol: string;
  totalSupply: number;
  decimals: number;
  holders?: number;
}

/**
 * Token launcher interface — swappable between direct SPL mint and Genesis TGE.
 * After launch, tokens are standard SPL — tradeable on any DEX.
 */
export interface ITokenLauncher {
  readonly providerName: string;

  /** Create + launch a share token for a passport */
  launchToken(params: TokenLaunchParams): Promise<TokenLaunchResult>;

  /** Get token info for a passport */
  getTokenInfo(passportId: string): Promise<TokenInfo | null>;

  /** Health check */
  isHealthy(): Promise<boolean>;
}
