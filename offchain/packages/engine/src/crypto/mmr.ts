import { createHash } from 'crypto';

/**
 * Merkle Mountain Range (MMR) Implementation for Lucid L2
 * 
 * Features:
 * - One MMR per agent/entity
 * - Per-epoch append with new root generation
 * - Immutable timeline of roots
 * - Proof-of-contribution support
 */

export interface MMRNode {
  hash: Buffer;
  position: number;
  height: number;
}

export interface MMRProof {
  leafIndex: number;
  leafHash: Buffer;
  siblings: Buffer[];
  peaks: Buffer[];
  mmrSize: number;
}

export interface MMRState {
  size: number;
  peaks: Buffer[];
  nodes: Map<number, Buffer>;
}

export class MMR {
  private nodes: Map<number, Buffer> = new Map();
  private size: number = 0;

  constructor(initialState?: MMRState) {
    if (initialState) {
      this.size = initialState.size;
      this.nodes = new Map(initialState.nodes);
    }
  }

  /**
   * Hash function for MMR nodes
   */
  private hash(left: Buffer, right?: Buffer): Buffer {
    if (!right) {
      return createHash('sha256').update(left).digest();
    }
    return createHash('sha256').update(Buffer.concat([left, right])).digest();
  }

  /**
   * Get the height of a position in the MMR
   */
  private getHeight(position: number): number {
    let height = 0;
    let pos = position;
    
    while (pos > 0) {
      if (pos % 2 === 0) {
        break;
      }
      pos = (pos - 1) / 2;
      height++;
    }
    
    return height;
  }

  /**
   * Get the position of the left child
   */
  private getLeftChild(position: number): number {
    const height = this.getHeight(position);
    return position - (1 << height);
  }

  /**
   * Get the position of the right child
   */
  private getRightChild(position: number): number {
    const height = this.getHeight(position);
    return position - 1;
  }

  /**
   * Check if a position is a leaf
   */
  public isLeaf(position: number): boolean {
    return this.getHeight(position) === 0;
  }

  /**
   * Get all peak positions for the current MMR size
   */
  private getPeaks(): number[] {
    const peaks: number[] = [];
    let size = this.size;
    let position = 0;

    while (size > 0) {
      // Find the highest peak that fits in the remaining size
      let peakSize = 1;
      while (peakSize * 2 - 1 <= size) {
        peakSize *= 2;
      }
      peakSize = peakSize - 1;

      peaks.push(position + peakSize - 1);
      position += peakSize;
      size -= peakSize;
    }

    return peaks;
  }

  /**
   * Append a new leaf to the MMR
   */
  append(leafHash: Buffer): Buffer {
    const leafPosition = this.size;
    this.nodes.set(leafPosition, leafHash);
    this.size++;

    // Merge nodes to maintain MMR structure
    let currentPos = leafPosition;
    let currentHash = leafHash;

    while (true) {
      const height = this.getHeight(currentPos);
      const siblingPos = currentPos - (1 << (height + 1)) + 1;

      // Check if we can merge with a sibling
      if (siblingPos >= 0 && this.nodes.has(siblingPos) && this.getHeight(siblingPos) === height) {
        const siblingHash = this.nodes.get(siblingPos)!;
        const parentPos = currentPos + (1 << height);
        const parentHash = this.hash(siblingHash, currentHash);
        
        this.nodes.set(parentPos, parentHash);
        currentPos = parentPos;
        currentHash = parentHash;
      } else {
        break;
      }
    }

    return this.getRoot();
  }

  /**
   * Batch append multiple leaves and return the new root
   */
  batchAppend(leafHashes: Buffer[]): Buffer {
    for (const leafHash of leafHashes) {
      this.append(leafHash);
    }
    return this.getRoot();
  }

