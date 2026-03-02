// PROXY — real implementation moved to @lucid-l2/engine
export {
  getOrchestratorKeypair,
  signMessage,
  verifySignature,
  getOrchestratorPublicKey,
  resetKeypair,
  generateKeypair,
  exportKeypairToHex,
} from '../../packages/engine/src/crypto/signing';
export type { SigningKeypair, SignatureResult } from '../../packages/engine/src/crypto/signing';
