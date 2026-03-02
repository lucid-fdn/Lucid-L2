// @lucid-l2/engine — truth library (no HTTP)

// Crypto
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

// Config
export * from './config/config';
export * from './config/paths';
