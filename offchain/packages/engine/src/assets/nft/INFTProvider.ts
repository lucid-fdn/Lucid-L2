// offchain/src/nft/INFTProvider.ts
// Chain-agnostic NFT provider interface — works for Solana + EVM

/**
 * Result of an NFT mint operation
 */
export interface MintResult {
  /** Mint address (Solana base58 or EVM 0x...) */
  mint: string;
  /** Transaction signature / hash */
  txSignature: string;
  /** Token account holding the NFT (ATA on Solana, owner on EVM) */
  tokenAccount?: string;
  /** Chain where the NFT was minted */
  chain: string;
  /** Provider used */
  provider: string;
  /** ERC-6551 TBA address (EVM only, if auto-created) */
  tbaAddress?: string;
}

/**
 * NFT metadata (follows Metaplex / OpenSea standard)
 */
export interface NFTMetadata {
  name: string;
  symbol: string;
  /** DePIN-stored JSON URI (from Phase 1) */
  uri: string;
  /** Passport this NFT represents */
  passportId: string;
  /** Passport type (model, compute, tool, agent, dataset) */
  passportType: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}

/**
 * Chain-agnostic NFT provider.
 * Owner/mint are strings — works for both Solana base58 and EVM 0x addresses.
 * Each provider manages its own key material internally.
 */
export interface INFTProvider {
  readonly providerName: string;
  /** Which chain this provider targets */
  readonly chain: string;

  /** Mint a new NFT for a passport */
  mint(owner: string, metadata: NFTMetadata): Promise<MintResult>;

  /** Burn an NFT (for passport revocation) */
  burn(mint: string): Promise<string>;

  /** Update NFT metadata URI */
  updateMetadata(mint: string, newMetadata: Partial<NFTMetadata>): Promise<string>;

  /** Get on-chain asset data for an NFT */
  getAsset(mint: string): Promise<any | null>;

  /** Health check */
  isHealthy(): Promise<boolean>;
}
