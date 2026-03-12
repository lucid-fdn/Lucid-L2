// @lucid-l2/sdk — Verifiable AI execution layer
export { Lucid } from './lucid';
export type {
  LucidConfig,
  SolanaChainConfig,
  EVMChainConfig,
  DeployerTarget,
  NFTProvider,
  DepinProvider,
  PassportNamespace,
  ReceiptNamespace,
  EpochNamespace,
  AgentNamespace,
  AgentDeployOpts,
  WalletBalance,
  PaymentNamespace,
  DeployNamespace,
  CryptoNamespace,
  MMRNamespace,
  ChainNamespace,
  PreviewNamespace,
  IdentityNamespace,
  // MarketplaceNamespace, // WIP: moved to _wip/
  A2ANamespace,
  ReputationNamespace,
} from './lucid';

// Re-export errors for convenience
export {
  LucidError,
  ChainError,
  SolanaError,
  EVMError,
  ChainFeatureUnavailable,
  ValidationError,
  AuthError,
  DeployError,
  NetworkError,
  TimeoutError,
  RateLimitError,
} from '@lucid-l2/engine';

// Re-export receipt types for convenience
export type {
  ReceiptType, Receipt, ReceiptCreateOptions,
  InferenceReceipt, InferenceReceiptInput,
  ComputeReceipt, ComputeReceiptInput,
  ToolReceipt, ToolReceiptInput,
  AgentReceipt, AgentReceiptInput,
  DatasetReceipt, DatasetReceiptInput,
  ReceiptVerifyResult,
} from '@lucid-l2/engine';

// Re-export retry/timeout utilities
export { withRetry, withTimeout, withRetryAndTimeout } from '@lucid-l2/engine';
export type { RetryOptions } from '@lucid-l2/engine';
