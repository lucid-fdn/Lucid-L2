// offchain/packages/engine/src/deployment/webhooks/normalizers/index.ts
// getNormalizer factory

import type { IProviderNormalizer } from '../types';
import { RailwayNormalizer } from './railway';
import { AkashNormalizer } from './akash';
import { PhalaNormalizer } from './phala';
import { IoNetNormalizer } from './ionet';
import { NosanaNormalizer } from './nosana';

const normalizers: Record<string, IProviderNormalizer> = {
  railway: new RailwayNormalizer(),
  akash: new AkashNormalizer(),
  phala: new PhalaNormalizer(),
  ionet: new IoNetNormalizer(),
  nosana: new NosanaNormalizer(),
};

/**
 * Get a normalizer for a given provider.
 * Returns null for unknown providers.
 */
export function getNormalizer(provider: string): IProviderNormalizer | null {
  return normalizers[provider] ?? null;
}
