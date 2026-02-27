import { getMMRService, AgentEpochData } from '../services/receipt/mmrService';

/**
 * MMR CLI Commands
 * 
 * Provides command-line interface for MMR operations including
 * agent initialization, epoch processing, and proof generation.
 */

export async function initAgent(agentId: string, depinCid?: string): Promise<void> {
  console.log(`Initializing MMR for agent: ${agentId}`);

  try {
    const mmrService = getMMRService();
    const agent = await mmrService.initializeAgent(agentId, depinCid);

    console.log(`Agent ${agentId} initialized successfully`);
    console.log(`   MMR Size: ${agent.getSize()}`);
    console.log(`   Current Root: ${agent.getCurrentRoot().toString('hex')}`);

    const storageHealthy = await mmrService.checkStorageHealth();
    console.log(`   DePIN Storage: ${storageHealthy ? 'healthy' : 'unreachable'}`);

  } catch (error) {
    console.error('Failed to initialize agent:', error);
    process.exit(1);
  }
}

export async function processEpoch(agentId: string, vectors: string[], epochNumber?: number): Promise<void> {
  console.log(`📊 Processing epoch for agent: ${agentId}`);
  console.log(`   Vectors: ${vectors.length}`);
  
  try {
    const mmrService = getMMRService();
    
    // Use provided epoch number or get next one
    const epoch = epochNumber || mmrService.getNextEpochNumber();
    
    const epochData: AgentEpochData = {
      agentId,
      vectors,
      epochNumber: epoch
    };
    
    const result = await mmrService.processAgentEpoch(epochData);
    
    console.log(`Epoch ${epoch} processed successfully`);
    console.log(`   MMR Root: ${result.mmrRoot.toString('hex')}`);
    console.log(`   DePIN CID: ${result.depinCid}`);
    console.log(`   Transaction: ${result.transactionSignature}`);
    console.log(`   Gas Cost: ${result.gasCost.total} LUCID (${result.gasCost.iGas} iGas + ${result.gasCost.mGas} mGas)`);
    
  } catch (error) {
    console.error('❌ Failed to process epoch:', error);
    process.exit(1);
  }
}

export async function generateProof(agentId: string, vectorText: string, epochNumber: number): Promise<void> {
  console.log(`🔍 Generating contribution proof for agent: ${agentId}`);
  console.log(`   Vector: "${vectorText}"`);
  console.log(`   Epoch: ${epochNumber}`);
  
  try {
    const mmrService = getMMRService();
    const result = await mmrService.generateContributionProof(agentId, vectorText, epochNumber);
    
    if (!result) {
      console.log('❌ No proof found - vector may not exist in specified epoch');
      return;
    }
    
    console.log(`✅ Proof generated successfully`);
    console.log(`   Verified: ${result.verified ? '✅' : '❌'}`);
    console.log(`   Proof Details:`);
    console.log(`     Leaf Index: ${result.proof.leafIndex}`);
    console.log(`     Leaf Hash: ${result.proof.leafHash.toString('hex')}`);
    console.log(`     Siblings: ${result.proof.siblings.length}`);
    console.log(`     Peaks: ${result.proof.peaks.length}`);
    console.log(`     MMR Size: ${result.proof.mmrSize}`);
    
  } catch (error) {
    console.error('❌ Failed to generate proof:', error);
    process.exit(1);
  }
}

export async function getAgentStats(agentId: string): Promise<void> {
  console.log(`📈 Getting stats for agent: ${agentId}`);
  
  try {
    const mmrService = getMMRService();
    const stats = await mmrService.getAgentStats(agentId);
    
    if (!stats) {
      console.log('❌ Agent not found');
      return;
    }
    
    console.log(`✅ Agent Statistics:`);
    console.log(`   Agent ID: ${stats.agentId}`);
    console.log(`   MMR Size: ${stats.mmrSize}`);
    console.log(`   Total Epochs: ${stats.totalEpochs}`);
    console.log(`   Current Root: ${stats.currentRoot}`);
    console.log(`   DePIN CID: ${stats.depinCid || 'Not stored'}`);
    console.log(`   Last Updated: ${stats.lastUpdated ? new Date(stats.lastUpdated).toISOString() : 'Never'}`);
    
  } catch (error) {
    console.error('❌ Failed to get agent stats:', error);
    process.exit(1);
  }
}

