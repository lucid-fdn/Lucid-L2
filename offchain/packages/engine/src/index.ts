// @lucid-l2/engine — truth library (no HTTP)

// ─── Errors ─────────────────────────────────────────────────────────────────
export * from './errors';

// ─── Crypto ─────────────────────────────────────────────────────────────────
export * from './crypto/hash';
export * from './crypto/signing';
export * from './crypto/canonicalJson';
export { AgentMMR } from './crypto/mmr';
export type { MMRNode, MMRProof, MMRState } from './crypto/mmr';
// Note: mmr.ts and merkleTree.ts both export 'MerkleTree'.
// We re-export mmr's as AgentMerkleTree to disambiguate at the barrel level.
// Direct imports (e.g., from './crypto/mmr') still work fine.
export { MerkleTree as AgentMerkleTree } from './crypto/mmr';
export { MerkleTree, getReceiptTree, resetReceiptTree } from './crypto/merkleTree';
export type { MerkleProof, MerkleVerifyResult } from './crypto/merkleTree';
export * from './crypto/schemaValidator';

// ─── Config ─────────────────────────────────────────────────────────────────
export * from './config/config';
export * from './config/paths';

// ─── Receipt & Epoch ────────────────────────────────────────────────────────
export {
  // Inference receipts
  createInferenceReceipt, getInferenceReceipt, getInferenceReceiptAsync,
  verifyInferenceReceiptHash, verifyInferenceReceipt,
  getInferenceReceiptProof, getMmrRoot, getMmrLeafCount, getSignerPublicKey,
  listInferenceReceipts,
  // Compute receipts
  createComputeReceipt, createComputeReceiptFromJob,
  getComputeReceipt, verifyComputeReceipt, listComputeReceipts,
  validateComputeReceiptInput, assertValidComputeReceiptInput,
  // Tool receipts
  createToolReceipt,
  // Agent receipts
  createAgentReceipt,
  // Dataset receipts
  createDatasetReceipt,
  // Unified receipt functions
  createReceipt, getReceipt, verifyReceipt, getReceiptProof, listReceipts,
  // Hash functions
  computeQuoteHash, verifyQuoteHash, computeJobHash, verifyJobHash,
  computeInputHash, computeOutputsHash,
  verifyReceiptProof,
} from './receipt/receiptService';
export type {
  ReceiptType, Receipt, ReceiptCreateOptions,
  InferenceReceipt, InferenceReceiptInput, InferenceReceiptBody,
  ComputeReceipt, ComputeReceiptBody,
  ToolReceipt, ToolReceiptInput, ToolReceiptBody,
  AgentReceipt, AgentReceiptInput, AgentReceiptBody,
  DatasetReceipt, DatasetReceiptInput, DatasetReceiptBody,
  ReceiptVerifyResult,
} from './receipt/receiptService';
export type { ComputeReceiptInput } from './types/fluidCompute';
export {
  createEpoch, getAllEpochs, getEpoch, finalizeEpoch, getCurrentEpoch,
  addReceiptToEpoch, resetEpochStore, prepareEpochForFinalization, failEpoch,
} from './receipt/epochService';
export type { Epoch, EpochStatus } from './receipt/epochService';
export {
  setAnchoringConfig, setAuthorityKeypair, commitEpochRoot, commitEpochRootsBatch,
} from './receipt/anchoringService';
export type { AnchoringConfig, AnchorResult } from './receipt/anchoringService';
export { getMMRService } from './receipt/mmrService';
export type { AgentEpochData } from './receipt/mmrService';

// ─── Passport ───────────────────────────────────────────────────────────────
export { getPassportManager, resetPassportManager, PassportManager } from './passport/passportManager';
export type { CreatePassportInput, OperationResult, OnChainSyncHandler } from './passport/passportManager';
export { getPassportSyncService, PassportSyncService } from './passport/passportSyncService';
export { getPassportService } from './passport/passportService';

