// offchain/src/storage/depin/index.ts
// Factory for DePIN storage providers — singleton pattern matching codebase conventions

import { IDepinStorage } from './IDepinStorage';
import { logger } from '../lib/logger';

export { IDepinStorage, UploadResult, UploadOptions } from './IDepinStorage';

type PermanentProvider = 'arweave' | 'mock';
type EvolvingProvider = 'lighthouse' | 'mock';

let permanentSingleton: IDepinStorage | null = null;
let evolvingSingleton: IDepinStorage | null = null;

/**
 * Get the permanent storage provider (Arweave via Irys by default).
 * Used for: NFT metadata, attestation proofs, epoch roots.
 */
export function getPermanentStorage(): IDepinStorage {
  if (!permanentSingleton) {
    const provider = (process.env.DEPIN_PERMANENT_PROVIDER || 'mock') as PermanentProvider;
    switch (provider) {
      case 'arweave': {
        const { ArweaveStorage } = require('./ArweaveStorage');
        permanentSingleton = new ArweaveStorage();
        break;
      }
      default: {
        const { MockStorage } = require('./MockStorage');
        permanentSingleton = new MockStorage({ subdir: 'permanent' });
        break;
      }
    }
    logger.info(`[DePIN] Permanent storage: ${permanentSingleton!.providerName}`);
  }
  return permanentSingleton!;
}

/**
 * Get the evolving storage provider (Lighthouse/IPFS by default).
 * Used for: agent memory cold lane, trust snapshots, mutable metadata.
 */
export function getEvolvingStorage(): IDepinStorage {
  if (!evolvingSingleton) {
    const provider = (process.env.DEPIN_EVOLVING_PROVIDER || 'mock') as EvolvingProvider;
    switch (provider) {
      case 'lighthouse': {
        const { LighthouseStorage } = require('./LighthouseStorage');
        evolvingSingleton = new LighthouseStorage();
        break;
      }
      default: {
        const { MockStorage } = require('./MockStorage');
        evolvingSingleton = new MockStorage({ subdir: 'evolving' });
        break;
      }
    }
    logger.info(`[DePIN] Evolving storage: ${evolvingSingleton!.providerName}`);
  }
  return evolvingSingleton!;
}

/** Reset singletons (for tests) */
export function resetDepinStorage(): void {
  permanentSingleton = null;
  evolvingSingleton = null;
}
