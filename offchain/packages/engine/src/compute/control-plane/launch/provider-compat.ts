// packages/engine/src/compute/control-plane/launch/provider-compat.ts
// Provider compatibility matrix — enforces valid path+target combos.

import type { SourceType } from './launch-spec';

/**
 * Compatibility value per (target, sourceType):
 *   true      = supported (source type requires Dockerfile)
 *   'nixpacks' = can build from source without Dockerfile (future)
 *   false     = not supported
 */
const COMPAT: Record<string, Record<SourceType, boolean | 'nixpacks'>> = {
  docker:  { image: true, source: true, catalog: true, runtime: true, external: true },
  railway: { image: true, source: 'nixpacks', catalog: true, runtime: true, external: true },
  akash:   { image: true, source: true, catalog: true, runtime: true, external: true },
  phala:   { image: true, source: true, catalog: true, runtime: true, external: true },
  ionet:   { image: true, source: true, catalog: true, runtime: true, external: true },
  nosana:  { image: true, source: true, catalog: true, runtime: true, external: true },
};

export type ProviderCompatResult = { ok: true } | { ok: false; error: string };

/**
 * Check whether a given target provider supports the requested source type.
 *
 * For source deployments:
 *   - If the provider entry is `true`, a Dockerfile is required.
 *   - If the provider entry is `'nixpacks'`, Nixpacks could handle it but is
 *     gated behind a future release for now.
 */
export function checkProviderCompat(
  target: string,
  sourceType: SourceType,
  hasDockerfile: boolean,
): ProviderCompatResult {
  const provider = COMPAT[target];
  if (!provider) {
    return { ok: false, error: `Unknown target: ${target}` };
  }

  const support = provider[sourceType];
  if (!support) {
    return { ok: false, error: `${target} does not support ${sourceType} deployments` };
  }

  // For source deployments without a Dockerfile:
  if (sourceType === 'source' && !hasDockerfile) {
    if (support === 'nixpacks') {
      // Railway can do Nixpacks, but we haven't shipped it yet
      return {
        ok: false,
        error: 'Add a Dockerfile to your project. Nixpacks source deploy coming in a future release.',
      };
    }
    // All other providers that require Dockerfile
    return {
      ok: false,
      error: `${target} requires a Dockerfile for source deployments. Add a Dockerfile to your project.`,
    };
  }

  return { ok: true };
}