// ─── Chains ─────────────────────────────────────────────────────────────────
export type { IBlockchainAdapter } from './chains/adapter-interface';
export { BlockchainAdapterFactory, blockchainAdapterFactory } from './chains/factory';
export { CHAIN_CONFIGS, getChainConfig, getEVMChains, getSolanaChains } from './chains/configs';
export type {
  ChainConfig, ChainType, ChainHealthStatus, TxReceipt, UnsignedTx,
  AgentRegistration, AgentIdentity,
} from './chains/types';
export type {
  IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter,
  IGasAdapter, IIdentityAdapter, IValidationAdapter, ICrossChainAdapter,
  ChainCapabilities, EscrowCreateParams, WalletPolicy, GasRecipient,
} from './chains/domain-interfaces';
export { EVMAdapter } from './chains/evm/adapter';
export { SolanaAdapter } from './chains/solana/adapter';

// ─── Finance ────────────────────────────────────────────────────────────────
export {
  calculatePayoutSplit, createPayoutFromReceipt, getPayout,
  storePayout, verifyPayoutSplit, executePayoutSplit, getPayoutExecution,
} from './finance/payoutService';
export { getPaymentGateService } from './finance/paymentGateService';
export { getEscrowService, EscrowService } from './finance/escrowService';
export type { EscrowParams, EscrowInfo } from './finance/escrowTypes';
export { EscrowStatus } from './finance/escrowTypes';
export { getDisputeService, DisputeService } from './finance/disputeService';
export type { DisputeInfo, EvidenceSubmission } from './finance/disputeTypes';
export { DisputeStatus } from './finance/disputeTypes';

// ─── Deploy ─────────────────────────────────────────────────────────────────
export {
  getDeployer, listDeployerTargets, getAllDeployers,
} from './deploy';
export type {
  IDeployer, DeploymentResult, DeploymentStatus, DeploymentStatusType,
  DeploymentConfig, RuntimeArtifact, LogOptions,
} from './deploy';

// ─── Agent ──────────────────────────────────────────────────────────────────
export { getAgentDeploymentService, AgentDeploymentService } from './agent/agentDeploymentService';
export type { DeployAgentInput, DeployAgentResult } from './agent/agentDeploymentService';
export { processAgentRevenue, triggerAgentAirdrop, getAgentRevenuePool, getAllRevenuePools } from './agent/agentRevenueService';
export type { AgentRevenuePool } from './agent/agentRevenueService';

// ─── A2A Protocol ──────────────────────────────────────────────────────────
export {
  generateAgentCard, validateAgentCard,
  createA2ATask, updateTaskState, addTaskArtifact, createTaskStore,
  discoverAgent, sendTask, getTaskStatus, cancelTask,
} from './agent/a2a';
export type {
  AgentCard, AgentCardSkill,
  A2ATask, A2AMessage, A2APart, A2ATaskState, A2ATaskStore,
  A2AClientOptions,
} from './agent/a2a';

// ─── Marketplace ───────────────────────────────────────────────────────────
export {
  getMarketplaceService, resetMarketplaceService, MarketplaceService,
} from './agent/marketplace';
export type {
  MarketplaceListing, AgentReview, AgentUsageRecord, ListingFilters,
} from './agent/marketplace';

// ─── Storage ────────────────────────────────────────────────────────────────
export { getPassportStore } from './storage/passportStore';
export { getIdentityStore } from './storage/identityStore';

// ─── Assets ─────────────────────────────────────────────────────────────────
export { getNFTProvider } from './assets/nft';
export { getTokenLauncher } from './assets/shares';

// ─── DePIN Storage ──────────────────────────────────────────────────────────
export { getPermanentStorage, getEvolvingStorage } from './storage/depin';

// ─── Utils ─────────────────────────────────────────────────────────────────
export { withRetry, withTimeout, withRetryAndTimeout } from './utils/retry';
export type { RetryOptions } from './utils/retry';
export { CircuitBreaker, CircuitBreakerOpenError } from './utils/circuitBreaker';
export type { CircuitState, CircuitBreakerOptions } from './utils/circuitBreaker';
