// @lucid-l2/engine — truth library (no HTTP)

// ─── Errors ─────────────────────────────────────────────────────────────────
export * from './errors';

// ─── Crypto ─────────────────────────────────────────────────────────────────
export * from './shared/crypto/hash';
export * from './shared/crypto/signing';
export * from './shared/crypto/canonicalJson';
export { AgentMMR, MMR } from './shared/crypto/mmr';
export { MMR as AgentMerkleTree } from './shared/crypto/mmr';
export type { MMRNode, MMRProof, MMRState } from './shared/crypto/mmr';
export { getReceiptMMR, resetReceiptMMR, initReceiptMMR, ReceiptMMR } from './shared/crypto/receiptMMR';
export type { SerializedMMRProof } from './shared/crypto/receiptMMR';
// Deprecated: binary Merkle tree kept for backward compatibility
export { MerkleTree, getReceiptTree, resetReceiptTree } from './shared/crypto/merkleTree';
export type { MerkleProof, MerkleVerifyResult } from './shared/crypto/merkleTree';
export * from './shared/crypto/schemaValidator';

// ─── Config ─────────────────────────────────────────────────────────────────
export * from './shared/config/config';
export * from './shared/config/paths';

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
export type { ComputeReceiptInput } from './shared/types/fluidCompute';
export {
  createEpoch, getAllEpochs, getEpoch, finalizeEpoch, getCurrentEpoch,
  addReceiptToEpoch, resetEpochStore, prepareEpochForFinalization, failEpoch,
} from './anchoring/epoch/services/epochService';
export type { Epoch, EpochStatus } from './anchoring/epoch/services/epochService';
export {
  setAnchoringConfig, setAuthorityKeypair, commitEpochRoot, commitEpochRootsBatch,
} from './anchoring/epoch/services/anchoringService';
export type { AnchoringConfig, AnchorResult } from './anchoring/epoch/services/anchoringService';
export { getMMRService } from './anchoring/epoch/services/mmrService';
export type { AgentEpochData } from './anchoring/epoch/services/mmrService';

// ─── Passport ───────────────────────────────────────────────────────────────
export { getPassportManager, resetPassportManager, PassportManager } from './identity/passport/passportManager';
export type { CreatePassportInput, OperationResult, OnChainSyncHandler } from './identity/passport/passportManager';
export { getPassportSyncService, PassportSyncService } from './identity/passport/passportSyncService';
export { getPassportService } from './identity/passport/passportService';

// ─── Chains ─────────────────────────────────────────────────────────────────
export type { IBlockchainAdapter } from './shared/chains/adapter-interface';
export { BlockchainAdapterFactory, blockchainAdapterFactory } from './shared/chains/factory';
export { CHAIN_CONFIGS, getChainConfig, getEVMChains, getSolanaChains } from './shared/chains/configs';
export type {
  ChainConfig, ChainType, ChainHealthStatus, TxReceipt, UnsignedTx,
  AgentRegistration, AgentIdentity,
} from './shared/chains/types';
export type {
  IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter,
  IGasAdapter, IIdentityAdapter, IValidationAdapter,
  ChainCapabilities, EscrowCreateParams, WalletPolicy, GasRecipient,
} from './shared/chains/domain-interfaces';
export { EVMAdapter } from './shared/chains/evm/adapter';
export { SolanaAdapter } from './shared/chains/solana/adapter';

// ─── Finance / Payment ──────────────────────────────────────────────────────
export {
  calculatePayoutSplit, createPayoutFromReceipt, getPayout,
  storePayout, verifyPayoutSplit, executePayoutSplit, getPayoutExecution,
} from './payment/services/payoutService';
export { getPaymentGateService } from './payment/stores/paymentGateService';
export { getEscrowService, EscrowService } from './payment/escrow/escrowService';
export type { EscrowParams, EscrowInfo } from './payment/escrow/escrowTypes';
export { EscrowStatus } from './payment/escrow/escrowTypes';
export { getDisputeService, DisputeService } from './payment/escrow/disputeService';
export type { DisputeInfo, EvidenceSubmission } from './payment/escrow/disputeTypes';
export { DisputeStatus } from './payment/escrow/disputeTypes';

// ─── Deploy ─────────────────────────────────────────────────────────────────
export {
  getDeployer, listDeployerTargets, getAllDeployers,
} from './compute/deploy';
export type {
  IDeployer, DeploymentResult, DeploymentStatus, DeploymentStatusType,
  DeploymentConfig, RuntimeArtifact, LogOptions,
} from './compute/deploy';

// ─── Agent ──────────────────────────────────────────────────────────────────
export { getAgentDeploymentService, AgentDeploymentService } from './compute/agent/agentDeploymentService';
export type { DeployAgentInput, DeployAgentResult } from './compute/agent/agentDeploymentService';
export { processAgentRevenue, triggerAgentAirdrop, getAgentRevenuePool, getAllRevenuePools } from './compute/agent/agentRevenueService';
export type { AgentRevenuePool } from './compute/agent/agentRevenueService';

// ─── A2A Protocol ──────────────────────────────────────────────────────────
export {
  generateAgentCard, validateAgentCard,
  createA2ATask, updateTaskState, addTaskArtifact, createTaskStore,
  discoverAgent, sendTask, getTaskStatus, cancelTask,
} from './compute/agent/a2a';
export type {
  AgentCard, AgentCardSkill,
  A2ATask, A2AMessage, A2APart, A2ATaskState, A2ATaskStore,
  A2AClientOptions,
} from './compute/agent/a2a';

// ─── Marketplace (WIP — moved to _wip/, needs DB persistence) ─────────────
// export {
//   getMarketplaceService, resetMarketplaceService, MarketplaceService,
// } from './compute/agent/marketplace';
// export type {
//   MarketplaceListing, AgentReview, AgentUsageRecord, ListingFilters,
// } from './compute/agent/marketplace';

// ─── Storage ────────────────────────────────────────────────────────────────
export { getPassportStore } from './identity/stores/passportStore';
export { getIdentityStore } from './identity/stores/identityStore';

// ─── Assets ─────────────────────────────────────────────────────────────────
export { getNFTProvider } from './identity/nft';
export { getTokenLauncher } from './identity/shares';

// ─── DePIN Storage ──────────────────────────────────────────────────────────
export { getPermanentStorage, getEvolvingStorage } from './shared/depin';

// ─── Utils ─────────────────────────────────────────────────────────────────
export { withRetry, withTimeout, withRetryAndTimeout } from './utils/retry';
export type { RetryOptions } from './utils/retry';
export { CircuitBreaker, CircuitBreakerOpenError } from './utils/circuitBreaker';
export type { CircuitState, CircuitBreakerOptions } from './utils/circuitBreaker';

// ─── Memory ──────────────────────────────────────────────────────────────────
export * from './memory';
