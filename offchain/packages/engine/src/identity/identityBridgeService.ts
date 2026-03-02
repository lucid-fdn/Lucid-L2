/**
 * Cross-Chain Identity Bridge Service
 *
 * Links identities across chains using CAIP-10 addressing.
 * Enables Lucid to serve as its own cross-chain identity bridge
 * without external dependencies like SATI.
 */

import { getIdentityStore, type IdentityLink } from '../storage/identityStore';
import { validateCaip10, fromCaip10, isSolanaCaip10, isEvmCaip10 } from './caip10';

export interface LinkedIdentity {
  caip10: string;
  namespace: string;
  reference: string;
  address: string;
}

export interface IdentityResolution {
  primaryCaip10: string;
  linkedIdentities: LinkedIdentity[];
  chainCount: number;
  linkCount: number;
}

export class IdentityBridgeService {
  private static instance: IdentityBridgeService | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): IdentityBridgeService {
    if (!IdentityBridgeService.instance) {
      IdentityBridgeService.instance = new IdentityBridgeService();
    }
    return IdentityBridgeService.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const store = getIdentityStore();
    await store.init();
    this.initialized = true;
  }

  /**
   * Link two CAIP-10 identities together.
   * Creates a bidirectional mapping.
   */
  async linkIdentity(
    primaryCaip10: string,
    linkedCaip10: string,
    proof?: string,
  ): Promise<IdentityLink> {
    if (!validateCaip10(primaryCaip10)) {
      throw new Error(`Invalid CAIP-10 format: ${primaryCaip10}`);
    }
    if (!validateCaip10(linkedCaip10)) {
      throw new Error(`Invalid CAIP-10 format: ${linkedCaip10}`);
    }
    if (primaryCaip10 === linkedCaip10) {
      throw new Error('Cannot link an identity to itself');
    }

    const store = getIdentityStore();
    return store.createLink(primaryCaip10, linkedCaip10, proof);
  }

  /**
   * Resolve all linked identities for a CAIP-10 address.
   * Returns the full identity graph including transitive links.
   */
  resolveIdentity(caip10: string): IdentityResolution {
    if (!validateCaip10(caip10)) {
      throw new Error(`Invalid CAIP-10 format: ${caip10}`);
    }

    const store = getIdentityStore();
    const linkedAddresses = store.resolveAllLinked(caip10);

    const linkedIdentities: LinkedIdentity[] = linkedAddresses.map(addr => {
      const parsed = fromCaip10(addr);
      return {
        caip10: addr,
        namespace: parsed.namespace,
        reference: parsed.reference,
        address: parsed.address,
      };
    });

    const chains = store.getLinkedChains(caip10);

    return {
      primaryCaip10: caip10,
      linkedIdentities,
      chainCount: chains.length,
      linkCount: linkedIdentities.length,
    };
  }

  /**
   * Get all chains an identity is linked to.
   */
  getLinkedChains(caip10: string): string[] {
    if (!validateCaip10(caip10)) {
      throw new Error(`Invalid CAIP-10 format: ${caip10}`);
    }

    const store = getIdentityStore();
    return store.getLinkedChains(caip10);
  }

  /**
   * Remove a specific identity link.
   */
  async unlinkIdentity(primaryCaip10: string, linkedCaip10: string): Promise<boolean> {
    const store = getIdentityStore();
    return store.deleteLink(primaryCaip10, linkedCaip10);
  }

  /**
   * Check if two CAIP-10 addresses are linked (directly or transitively).
   */
  areLinked(caip10A: string, caip10B: string): boolean {
    const store = getIdentityStore();
    const allLinked = store.resolveAllLinked(caip10A);
    return allLinked.includes(caip10B);
  }

  /**
   * Reset for testing.
   */
  static reset(): void {
    IdentityBridgeService.instance = null;
  }
}

export function getIdentityBridgeService(): IdentityBridgeService {
  return IdentityBridgeService.getInstance();
}
