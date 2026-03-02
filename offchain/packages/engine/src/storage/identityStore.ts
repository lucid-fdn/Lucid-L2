/**
 * Identity Store
 *
 * File-backed store for cross-chain identity links.
 * Follows the PassportStore pattern: in-memory cache with file persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PATHS } from '../config/paths';

export interface IdentityLink {
  linkId: string;
  primaryCaip10: string;
  linkedCaip10: string;
  proof?: string;
  createdAt: number;
}

interface StorageFile {
  version: string;
  lastUpdated: number;
  links: Record<string, IdentityLink>;
}

const STORAGE_VERSION = '1.0';

export class IdentityStore {
  private dataDir: string;
  private storageFile: string;
  private links: Map<string, IdentityLink>;
  /** caip10 -> Set<linkId> */
  private caip10Index: Map<string, Set<string>>;
  private isDirty = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(dataDir?: string, autoSaveDelay: number = 5000) {
    this.dataDir = dataDir || path.join(PATHS.DATA_DIR, 'identity');
    this.storageFile = path.join(this.dataDir, 'identity-links.json');
    this.links = new Map();
    this.caip10Index = new Map();

    if (autoSaveDelay > 0) {
      this.autoSaveInterval = setInterval(() => {
        if (this.isDirty) this.persist().catch(console.error);
      }, autoSaveDelay);
    }
  }

  async init(): Promise<void> {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (fs.existsSync(this.storageFile)) {
      try {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const storage: StorageFile = JSON.parse(data);
        for (const [id, link] of Object.entries(storage.links)) {
          this.links.set(id, link);
          this.addToIndex(link);
        }
      } catch {
        // Start with empty store
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.isDirty) await this.persist();
  }

  async persist(): Promise<void> {
    const storage: StorageFile = {
      version: STORAGE_VERSION,
      lastUpdated: Date.now(),
      links: Object.fromEntries(this.links),
    };
    const tempFile = this.storageFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(storage, null, 2));
    fs.renameSync(tempFile, this.storageFile);
    this.isDirty = false;
  }

  private addToIndex(link: IdentityLink): void {
    for (const caip10 of [link.primaryCaip10, link.linkedCaip10]) {
      if (!this.caip10Index.has(caip10)) {
        this.caip10Index.set(caip10, new Set());
      }
      this.caip10Index.get(caip10)!.add(link.linkId);
    }
  }

  private removeFromIndex(link: IdentityLink): void {
    for (const caip10 of [link.primaryCaip10, link.linkedCaip10]) {
      this.caip10Index.get(caip10)?.delete(link.linkId);
    }
  }

  /**
   * Create a bidirectional identity link between two CAIP-10 addresses.
   */
  async createLink(primaryCaip10: string, linkedCaip10: string, proof?: string): Promise<IdentityLink> {
    // Check for duplicate
    const existingLinks = this.getLinksForCaip10(primaryCaip10);
    for (const link of existingLinks) {
      if (link.linkedCaip10 === linkedCaip10 || link.primaryCaip10 === linkedCaip10) {
        return link; // Already linked
      }
    }

    const link: IdentityLink = {
      linkId: `link_${uuidv4().replace(/-/g, '')}`,
      primaryCaip10,
      linkedCaip10,
      proof,
      createdAt: Date.now(),
    };

    this.links.set(link.linkId, link);
    this.addToIndex(link);
    this.isDirty = true;

    return link;
  }

  /**
   * Get all identity links involving a CAIP-10 address.
   */
  getLinksForCaip10(caip10: string): IdentityLink[] {
    const linkIds = this.caip10Index.get(caip10);
    if (!linkIds) return [];

    const results: IdentityLink[] = [];
    for (const id of linkIds) {
      const link = this.links.get(id);
      if (link) results.push(link);
    }
    return results;
  }

  /**
   * Resolve all linked CAIP-10 addresses for a given address.
   * Traverses the full link graph (transitive resolution).
   */
  resolveAllLinked(caip10: string): string[] {
    const visited = new Set<string>();
    const queue = [caip10];

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const links = this.getLinksForCaip10(current);
      for (const link of links) {
        if (!visited.has(link.primaryCaip10)) queue.push(link.primaryCaip10);
        if (!visited.has(link.linkedCaip10)) queue.push(link.linkedCaip10);
      }
    }

    // Remove the original address from results
    visited.delete(caip10);
    return Array.from(visited);
  }

  /**
   * Delete a specific identity link.
   */
  async deleteLink(primaryCaip10: string, linkedCaip10: string): Promise<boolean> {
    const links = this.getLinksForCaip10(primaryCaip10);
    for (const link of links) {
      if (
        (link.primaryCaip10 === primaryCaip10 && link.linkedCaip10 === linkedCaip10) ||
        (link.primaryCaip10 === linkedCaip10 && link.linkedCaip10 === primaryCaip10)
      ) {
        this.removeFromIndex(link);
        this.links.delete(link.linkId);
        this.isDirty = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Get unique chain namespaces from all linked addresses.
   */
  getLinkedChains(caip10: string): string[] {
    const allLinked = [caip10, ...this.resolveAllLinked(caip10)];
    const chains = new Set<string>();
    for (const addr of allLinked) {
      const parts = addr.split(':');
      if (parts.length >= 2) {
        chains.add(`${parts[0]}:${parts[1]}`);
      }
    }
    return Array.from(chains);
  }

  /** Link count */
  count(): number {
    return this.links.size;
  }
}

// Singleton
let storeInstance: IdentityStore | null = null;

export function getIdentityStore(dataDir?: string): IdentityStore {
  if (!storeInstance) {
    storeInstance = new IdentityStore(dataDir);
  }
  return storeInstance;
}

export function resetIdentityStore(): void {
  if (storeInstance) {
    storeInstance.shutdown().catch(console.error);
    storeInstance = null;
  }
}
