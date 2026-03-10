// @lucid-l2/sdk — Verifiable AI execution layer
export { Lucid } from './lucid';
export type {
  LucidConfig,
  SolanaChainConfig,
  EVMChainConfig,
  PassportNamespace,
  ReceiptNamespace,
  EpochNamespace,
  AgentNamespace,
  PaymentNamespace,
  DeployNamespace,
  CryptoNamespace,
  ChainNamespace,
  PreviewNamespace,
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
