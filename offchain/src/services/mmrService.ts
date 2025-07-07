import { PublicKey } from '@solana/web3.js';
import { AgentMMR } from '../utils/mmr';
import { AgentMMRRegistry } from '../utils/ipfsStorage';
import { createHash } from 'crypto';
import { initSolana, getKeypair } from '../solana/client';
import { calculateGasCost } from '../solana/gas';

/**
 * MMR Service for Lucid L2
 * 
 * Integrates Merkle Mountain Range functionality with the existing
 * thought-epoch system, providing per-agent MMR management with
 * IPFS storage and on-chain root commitment.
 */

export interface MMRCommitResult {
  mmrRoot: Buffer;
  ipfsCid: string;
  transactionSignature: string;
  epochNumber: number;
  gasCost: { iGas: number; mGas: number; total: number };
}

export interface AgentEpochData {
  agentId: string;
  vectors: string[];  // Text inputs that will be converted to vectors
  epochNumber: number;
}

export class MMRService {
  private registry: AgentMMRRegistry;
  private currentEpoch: number = 1;

  constructor() {
    this.registry = new AgentMMRRegistry();
  }

  /**
   * Initialize an agent's MMR (or load existing from IPFS)
   */
  async initializeAgent(agentId: string, ipfsCid?: string): Promise<AgentMMR> {
    console.log(`🤖 Initializing agent: ${agentId}${ipfsCid ? ` from IPFS: ${ipfsCid}` : ''}`);
    return await this.registry.registerAgent(agentId, ipfsCid);
  }

  /**
   * Process a single epoch for an agent
   */
  async processAgentEpoch(epochData: AgentEpochData): Promise<MMRCommitResult> {
    const { agentId, vectors, epochNumber } = epochData;

    // Convert text vectors to Buffer hashes
    const vectorHashes = vectors.map(text => 
      createHash('sha256').update(text).digest()
    );

    console.log(`📊 Processing epoch ${epochNumber} for agent ${agentId} with ${vectors.length} vectors`);

    // Process the epoch in MMR and get IPFS CID
    const { root: mmrRoot, ipfsCid } = await this.registry.processAgentEpoch(
      agentId, 
      vectorHashes, 
      epochNumber
    );

    // Commit MMR root to Solana
    const { signature, gasCost } = await this.commitRootToChain(mmrRoot, agentId);

    console.log(`✅ Epoch ${epochNumber} committed for agent ${agentId}`);
    console.log(`   MMR Root: ${mmrRoot.toString('hex')}`);
    console.log(`   IPFS CID: ${ipfsCid}`);
    console.log(`   Tx Signature: ${signature}`);
    console.log(`   Gas Cost: ${gasCost.total} LUCID (${gasCost.iGas} iGas + ${gasCost.mGas} mGas)`);

    return {
      mmrRoot,
      ipfsCid,
      transactionSignature: signature,
      epochNumber,
      gasCost
    };
  }