export async function getAgentHistory(agentId: string): Promise<void> {
  console.log(`📚 Getting history for agent: ${agentId}`);
  
  try {
    const mmrService = getMMRService();
    const history = await mmrService.getAgentHistory(agentId);
    
    if (history.length === 0) {
      console.log('📭 No history found for agent');
      return;
    }
    
    console.log(`✅ Agent History (${history.length} epochs):`);
    for (const record of history) {
      console.log(`   Epoch ${record.epoch}:`);
      console.log(`     Root: ${record.root.toString('hex')}`);
      console.log(`     Timestamp: ${new Date(record.timestamp).toISOString()}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to get agent history:', error);
    process.exit(1);
  }
}

export async function listAgents(): Promise<void> {
  console.log(`👥 Listing all registered agents`);
  
  try {
    const mmrService = getMMRService();
    const agents = mmrService.listAgents();
    
    if (agents.length === 0) {
      console.log('📭 No agents registered');
      return;
    }
    
    console.log(`✅ Registered Agents (${agents.length}):`);
    for (const agentId of agents) {
      const stats = await mmrService.getAgentStats(agentId);
      if (stats) {
        console.log(`   ${agentId}:`);
        console.log(`     Epochs: ${stats.totalEpochs}`);
        console.log(`     MMR Size: ${stats.mmrSize}`);
        console.log(`     DePIN: ${stats.depinCid ? 'stored' : 'not stored'}`);
      }
    }

  } catch (error) {
    console.error('Failed to list agents:', error);
    process.exit(1);
  }
}

export async function verifyAgent(agentId: string): Promise<void> {
  console.log(`🔍 Verifying MMR integrity for agent: ${agentId}`);
  
  try {
    const mmrService = getMMRService();
    const result = await mmrService.verifyAgentMMR(agentId);
    
    console.log(`${result.valid ? '✅' : '❌'} MMR Verification Result:`);
    console.log(`   Valid: ${result.valid}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors:`);
      for (const error of result.errors) {
        console.log(`     - ${error}`);
      }
    }
    
    if (result.stats) {
      console.log(`   Stats:`);
      console.log(`     Total Epochs: ${result.stats.totalEpochs}`);
      console.log(`     MMR Size: ${result.stats.mmrSize}`);
      console.log(`     Current Root: ${result.stats.currentRoot}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to verify agent:', error);
    process.exit(1);
  }
}

export async function checkStorage(): Promise<void> {
  console.log(`Checking DePIN storage connectivity`);

  try {
    const mmrService = getMMRService();
    const healthy = await mmrService.checkStorageHealth();

    console.log(`DePIN Storage: ${healthy ? 'healthy' : 'unreachable'}`);

    if (healthy) {
      const depinStorage = mmrService['registry'].getDepinStorage();
      console.log(`   Provider: ${depinStorage.providerName}`);
    }

  } catch (error) {
    console.error('Failed to check DePIN storage:', error);
    process.exit(1);
  }
}

/**
 * @deprecated Use checkStorage() instead
 */
export const checkIPFS = checkStorage;

// Demo function to showcase MMR functionality
export async function runDemo(): Promise<void> {
  console.log(`🎬 Running MMR Demo`);
  
  try {
    const mmrService = getMMRService();
    const agentId = 'demo-agent';
    
    // Initialize agent
    console.log(`\n1. Initializing agent: ${agentId}`);
    await mmrService.initializeAgent(agentId);
    
    // Process first epoch
    console.log(`\n2. Processing first epoch`);
    const epoch1Data: AgentEpochData = {
      agentId,
      vectors: ['Hello', 'World', 'MMR'],
      epochNumber: 1
    };
    const result1 = await mmrService.processAgentEpoch(epoch1Data);
    console.log(`   Root: ${result1.mmrRoot.toString('hex')}`);
    
    // Process second epoch
    console.log(`\n3. Processing second epoch`);
    const epoch2Data: AgentEpochData = {
      agentId,
      vectors: ['Lucid', 'L2', 'Blockchain'],
      epochNumber: 2
    };
    const result2 = await mmrService.processAgentEpoch(epoch2Data);
    console.log(`   Root: ${result2.mmrRoot.toString('hex')}`);
    
    // Generate proof
    console.log(`\n4. Generating contribution proof`);
    const proof = await mmrService.generateContributionProof(agentId, 'Hello', 1);
    if (proof) {
      console.log(`   Proof verified: ${proof.verified}`);
    }
    
    // Show stats
    console.log(`\n5. Agent statistics`);
    const stats = await mmrService.getAgentStats(agentId);
    if (stats) {
      console.log(`   Total epochs: ${stats.totalEpochs}`);
      console.log(`   MMR size: ${stats.mmrSize}`);
      console.log(`   DePIN CID: ${stats.depinCid}`);
    }
    
    console.log(`\n✅ Demo completed successfully!`);
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}
