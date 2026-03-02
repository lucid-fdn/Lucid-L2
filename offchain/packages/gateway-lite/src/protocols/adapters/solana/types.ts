/**
 * Solana Protocol Adapter - Types
 * 
 * Type definitions specific to Solana blockchain.
 */

import { Commitment, PublicKey } from '@solana/web3.js';

// =============================================================================
// Balance and Account Types
// =============================================================================

export interface SolanaBalance {
  address: string;
  balance: number;
  lamports: number;
}

export interface TokenBalance {
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

export interface TokenAccountInfo {
  pubkey: string;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
  state: 'initialized' | 'frozen';
  isNative: boolean;
  rentExemptReserve: string | null;
  closeAuthority: string | null;
}

export interface AccountInfo {
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data: string | null;
}

// =============================================================================
// Transaction Types
// =============================================================================

export interface TransactionSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized';
  err: any | null;
  memo: string | null;
}

export interface TransactionDetails {
  signature: string;
  slot: number;
  blockTime: number | null;
  meta: {
    err: any | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    logMessages: string[];
    preTokenBalances: any[];
    postTokenBalances: any[];
  };
  transaction: {
    message: {
      accountKeys: string[];
      recentBlockhash: string;
      instructions: any[];
    };
    signatures: string[];
  };
}

export interface RecentBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}

// =============================================================================
// Token Types
// =============================================================================

export interface TokenSupply {
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

export interface TokenMetadata {
  mint: string;
  name?: string;
  symbol?: string;
  decimals: number;
  supply: TokenSupply;
}

// =============================================================================
// Request/Response Types
// =============================================================================

export interface GetBalanceParams {
  address: string;
  commitment?: Commitment;
}

export interface GetTokenBalanceParams {
  address: string;
  mint: string;
  commitment?: Commitment;
}

export interface GetTokenAccountsParams {
  address: string;
  mint?: string;
  commitment?: Commitment;
}

export interface GetTransactionParams {
  signature: string;
  commitment?: Commitment;
}

export interface GetRecentBlockhashParams {
  commitment?: Commitment;
}

export interface GetAccountInfoParams {
  address: string;
  commitment?: Commitment;
}

export interface GetTokenSupplyParams {
  mint: string;
  commitment?: Commitment;
}

export interface GetSignaturesForAddressParams {
  address: string;
  limit?: number;
  before?: string;
  until?: string;
  commitment?: Commitment;
}

export interface TransferSOLParams {
  fromAddress?: string;
  toAddress: string;
  amount: number;
  commitment?: Commitment;
}

export interface TransferTokenParams {
  fromAddress?: string;
  toAddress: string;
  mint: string;
  amount: number;
  decimals?: number;
  commitment?: Commitment;
}

export interface CreateTokenAccountParams {
  owner: string;
  mint: string;
  commitment?: Commitment;
}

export interface CloseTokenAccountParams {
  tokenAccount: string;
  destination?: string;
  commitment?: Commitment;
}

// =============================================================================
// Credential Types
// =============================================================================

export interface SolanaCredentials {
  /** Network selection */
  network: 'mainnet-beta' | 'testnet' | 'devnet';
  
  /** Optional: Custom RPC endpoint */
  rpcEndpoint?: string;
  
  /** Optional: Wallet private key for write operations (base58 encoded) */
  privateKey?: string;
  
  /** Optional: Commitment level */
  commitment?: Commitment;
}

// =============================================================================
// Error Types
// =============================================================================

export interface SolanaError {
  code: string;
  message: string;
  data?: any;
}
