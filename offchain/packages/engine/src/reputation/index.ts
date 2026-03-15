// offchain/packages/engine/src/reputation/index.ts
// Factory for reputation providers + syncers — singleton pattern matching codebase conventions

import { IReputationProvider } from './IReputationProvider';
import { IReputationSyncer } from './IReputationSyncer';
import { logger } from '../shared/lib/logger';

export { IReputationProvider } from './IReputationProvider';
export { IReputationSyncer, ExternalFeedback, ExternalSummary } from './IReputationSyncer';
export * from './types';

let _provider: IReputationProvider | null = null;
let _syncers: IReputationSyncer[] | null = null;

/**
 * Get the primary reputation provider.
 * env: REPUTATION_PROVIDER = 'db' | 'onchain'
 */
export function getReputationProvider(): IReputationProvider {
  if (_provider) return _provider;

  const providerType = process.env.REPUTATION_PROVIDER || 'db';
  switch (providerType) {
    case 'onchain':
      throw new Error(
        'On-chain provider requires explicit init via setReputationProvider()',
      );
    case 'db':
    default: {
      const { LucidDBProvider } = require('./providers/LucidDBProvider');
      _provider = new LucidDBProvider();
      break;
    }
  }
  logger.info(`[Reputation] Provider: ${_provider!.providerName}`);
  return _provider!;
}

/**
 * Explicitly set the reputation provider (required for on-chain provider
 * which needs program + wallet constructor args).
 */
export function setReputationProvider(provider: IReputationProvider): void {
  _provider = provider;
}

/**
 * Get all configured reputation syncers.
 * env: REPUTATION_SYNCERS = comma-separated list (e.g., '8004,sati,said,evm')
 */
export function getReputationSyncers(): IReputationSyncer[] {
  if (_syncers) return _syncers;

  const syncerNames = (process.env.REPUTATION_SYNCERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  _syncers = [];

  for (const name of syncerNames) {
    switch (name) {
      case '8004': {
        try {
          const { SolanaSDK } = require('8004-solana');
          const { Solana8004Syncer } = require('./syncers/Solana8004Syncer');
          _syncers.push(new Solana8004Syncer(new SolanaSDK()));
        } catch {
          logger.warn('[Reputation] 8004-solana SDK not available, skipping syncer');
        }
        break;
      }
      case 'sati': {
        const { SATISyncer } = require('./syncers/SATISyncer');
        _syncers.push(new SATISyncer());
        break;
      }
      case 'said': {
        const { SAIDSyncer } = require('./syncers/SAIDSyncer');
        _syncers.push(new SAIDSyncer());
        break;
      }
      case 'evm': {
        const { EVM8004Syncer } = require('./syncers/EVM8004Syncer');
        _syncers.push(new EVM8004Syncer());
        break;
      }
      default:
        logger.warn(`[Reputation] Unknown syncer: ${name}`);
    }
  }

  logger.info(
    `[Reputation] Syncers: ${_syncers.length === 0 ? 'none' : _syncers.map((s) => s.syncerName).join(', ')}`,
  );
  return _syncers;
}

/** Reset singletons (for tests) */
export function resetReputationFactory(): void {
  _provider = null;
  _syncers = null;
}