  /**
   * Get the current MMR root
   */
  getRoot(): Buffer {
    const peaks = this.getPeaks();
    
    if (peaks.length === 0) {
      return Buffer.alloc(32); // Empty MMR
    }

    if (peaks.length === 1) {
      return this.nodes.get(peaks[0])!;
    }

    // Bag the peaks (hash them together from right to left)
    let root = this.nodes.get(peaks[peaks.length - 1])!;
    for (let i = peaks.length - 2; i >= 0; i--) {
      const peakHash = this.nodes.get(peaks[i])!;
      root = this.hash(peakHash, root);
    }

    return root;
  }

  /**
   * Generate a proof for a leaf at the given index
   */
  generateProof(leafIndex: number): MMRProof | null {
    if (leafIndex >= this.size || !this.nodes.has(leafIndex)) {
      return null;
    }

    const leafHash = this.nodes.get(leafIndex)!;
    const siblings: Buffer[] = [];
    const peaks = this.getPeaks();

    // Collect siblings along the path to the peak
    let currentPos = leafIndex;
    while (true) {
      const height = this.getHeight(currentPos);
      const siblingPos = currentPos - (1 << (height + 1)) + 1;

      if (siblingPos >= 0 && this.nodes.has(siblingPos) && this.getHeight(siblingPos) === height) {
        siblings.push(this.nodes.get(siblingPos)!);
        currentPos = currentPos + (1 << height);
      } else {
        break;
      }
    }

    // Collect peak hashes
    const peakHashes: Buffer[] = [];
    for (const peakPos of peaks) {
      peakHashes.push(this.nodes.get(peakPos)!);
    }

    return {
      leafIndex,
      leafHash,
      siblings,
      peaks: peakHashes,
      mmrSize: this.size
    };
  }

  /**
   * Calculate height of a position in the MMR (static utility).
   */
  static positionHeight(position: number): number {
    let height = 0;
    let pos = position;
    while (pos > 0) {
      if (pos % 2 === 0) break;
      pos = (pos - 1) / 2;
      height++;
    }
    return height;
  }

  /**
   * Verify a proof against a given root.
   *
   * 1. Climb siblings from leaf to peak → reconstructedPeak
   * 2. Verify reconstructedPeak matches exactly one entry in proof.peaks
   * 3. Bag all peaks right-to-left and check against root
   */
  static verifyProof(proof: MMRProof, root: Buffer): boolean {
    if (proof.peaks.length === 0) return false;

    let currentHash = proof.leafHash;
    let currentPos = proof.leafIndex;

    // Reconstruct the path from leaf to its peak
    for (const sibling of proof.siblings) {
      const height = MMR.positionHeight(currentPos);
      const siblingPos = currentPos - (1 << (height + 1)) + 1;

      if (siblingPos < currentPos) {
        currentHash = createHash('sha256').update(Buffer.concat([sibling, currentHash])).digest();
      } else {
        currentHash = createHash('sha256').update(Buffer.concat([currentHash, sibling])).digest();
      }

      currentPos = currentPos + (1 << height);
    }

    // currentHash should now equal exactly one peak
    const matchesPeak = proof.peaks.some(p => p.equals(currentHash));
    if (!matchesPeak) return false;

    // Single peak: root IS the peak
    if (proof.peaks.length === 1) {
      return currentHash.equals(root);
    }

    // Multi-peak: bag right-to-left and verify against root
    let baggedRoot = proof.peaks[proof.peaks.length - 1];
    for (let i = proof.peaks.length - 2; i >= 0; i--) {
      baggedRoot = createHash('sha256').update(Buffer.concat([proof.peaks[i], baggedRoot])).digest();
    }

    return baggedRoot.equals(root);
  }

  /**
   * Get the current state for serialization
   */
  getState(): MMRState {
    return {
      size: this.size,
      peaks: this.getPeaks().map(pos => this.nodes.get(pos)!),
      nodes: new Map(this.nodes)
    };
  }

