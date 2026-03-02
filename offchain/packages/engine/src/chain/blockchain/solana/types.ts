/**
 * Solana Adapter Types
 *
 * Solana-specific types for the blockchain adapter abstraction.
 */

export interface SolanaAdapterConfig {
  /** Solana RPC endpoint URL */
  rpcUrl: string;

  /** Private key (base58 or byte array JSON) */
  privateKey?: string;

  /** Path to Anchor wallet JSON file */
  walletPath?: string;

  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface PassportNFTMetadata {
  /** Agent name */
  name: string;

  /** Agent description */
  description: string;

  /** Service endpoints */
  endpoints: string[];

  /** Agent capabilities */
  capabilities: string[];

  /** CAIP-10 addresses on other chains */
  linkedAddresses?: string[];

  /** Token URI (off-chain metadata) */
  uri?: string;
}

export interface PassportNFT {
  /** Mint address (base58) */
  mintAddress: string;

  /** Owner address (base58) */
  owner: string;

  /** Metadata stored in Token-2022 metadata extension */
  metadata: PassportNFTMetadata;

  /** Creation slot */
  createdAtSlot?: number;
}
