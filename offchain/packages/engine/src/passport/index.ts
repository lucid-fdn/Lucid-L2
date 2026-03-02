export { getPassportManager, resetPassportManager, PassportManager } from './passportManager';
export type { CreatePassportInput, OperationResult, OnChainSyncHandler } from './passportManager';
// matchingEngine and modelCatalog stay in gateway-lite (serving layer) — use long path
export { hasAvailableCompute, matchComputeForModel } from '../../../../src/services/passport/matchingEngine';
export type { MatchResult } from '../../../../src/services/passport/matchingEngine';
export { MODEL_CATALOG } from '../../../../src/services/passport/modelCatalog';
export { getPassportSyncService, PassportSyncService } from './passportSyncService';
export { getPassportService } from './passportService';

// Passport NFT minting
export { SolanaPassportClient } from './nft/solana-token2022';