  /**
   * Get the size of the MMR
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Check if the MMR contains a specific leaf hash
   */
  contains(leafHash: Buffer): boolean {
    for (let i = 0; i < this.size; i++) {
      if (this.isLeaf(i) && this.nodes.has(i)) {
        const nodeHash = this.nodes.get(i)!;
        if (nodeHash.equals(leafHash)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get node hash at a specific position (public accessor)
   */
  public getNodeHash(position: number): Buffer | null {
    return this.nodes.get(position) || null;
  }

  /**
   * Check if a node exists at a specific position
   */
  public hasNode(position: number): boolean {
    return this.nodes.has(position);
  }
}

/**
 * Agent-specific MMR manager
 */
export class AgentMMR {
  private mmr: MMR;
  private agentId: string;
  private rootHistory: { epoch: number; root: Buffer; timestamp: number }[] = [];

  constructor(agentId: string, initialState?: MMRState) {
    this.agentId = agentId;
    this.mmr = new MMR(initialState);
  }

  /**
   * Process vectors for a new epoch
   */
  processEpoch(vectors: Buffer[], epochNumber: number): Buffer {
    // Store each vector as a separate leaf in the MMR
    // This allows for individual vector proof generation
    for (const vector of vectors) {
      this.mmr.append(vector);
    }
    
    // Get the new root after adding all vectors
    const newRoot = this.mmr.getRoot();
    
    // Store in root history
    this.rootHistory.push({
      epoch: epochNumber,
      root: Buffer.from(newRoot),
      timestamp: Date.now()
    });

    return newRoot;
  }

  /**
   * Hash multiple vectors into a single leaf hash
   */
  private hashVectors(vectors: Buffer[]): Buffer {
    if (vectors.length === 0) {
      throw new Error('Cannot hash empty vector array');
    }

    if (vectors.length === 1) {
      return createHash('sha256').update(vectors[0]).digest();
    }

    // Hash all vectors together
    const combined = Buffer.concat(vectors);
    return createHash('sha256').update(combined).digest();
  }

  /**
   * Generate proof that a vector was committed in a specific epoch
   */
  generateContributionProof(vectorHash: Buffer, epochNumber: number): MMRProof | null {
    // Find the epoch in history
    const epochRecord = this.rootHistory.find(r => r.epoch === epochNumber);
    if (!epochRecord) {
      return null;
    }

    // Search for the vector hash in the MMR leaves
    for (let i = 0; i < this.mmr.getSize(); i++) {
      // Only check leaf nodes (height 0)
      if (this.mmr.isLeaf(i) && this.mmr.hasNode(i)) {
        const nodeHash = this.mmr.getNodeHash(i);
        if (nodeHash && nodeHash.equals(vectorHash)) {
          return this.mmr.generateProof(i);
        }
      }
    }

    return null;
  }

  /**
   * Verify that a vector was committed in a specific epoch
   */
  verifyContribution(vectorHash: Buffer, epochNumber: number, proof: MMRProof): boolean {
    const epochRecord = this.rootHistory.find(r => r.epoch === epochNumber);
    if (!epochRecord) {
      return false;
    }

    return MMR.verifyProof(proof, epochRecord.root);
  }

  /**
   * Get the current MMR root
   */
  getCurrentRoot(): Buffer {
    return this.mmr.getRoot();
  }

  /**
   * Get root for a specific epoch
   */
  getRootForEpoch(epochNumber: number): Buffer | null {
    const epochRecord = this.rootHistory.find(r => r.epoch === epochNumber);
    return epochRecord ? epochRecord.root : null;
  }

  /**
   * Get the complete root history
   */
  getRootHistory(): { epoch: number; root: Buffer; timestamp: number }[] {
    return [...this.rootHistory];
  }

  /**
   * Get the agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Get the current MMR state for serialization
   */
  getState(): MMRState {
    return this.mmr.getState();
  }

  /**
   * Get MMR size
   */
  getSize(): number {
    return this.mmr.getSize();
  }
}
