export {
  createEpoch,
  getAllEpochs,
  getEpoch,
  finalizeEpoch,
  getCurrentEpoch,
  addReceiptToEpoch,
  resetEpochStore,
  prepareEpochForFinalization,
  failEpoch,
  setAnchoringConfig,
  setAuthorityKeypair,
  commitEpochRoot,
  commitEpochRootsBatch,
} from '@lucid-l2/engine';

export type {
  Epoch,
  EpochStatus,
  AnchoringConfig,
  AnchorResult,
} from '@lucid-l2/engine';
