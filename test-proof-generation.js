#!/usr/bin/env node

/**
 * Simple test to verify proof generation works correctly
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function makeRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

async function testProofGeneration() {
  console.log('🧪 Testing Proof Generation with Fresh Agent');
  
  // Use a unique agent ID to avoid conflicts
  const testAgentId = `proof-test-${Date.now()}`;
  const testVector = 'Test Vector for Proof Generation';
  
  console.log(`\n1. Initializing fresh agent: ${testAgentId}`);
  const initResult = await makeRequest('POST', '/agents/init', {
    agentId: testAgentId
  });
  
  if (!initResult.success) {
    console.error('❌ Failed to initialize agent:', initResult.error);
    return false;
  }
  
  console.log('✅ Agent initialized successfully');
  console.log(`   MMR Size: ${initResult.data.stats.mmrSize}`);
  console.log(`   Total Epochs: ${initResult.data.stats.totalEpochs}`);
  
  console.log(`\n2. Processing epoch 1 with test vector: "${testVector}"`);
  const epochResult = await makeRequest('POST', '/agents/epoch', {
    agentId: testAgentId,
    vectors: [testVector, 'Another vector', 'Third vector'],
    epochNumber: 1
  });
  
  if (!epochResult.success) {
    console.error('❌ Failed to process epoch:', epochResult.error);
    return false;
  }
  
  console.log('✅ Epoch processed successfully');
  console.log(`   MMR Root: ${epochResult.data.mmrRoot.substring(0, 16)}...`);
  console.log(`   Vector Count: ${epochResult.data.vectorCount}`);
  
  console.log(`\n3. Generating proof for vector: "${testVector}"`);
  const proofResult = await makeRequest('POST', '/agents/proof', {
    agentId: testAgentId,
    vectorText: testVector,
    epochNumber: 1
  });
  
  if (proofResult.success) {
    console.log('✅ Proof generated successfully!');
    console.log(`   Vector: "${proofResult.data.vectorText}"`);
    console.log(`   Epoch: ${proofResult.data.epochNumber}`);
    console.log(`   Verified: ${proofResult.data.verified}`);
    console.log(`   Leaf Index: ${proofResult.data.proof.leafIndex}`);
    return true;
  } else {
    console.error('❌ Proof generation failed:', proofResult.error);
    
    // Let's check the agent history to debug
    console.log('\n🔍 Debugging - checking agent history:');
    const historyResult = await makeRequest('GET', `/agents/${testAgentId}/history`);
    if (historyResult.success) {
      console.log(`   Total Epochs: ${historyResult.data.totalEpochs}`);
      historyResult.data.history.forEach((epoch, index) => {
        console.log(`   Epoch ${epoch.epoch}: ${epoch.root.substring(0, 16)}... (${epoch.date})`);
      });
    }
    
    return false;
  }
}

// Run the test
testProofGeneration()
  .then(success => {
    console.log(`\n${success ? '🎉 Test PASSED' : '💥 Test FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test failed with error:', error.message);
    process.exit(1);
  });
