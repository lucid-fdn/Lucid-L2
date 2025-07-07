import { MMRState, AgentMMR } from './mmr';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * File-based Storage Manager for MMR data (simulating IPFS)
 * 
 * Handles off-chain storage of MMR states using local file system
 * with content-addressed storage similar to IPFS.
 */

export interface IPFSConfig {
  storageDir?: string;
}

export interface StoredMMRData {
  agentId: string;
  mmrState: MMRState;
  rootHistory: { epoch: number; root: Buffer; timestamp: number }[];
  lastUpdated: number;
  version: string;
}

export class IPFSStorageManager {
  private storageDir: string;
  private initialized: boolean = false;

  constructor(config?: IPFSConfig) {
    this.storageDir = config?.storageDir || path.join(process.cwd(), '.mmr-storage');
  }

  /**
   * Initialize storage directory
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      this.initialized = true;
      console.log(`📁 File storage initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw new Error(`Storage initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store MMR data for an agent (simulating IPFS)
   */
  async storeAgentMMR(agentMMR: AgentMMR): Promise<string> {
    await this.initialize();
    
    try {
      const mmrData: StoredMMRData = {
        agentId: agentMMR.getAgentId(),
        mmrState: agentMMR.getState(),
        rootHistory: agentMMR.getRootHistory(),
        lastUpdated: Date.now(),
        version: '1.0'
      };

      // Serialize the data with Buffer handling
      const serializedData = this.serializeMMRData(mmrData);
      
      // Generate content-addressed ID (CID simulation)
      const cid = this.generateCID(serializedData);
      const filePath = path.join(this.storageDir, `${cid}.json`);
      
      // Write to file
      fs.writeFileSync(filePath, serializedData);
      
      console.log(`📦 Stored MMR for agent ${agentMMR.getAgentId()} with CID: ${cid}`);
      return cid;
    } catch (error) {
      console.error('Failed to store MMR data:', error);
      throw new Error(`Storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve MMR data for an agent by CID
   */
  async retrieveAgentMMR(cid: string): Promise<AgentMMR | null> {
    await this.initialize();
    
    try {
      const filePath = path.join(this.storageDir, `${cid}.json`);
      
      if (!fs.existsSync(filePath)) {
        console.warn(`MMR data not found for CID: ${cid}`);
        return null;
      }
      
      const data = fs.readFileSync(filePath);
      const mmrData = this.deserializeMMRData(data);
      
      // Reconstruct AgentMMR
      const agentMMR = new AgentMMR(mmrData.agentId, mmrData.mmrState);
      
      // Restore root history
      for (const historyItem of mmrData.rootHistory) {
        // Note: This would require adding a method to restore history in AgentMMR
        // For now, we'll create a new instance with the state
      }
      
      console.log(`📥 Retrieved MMR for agent ${mmrData.agentId} from CID: ${cid}`);
      return agentMMR;
    } catch (error) {
      console.error('Failed to retrieve MMR data:', error);
      return null;
    }
  }

  /**
   * Pin MMR data (mark as important - in file system, we just create a pin file)
   */
  async pinAgentMMR(cid: string): Promise<void> {
    await this.initialize();
    
    try {
      const pinPath = path.join(this.storageDir, 'pins', `${cid}.pin`);
      const pinDir = path.dirname(pinPath);
      
      if (!fs.existsSync(pinDir)) {
        fs.mkdirSync(pinDir, { recursive: true });
      }
      
      fs.writeFileSync(pinPath, JSON.stringify({ cid, pinnedAt: Date.now() }));
      console.log(`📌 Pinned MMR data: ${cid}`);
    } catch (error) {
      console.error('Failed to pin MMR data:', error);
      throw new Error(`Pinning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpin MMR data
   */
  async unpinAgentMMR(cid: string): Promise<void> {
    await this.initialize();
    
    try {
      const pinPath = path.join(this.storageDir, 'pins', `${cid}.pin`);
      
      if (fs.existsSync(pinPath)) {
        fs.unlinkSync(pinPath);
        console.log(`📌❌ Unpinned MMR data: ${cid}`);
      }
    } catch (error) {
      console.error('Failed to unpin MMR data:', error);
      throw new Error(`Unpinning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all pinned MMR data
   */
  async listPinnedMMRs(): Promise<string[]> {
    await this.initialize();
    
    try {
      const pinDir = path.join(this.storageDir, 'pins');
      
      if (!fs.existsSync(pinDir)) {
        return [];
      }
      
      const pinFiles = fs.readdirSync(pinDir);
      return pinFiles
        .filter(file => file.endsWith('.pin'))
        .map(file => file.replace('.pin', ''));
    } catch (error) {
      console.error('Failed to list pinned MMRs:', error);
      return [];
    }
  }

  /**
   * Check if storage is accessible
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.initialize();
      return this.initialized;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage information
   */
  async getNodeInfo(): Promise<any> {
    await this.initialize();
    
    try {
      const stats = fs.statSync(this.storageDir);
      const files = fs.readdirSync(this.storageDir);
      
      return {
        storageDir: this.storageDir,
        created: stats.birthtime,
        totalFiles: files.length,
        type: 'file-based-storage'
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return null;
    }
  }

  /**
   * Stop the storage (cleanup if needed)
   */
  async stop(): Promise<void> {
    if (this.initialized) {
      this.initialized = false;
      console.log('🛑 File storage stopped');
    }
  }

  /**
   * Generate content-addressed ID (simulating IPFS CID)
   */
  private generateCID(data: Buffer): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `Qm${hash.substring(0, 44)}`; // Simulate IPFS CID format
  }

  /**
   * Serialize MMR data for storage
   */
  private serializeMMRData(data: StoredMMRData): Buffer {
    // Convert Buffers to base64 strings for JSON serialization
    const serializable = {
      ...data,
      mmrState: {
        ...data.mmrState,
        peaks: data.mmrState.peaks.map(p => p.toString('base64')),
        nodes: Array.from(data.mmrState.nodes.entries()).map(([k, v]) => [k, v.toString('base64')])
      },
      rootHistory: data.rootHistory.map(r => ({
        ...r,
        root: r.root.toString('base64')
      }))
    };

    return Buffer.from(JSON.stringify(serializable, null, 2));
  }

  /**
   * Deserialize MMR data from storage
   */
  private deserializeMMRData(data: Buffer): StoredMMRData {
    const parsed = JSON.parse(data.toString());
    
    // Convert base64 strings back to Buffers
    return {
      ...parsed,
      mmrState: {
        ...parsed.mmrState,
        peaks: parsed.mmrState.peaks.map((p: string) => Buffer.from(p, 'base64')),
        nodes: new Map(parsed.mmrState.nodes.map(([k, v]: [number, string]) => [k, Buffer.from(v, 'base64')]))
      },
      rootHistory: parsed.rootHistory.map((r: any) => ({
        ...r,
        root: Buffer.from(r.root, 'base64')
      }))
    };
  }
}

/**
 * Agent MMR Registry for managing multiple agents
 */
export class AgentMMRRegistry {
  private agents: Map<string, { mmr: AgentMMR; ipfsCid?: string }> = new Map();
  private storage: IPFSStorageManager;

  constructor(ipfsConfig?: IPFSConfig) {
    this.storage = new IPFSStorageManager(ipfsConfig);
  }

  /**
   * Register a new agent or load existing one from storage
   */
  async registerAgent(agentId: string, ipfsCid?: string): Promise<AgentMMR> {
    if (this.agents.has(agentId)) {
      return this.agents.get(agentId)!.mmr;
    }

    let agentMMR: AgentMMR;

    if (ipfsCid) {
      // Load from storage
      const loadedMMR = await this.storage.retrieveAgentMMR(ipfsCid);
      if (loadedMMR) {
        agentMMR = loadedMMR;
        console.log(`🔄 Loaded agent ${agentId} from storage: ${ipfsCid}`);
      } else {
        agentMMR = new AgentMMR(agentId);
        console.log(`⚠️  Failed to load agent ${agentId} from storage, created new MMR`);
      }
    } else {
      // Create new
      agentMMR = new AgentMMR(agentId);
      console.log(`✨ Created new MMR for agent ${agentId}`);
    }

    this.agents.set(agentId, { mmr: agentMMR, ipfsCid });
    return agentMMR;
  }

  /**
   * Process epoch for an agent and update storage
   */
  async processAgentEpoch(agentId: string, vectors: Buffer[], epochNumber: number): Promise<{ root: Buffer; ipfsCid: string }> {
    const agentData = this.agents.get(agentId);
    if (!agentData) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    // Process the epoch
    const newRoot = agentData.mmr.processEpoch(vectors, epochNumber);

    // Store updated MMR
    const newCid = await this.storage.storeAgentMMR(agentData.mmr);
    
    // Update registry
    this.agents.set(agentId, { mmr: agentData.mmr, ipfsCid: newCid });

    // Pin the new data
    await this.storage.pinAgentMMR(newCid);

    // Optionally unpin old data
    if (agentData.ipfsCid && agentData.ipfsCid !== newCid) {
      try {
        await this.storage.unpinAgentMMR(agentData.ipfsCid);
      } catch (error) {
        console.warn(`Failed to unpin old MMR data: ${agentData.ipfsCid}`);
      }
    }

    console.log(`🔄 Updated agent ${agentId} epoch ${epochNumber}, new CID: ${newCid}`);
    
    return { root: newRoot, ipfsCid: newCid };
  }

  /**
   * Get agent MMR
   */
  getAgent(agentId: string): AgentMMR | null {
    const agentData = this.agents.get(agentId);
    return agentData ? agentData.mmr : null;
  }

  /**
   * Get agent storage CID
   */
  getAgentCID(agentId: string): string | null {
    const agentData = this.agents.get(agentId);
    return agentData?.ipfsCid || null;
  }

  /**
   * List all registered agents
   */
  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check storage connectivity
   */
  async checkIPFSConnection(): Promise<boolean> {
    return await this.storage.isConnected();
  }

  /**
   * Get storage manager for direct access
   */
  getStorageManager(): IPFSStorageManager {
    return this.storage;
  }
}