  /**
   * Process multiple epochs in batch for an agent
   */
  async processBatchEpochs(batchData: AgentEpochData[]): Promise<MMRCommitResult[]> {
    const results: MMRCommitResult[] = [];
    
    // Group by agent for efficient processing
    const agentGroups = new Map<string, AgentEpochData[]>();
    for (const epochData of batchData) {
      if (!agentGroups.has(epochData.agentId)) {
        agentGroups.set(epochData.agentId, []);
      }
      agentGroups.get(epochData.agentId)!.push(epochData);
    }

    // Process each agent's epochs
    for (const [agentId, epochs] of agentGroups) {
      console.log(`🔄 Processing ${epochs.length} epochs for agent ${agentId}`);
      
      for (const epochData of epochs) {
        const result = await this.processAgentEpoch(epochData);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Generate proof of contribution for a vector in a specific epoch
   */
  async generateContributionProof(
    agentId: string, 
    vectorText: string, 
    epochNumber: number
  ): Promise<{ proof: any; verified: boolean } | null> {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Hash the vector text
    const vectorHash = createHash('sha256').update(vectorText).digest();

    console.log(`🔍 DEBUG: Generating proof for agent ${agentId}, epoch ${epochNumber}`);
    console.log(`   Vector text: "${vectorText}"`);
    console.log(`   Vector hash: ${vectorHash.toString('hex')}`);
    console.log(`   MMR size: ${agent.getSize()}`);

    // Debug: Check what's in the MMR
    const history = agent.getRootHistory();
    console.log(`   Root history: ${history.length} epochs`);
    history.forEach(h => {
      console.log(`     Epoch ${h.epoch}: ${h.root.toString('hex').substring(0, 16)}...`);
    });

    // Generate proof
    const proof = agent.generateContributionProof(vectorHash, epochNumber);
    if (!proof) {
      console.log(`   ❌ No proof found`);
      return null;
    }

    // Verify the proof
    const verified = agent.verifyContribution(vectorHash, epochNumber, proof);

    console.log(`🔍 Generated contribution proof for agent ${agentId}, epoch ${epochNumber}`);
    console.log(`   Vector: "${vectorText}"`);
    console.log(`   Verified: ${verified}`);

    return { proof, verified };
  }

  /**
   * Get agent's MMR root history
   */
  async getAgentHistory(agentId: string): Promise<{ epoch: number; root: Buffer; timestamp: number }[]> {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent.getRootHistory();
  }

  /**
   * Get current MMR root for an agent
   */
  async getAgentCurrentRoot(agentId: string): Promise<Buffer | null> {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      return null;
    }

    return agent.getCurrentRoot();
  }

  /**
   * Get agent's IPFS CID
   */
  getAgentIPFSCID(agentId: string): string | null {
    return this.registry.getAgentCID(agentId);
  }

  /**
   * List all registered agents
   */
  listAgents(): string[] {
    return this.registry.listAgents();
  }

  /**
   * Check IPFS connectivity
   */
  async checkIPFSConnection(): Promise<boolean> {
    return await this.registry.checkIPFSConnection();
  }

  /**
   * Commit MMR root to Solana blockchain
   */
  private async commitRootToChain(mmrRoot: Buffer, agentId: string): Promise<{ signature: string; gasCost: any }> {
    const program = initSolana();
    const authority = getKeypair();
    
    // Calculate gas costs
    const gasCost = calculateGasCost('single', 1);

    try {
      // Convert Buffer to 32-byte array
      const rootArray: number[] = Array.from(mmrRoot);
      if (rootArray.length !== 32) {
        throw new Error(`Invalid MMR root length: ${rootArray.length}, expected 32`);
      }

      // Commit to chain using existing commit_epoch function
      const signature = await program.methods
        .commitEpoch(rootArray)
        .accounts({
          authority: authority.publicKey,
        })
        .rpc();

      return { signature, gasCost };
    } catch (error) {
      console.error('Failed to commit MMR root to chain:', error);
      throw new Error(`Chain commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get next epoch number
   */
  getNextEpochNumber(): number {
    return this.currentEpoch++;
  }

  /**
   * Set current epoch number
   */
  setCurrentEpoch(epochNumber: number): void {
    this.currentEpoch = epochNumber;
  }

  /**
   * Get MMR statistics for an agent
   */
  async getAgentStats(agentId: string): Promise<{
    agentId: string;
    mmrSize: number;
    totalEpochs: number;
    currentRoot: string;
    ipfsCid: string | null;
    lastUpdated: number | null;
  } | null> {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const history = agent.getRootHistory();
    const currentRoot = agent.getCurrentRoot();
    const ipfsCid = this.registry.getAgentCID(agentId);

    return {
      agentId,
      mmrSize: agent.getSize(),
      totalEpochs: history.length,
      currentRoot: currentRoot.toString('hex'),
      ipfsCid,
      lastUpdated: history.length > 0 ? history[history.length - 1].timestamp : null
    };
  }

  /**
   * Verify MMR integrity for an agent
   */
  async verifyAgentMMR(agentId: string): Promise<{
    valid: boolean;
    errors: string[];
    stats: any;
  }> {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      return {
        valid: false,
        errors: [`Agent ${agentId} not found`],
        stats: null
      };
    }

    const errors: string[] = [];
    const history = agent.getRootHistory();

    // Basic validation
    if (history.length === 0) {
      errors.push('No epochs found in MMR history');
    }

    // Check epoch sequence
    for (let i = 1; i < history.length; i++) {
      if (history[i].epoch <= history[i-1].epoch) {
        errors.push(`Invalid epoch sequence at index ${i}: ${history[i].epoch} <= ${history[i-1].epoch}`);
      }
    }

    // Check timestamp sequence
    for (let i = 1; i < history.length; i++) {
      if (history[i].timestamp < history[i-1].timestamp) {
        errors.push(`Invalid timestamp sequence at index ${i}`);
      }
    }

    const stats = await this.getAgentStats(agentId);

    return {
      valid: errors.length === 0,
      errors,
      stats
    };
  }
}

// Singleton instance
let mmrServiceInstance: MMRService | null = null;

/**
 * Get the global MMR service instance
 */
export function getMMRService(): MMRService {
  if (!mmrServiceInstance) {
    mmrServiceInstance = new MMRService();
  }
  return mmrServiceInstance;
}
