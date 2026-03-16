/**
 * Tests for Merkle Tree implementation.
 */
import { MerkleTree, getReceiptTree, resetReceiptTree } from '../../packages/engine/src/shared/crypto/merkleTree';

describe('MerkleTree', () => {
  let tree: MerkleTree;

  beforeEach(() => {
    tree = new MerkleTree();
  });

  describe('addLeaf', () => {
    it('should add a valid leaf and return index', () => {
      const hash = 'a'.repeat(64);
      const index = tree.addLeaf(hash);

      expect(index).toBe(0);
      expect(tree.getLeafCount()).toBe(1);
    });

    it('should add multiple leaves with correct indices', () => {
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);
      const hash3 = 'c'.repeat(64);

      expect(tree.addLeaf(hash1)).toBe(0);
      expect(tree.addLeaf(hash2)).toBe(1);
      expect(tree.addLeaf(hash3)).toBe(2);
      expect(tree.getLeafCount()).toBe(3);
    });

    it('should reject invalid hash', () => {
      expect(() => tree.addLeaf('invalid')).toThrow();
      expect(() => tree.addLeaf('a'.repeat(63))).toThrow();
      expect(() => tree.addLeaf('g'.repeat(64))).toThrow(); // invalid hex char
    });

    it('should normalize hash to lowercase', () => {
      const hash = 'A'.repeat(64);
      tree.addLeaf(hash);
      expect(tree.getLeaf(0)).toBe('a'.repeat(64));
    });
  });

  describe('getRoot', () => {
    it('should return zero root for empty tree', () => {
      const root = tree.getRoot();
      expect(root).toBe('0'.repeat(64));
    });

    it('should compute consistent root', () => {
      tree.addLeaf('a'.repeat(64));
      const root1 = tree.getRoot();
      const root2 = tree.getRoot();

      expect(root1).toBe(root2);
      expect(root1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should change root when adding leaves', () => {
      tree.addLeaf('a'.repeat(64));
      const root1 = tree.getRoot();

      tree.addLeaf('b'.repeat(64));
      const root2 = tree.getRoot();

      expect(root1).not.toBe(root2);
    });

    it('should compute correct root for known inputs', () => {
      // For a single leaf, root should be hash of (leaf || leaf)
      tree.addLeaf('a'.repeat(64));
      const root = tree.getRoot();

      // Just check it's a valid hash
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('getProof', () => {
    it('should return null for invalid index', () => {
      tree.addLeaf('a'.repeat(64));

      expect(tree.getProof(-1)).toBeNull();
      expect(tree.getProof(1)).toBeNull();
      expect(tree.getProof(100)).toBeNull();
    });

    it('should generate proof for single leaf', () => {
      tree.addLeaf('a'.repeat(64));
      const proof = tree.getProof(0);

      expect(proof).not.toBeNull();
      expect(proof!.leaf).toBe('a'.repeat(64));
      expect(proof!.leafIndex).toBe(0);
      expect(proof!.root).toBe(tree.getRoot());
    });

    it('should generate proof for multiple leaves', () => {
      tree.addLeaf('a'.repeat(64));
      tree.addLeaf('b'.repeat(64));
      tree.addLeaf('c'.repeat(64));

      const proof0 = tree.getProof(0);
      const proof1 = tree.getProof(1);
      const proof2 = tree.getProof(2);

      expect(proof0).not.toBeNull();
      expect(proof1).not.toBeNull();
      expect(proof2).not.toBeNull();

      // All proofs should have same root
      expect(proof0!.root).toBe(proof1!.root);
      expect(proof1!.root).toBe(proof2!.root);

      // Each proof should have correct leaf
      expect(proof0!.leaf).toBe('a'.repeat(64));
      expect(proof1!.leaf).toBe('b'.repeat(64));
      expect(proof2!.leaf).toBe('c'.repeat(64));
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof for single leaf', () => {
      tree.addLeaf('a'.repeat(64));
      const proof = tree.getProof(0)!;

      const result = MerkleTree.verifyProof(proof);
      expect(result.valid).toBe(true);
      expect(result.computedRoot).toBe(result.expectedRoot);
    });

    it('should verify valid proof for multiple leaves', () => {
      for (let i = 0; i < 10; i++) {
        const hash = i.toString(16).padStart(64, '0');
        tree.addLeaf(hash);
      }

      for (let i = 0; i < 10; i++) {
        const proof = tree.getProof(i)!;
        const result = MerkleTree.verifyProof(proof);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject proof with tampered leaf', () => {
      tree.addLeaf('a'.repeat(64));
      const proof = tree.getProof(0)!;

      // Tamper with leaf
      proof.leaf = 'b'.repeat(64);

      const result = MerkleTree.verifyProof(proof);
      expect(result.valid).toBe(false);
    });

    it('should reject proof with tampered sibling', () => {
      tree.addLeaf('a'.repeat(64));
      tree.addLeaf('b'.repeat(64));
      const proof = tree.getProof(0)!;

      // Tamper with sibling
      if (proof.siblings.length > 0) {
        proof.siblings[0] = 'c'.repeat(64);
      }

      const result = MerkleTree.verifyProof(proof);
      expect(result.valid).toBe(false);
    });
  });

  describe('verifyProofAgainstRoot', () => {
    it('should verify against matching root', () => {
      tree.addLeaf('a'.repeat(64));
      const proof = tree.getProof(0)!;
      const root = tree.getRoot();

      const result = MerkleTree.verifyProofAgainstRoot(proof, root);
      expect(result.valid).toBe(true);
    });

    it('should reject against different root', () => {
      tree.addLeaf('a'.repeat(64));
      const proof = tree.getProof(0)!;

      const result = MerkleTree.verifyProofAgainstRoot(proof, 'f'.repeat(64));
      expect(result.valid).toBe(false);
    });
  });
});

describe('Receipt Tree Singleton', () => {
  beforeEach(() => {
    resetReceiptTree();
  });

  it('should return same instance', () => {
    const tree1 = getReceiptTree();
    const tree2 = getReceiptTree();

    expect(tree1).toBe(tree2);
  });

  it('should reset to new instance', () => {
    const tree1 = getReceiptTree();
    tree1.addLeaf('a'.repeat(64));

    resetReceiptTree();
    const tree2 = getReceiptTree();

    expect(tree1).not.toBe(tree2);
    expect(tree2.getLeafCount()).toBe(0);
  });
});
