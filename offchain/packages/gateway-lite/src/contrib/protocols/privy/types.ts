export interface PrivyCredentials {
  appId: string;
  appSecret: string;
  authPrivateKey: string;  // Path or base64
  keyQuorumId: string;
  apiBaseUrl?: string;
}

export interface SessionSignerConfig {
  walletId: string;
  userId: string;
  policies: {
    ttl?: number;              // Seconds
    maxAmount?: string;        // In base units (lamports/wei)
    allowedPrograms?: string[]; // Solana Program IDs
    allowedContracts?: string[]; // EVM contract addresses
    dailyLimit?: string;
    requiresQuorum?: boolean;
  };
}

export interface SignTransactionParams {
  walletId: string;
  userId: string;
  transaction: string;  // Base64 encoded
  chainType: 'solana' | 'ethereum';
}

export interface PrivyRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

export interface PrivyRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

export interface PrivyWallet {
  id: string;
  address: string;
  chainType: 'solana' | 'ethereum' | 'base' | 'polygon';
  walletClientType: 'privy';
  walletIndex: number;
  imported: boolean;
  delegated: boolean;
}

export interface PrivyUser {
  id: string;
  createdAt: string;
  linkedAccounts: any[];
  wallets: PrivyWallet[];
}

export interface SessionSigner {
  id: string;
  publicKey: string;
  expiresAt: string | null;
  policies: {
    ttl?: number;
    maxAmount?: string;
    allowedPrograms?: string[];
    allowedContracts?: string[];
    dailyLimit?: string;
    requiresQuorum?: boolean;
  };
}

export interface TransactionResult {
  signature?: string;
  hash?: string;
  success: boolean;
  error?: string;
}
