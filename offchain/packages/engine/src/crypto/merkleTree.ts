/**
 * Simple Merkle Tree implementation for receipt inclusion proofs.
 * 
 * This replaces the stub MMR with a proper binary Merkle tree that supports:
 * - Adding leaves (receipt hashes)
 * - Computing the root
 * - Generating inclusion proofs
 * - Verifying inclusion proofs
 */
import { sha256Hex } from './hash';

export interface MerkleProof {
  leaf: string;           // The leaf hash being proven
  leafIndex: number;      // Index of the leaf in the tree
  siblings: string[];     // Sibling hashes along the path
  directions: ('L' | 'R')[];  // Direction of each sibling (L = sibling is on left, R = on right)
  root: string;           // The root hash at time of proof generation
}

export interface MerkleVerifyResult {
  valid: boolean;
  computedRoot: string;
  expectedRoot: string;
}

/**
 * Compute the parent hash from two children.
 * Always concatenates in sorted order for consistency.
 */
function hashPair(left: string, right: string): string {
  // Concatenate as hex strings in order, then hash
  return sha256Hex(Buffer.from(left + right, 'hex'));
}

/**
 * Merkle Tree class for managing receipt hashes.
 */
export class MerkleTree {
  private leaves: string[] = [];
  private layers: string[][] = [];
  private dirty = true;

  /**
   * Add a leaf (receipt hash) to the tree.
   */
  addLeaf(hash: string): number {
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error('Invalid leaf hash: must be 64 hex characters');
    }
    const index = this.leaves.length;
    this.leaves.push(hash.toLowerCase());
    this.dirty = true;
    return index;
  }

  /**
   * Get the number of leaves in the tree.
   */
  getLeafCount(): number {
    return this.leaves.length;
  }

  /**
   * Get a leaf by index.
   */
  getLeaf(index: number): string | null {
    return this.leaves[index] ?? null;
  }

  /**
   * Build the Merkle tree layers.
   */
  private build(): void {
    if (!this.dirty) return;
    
    if (this.leaves.length === 0) {
      this.layers = [['0'.repeat(64)]];
      this.dirty = false;
      return;
    }

    // Start with leaves
    this.layers = [this.leaves.slice()];
    
    // Build each layer until we reach the root
    let currentLayer = this.layers[0];
    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        // If odd number of elements, duplicate the last one
        const right = currentLayer[i + 1] ?? currentLayer[i];
        nextLayer.push(hashPair(left, right));
      }
      
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
    
    this.dirty = false;
  }

  /**
   * Get the root hash.
   */
  getRoot(): string {
    this.build();
    const topLayer = this.layers[this.layers.length - 1];
    return topLayer[0];
  }

  /**
   * Generate an inclusion proof for a leaf at the given index.
   */
  getProof(leafIndex: number): MerkleProof | null {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      return null;
    }

    this.build();

    const leaf = this.leaves[leafIndex];
    const siblings: string[] = [];
    const directions: ('L' | 'R')[] = [];

    let index = leafIndex;
    
    // Walk up the tree
    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const isLeft = index % 2 === 0;
      const siblingIndex = isLeft ? index + 1 : index - 1;
      
      // Get sibling (or self if at end of odd-length layer)
      const sibling = layer[siblingIndex] ?? layer[index];
      siblings.push(sibling);
      directions.push(isLeft ? 'R' : 'L');
      
      // Move to parent index in next layer
      index = Math.floor(index / 2);
    }

    return {
      leaf,
      leafIndex,
      siblings,
      directions,
      root: this.getRoot(),
    };
  }

  /**
   * Verify an inclusion proof.
   */
  static verifyProof(proof: MerkleProof): MerkleVerifyResult {
    let computed = proof.leaf;
    
    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const direction = proof.directions[i];
      
      if (direction === 'L') {
        // Sibling is on left
        computed = hashPair(sibling, computed);
      } else {
        // Sibling is on right
        computed = hashPair(computed, sibling);
      }
    }

    return {
      valid: computed === proof.root,
      computedRoot: computed,
      expectedRoot: proof.root,
    };
  }

  /**
   * Verify a proof against a specific root (e.g., anchored on-chain).
   */
  static verifyProofAgainstRoot(proof: MerkleProof, expectedRoot: string): MerkleVerifyResult {
    const result = MerkleTree.verifyProof(proof);
    return {
      valid: result.computedRoot === expectedRoot.toLowerCase(),
      computedRoot: result.computedRoot,
      expectedRoot: expectedRoot.toLowerCase(),
    };
  }

  /**
   * Get all layers (for debugging/inspection).
   */
  getLayers(): string[][] {
    this.build();
    return this.layers.map(layer => [...layer]);
  }

  /**
   * Reset the tree (for testing).
   */
  reset(): void {
    this.leaves = [];
    this.layers = [];
    this.dirty = true;
  }
}

// Singleton instance for the receipt tree
let receiptTree: MerkleTree | null = null;

export function getReceiptTree(): MerkleTree {
  if (!receiptTree) {
    receiptTree = new MerkleTree();
  }
  return receiptTree;
}

export function resetReceiptTree(): void {
  receiptTree = null;
}
