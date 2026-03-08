export interface ChainConfig {
  name: string;
  chainId?: number;
  rpcUrl: string;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  chain: string;
}

export interface PaymentProof {
  chain: string;
  txHash?: string;
  authorization?: string;
  facilitatorData?: Record<string, unknown>;
}

export interface PaymentExpectation {
  amount: bigint;
  token: TokenConfig;
  recipient: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  txHash?: string;
  settledAmount?: bigint;
  metadata?: Record<string, unknown>;
}

export interface PaymentParams {
  amount: bigint;
  token: TokenConfig;
  chain: string;
  recipient: string;
}

export interface PaymentInstructions {
  chain: string;
  token: string;
  tokenAddress: string;
  amount: string;
  recipient: string;
  facilitator: string;
  facilitatorUrl?: string;
  scheme?: string;
}

export interface SplitRecipient {
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  passportId?: string;
  walletAddress: string;
  bps: number;
}

export interface SplitResolution {
  recipients: SplitRecipient[];
  useSplitter: boolean;
  splitterAddress?: string;
  totalAmount: bigint;
  token: TokenConfig;
  chain: string;
}

export interface X402ResponseV2 {
  version: '2';
  facilitator: string;
  description: string;
  payment: PaymentInstructions;
  alternatives?: PaymentInstructions[];
  splits?: Array<{ role: string; passport?: string; bps: number }>;
  expires?: number;
}
