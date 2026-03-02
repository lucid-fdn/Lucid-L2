// Blockchain adapter abstraction layer
export type { IBlockchainAdapter } from './adapter-interface';
export { BlockchainAdapterFactory, blockchainAdapterFactory } from './factory';
export { CHAIN_CONFIGS, getChainConfig, getEVMChains, getSolanaChains } from './configs';
export * from './types';

// Chain-specific adapters
export { EVMAdapter } from './evm/adapter';
export { SolanaAdapter } from './solana/adapter';
export { SolanaPassportClient } from '../passport/nft/solana-token2022'; // re-export for backward compat

// Solana utilities
export { initSolana, getConnection, getKeypair, deriveEpochPDA, deriveEpochBatchPDA, createCommitInstruction, resetSolanaCache } from './solana/client';
export { makeComputeIx, makeBurnIx, calculateGasCost } from './solana/gas';
export { getSolanaKeypair } from './solana/keypair';
