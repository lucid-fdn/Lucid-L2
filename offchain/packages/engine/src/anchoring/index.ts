// offchain/packages/engine/src/anchoring/index.ts
// Factory singletons + barrel exports for the Anchoring Control Plane

import { getPermanentStorage, getEvolvingStorage } from '../storage/depin';
import { AnchorDispatcher } from './dispatcher';
import { PostgresAnchorRegistry, InMemoryAnchorRegistry } from './registry';
import type { IAnchorRegistry } from './registry';
import { AnchorVerifier } from './verifier';

let dispatcher: AnchorDispatcher | null = null;
let registry: IAnchorRegistry | null = null;
let verifier: AnchorVerifier | null = null;

export function getAnchorRegistry(): IAnchorRegistry {
  if (!registry) {
    const usePostgres = process.env.ANCHOR_REGISTRY_STORE !== 'memory';
    registry = usePostgres
      ? new PostgresAnchorRegistry()
      : new InMemoryAnchorRegistry();
  }
  return registry;
}

export function getAnchorDispatcher(): AnchorDispatcher {
  if (!dispatcher) {
    dispatcher = new AnchorDispatcher(
      getPermanentStorage(),
      getEvolvingStorage(),
      getAnchorRegistry(),
    );
  }
  return dispatcher;
}

export function getAnchorVerifier(): AnchorVerifier {
  if (!verifier) {
    verifier = new AnchorVerifier(
      getPermanentStorage(),
      getEvolvingStorage(),
      getAnchorRegistry(),
    );
  }
  return verifier;
}

export function resetAnchoring(): void {
  dispatcher = null;
  registry = null;
  verifier = null;
}

// Re-exports
export type { ArtifactType, StorageTier, AnchorRecord, AnchorRequest, AnchorResult } from './types';
export { ARTIFACT_TYPES } from './types';
export type { IAnchorRegistry } from './registry';
export { InMemoryAnchorRegistry, PostgresAnchorRegistry } from './registry';
export { AnchorDispatcher } from './dispatcher';
export { AnchorVerifier } from './verifier';
