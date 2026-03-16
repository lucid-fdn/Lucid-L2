// offchain/src/utils/index.ts
// Barrel re-export of the most commonly imported utility symbols.
// Points directly to canonical package paths (proxies removed).

export { validateWithSchema, loadSchema } from '../../packages/engine/src/shared/crypto/schemaValidator';
export type { SchemaId, ValidationResult } from '../../packages/engine/src/shared/crypto/schemaValidator';

export { signMessage, verifySignature, getOrchestratorPublicKey } from '../../packages/engine/src/shared/crypto/signing';

export { canonicalSha256Hex } from '../../packages/engine/src/shared/crypto/hash';

export { API_PORT, LUCID_MINT } from '../../packages/engine/src/shared/config/config';
