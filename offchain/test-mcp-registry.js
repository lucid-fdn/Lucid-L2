#!/usr/bin/env node
/**
 * MCP Registry Integration Test Script
 * Tests MCP tool discovery, listing, and execution
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001/api';

// Test utilities
function log(message) {
  console.log(`\n${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function error(message) {
  console.log(`❌ ${message}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
}

// Test 1: List all tools
async function testListTools() {
  try {
    log('Test 1: List All MCP Tools');
    const response = await axios.get(`${API_URL}/tools/list`);
    
    if (response.data.success && response.data.tools) {
      success(`Found ${response.data.count} tools`);
      response.data.tools.forEach(tool => {
        console.log(`  • ${tool.name} (${tool.type}) - ${tool.operations} operations - ${tool.status}`);
      });
      return true;
    } else {
      error('Unexpected response format');
      return false;
    }
  } catch (err) {
    error(`List tools failed: ${err.message}`);
    return false;
  }
}

// Test 2: Get specific tool info
async function testGetToolInfo() {
  try {
    log('Test 2: Get Twitter Tool Info');
    const response = await axios.get(`${API_URL}/tools/twitter/info`);
    
    if (response.data.success && response.data.tool) {
      success('Retrieved Twitter tool info');
      console.log(`  Name: ${response.data.tool.name}`);
      console.log(`  Type: ${response.data.tool.type}`);
      console.log(`  Operations: ${response.data.tool.operations.length}`);
      console.log(`  Port: ${response.data.tool.port}`);
      return true;
    } else {
      error('Tool info request failed');
      return false;
    }
  } catch (err) {
    error(`Get tool info failed: ${err.message}`);
    return false;
  }
}

// Test 3: Execute Twitter post
async function testExecuteTwitterPost() {
  try {
    log('Test 3: Execute Twitter Post (Simulated)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'twitter',
      operation: 'post',
      params: {
        content: 'Hello from Lucid L2 MCP Registry!'
      }
    });
    
    if (response.data.success) {
      success('Twitter post executed (simulated)');
      console.log('  Result:', JSON.stringify(response.data.result, null, 2));
      console.log(`  Execution time: ${response.data.executionTime}ms`);
      return true;
    } else {
      error(`Execution failed: ${response.data.error}`);
      return false;
    }
  } catch (err) {
    error(`Execute twitter post failed: ${err.message}`);
    return false;
  }
}

// Test 4: Execute IPFS upload
async function testExecuteIPFSUpload() {
  try {
    log('Test 4: Execute IPFS Upload (Simulated)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'ipfs',
      operation: 'upload',
      params: {
        content: 'Test content for IPFS',
        filename: 'test.txt'
      }
    });
    
    if (response.data.success) {
      success('IPFS upload executed (simulated)');
      console.log(`  CID: ${response.data.result.cid}`);
      console.log(`  Size: ${response.data.result.size} bytes`);
      return true;
    } else {
      error(`Execution failed: ${response.data.error}`);
      return false;
    }
  } catch (err) {
    error(`Execute IPFS upload failed: ${err.message}`);
    return false;
  }
}

// Test 5: Execute Solana read
async function testExecuteSolanaRead() {
  try {
    log('Test 5: Execute Solana Read (Simulated)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'solana',
      operation: 'read',
      params: {
        address: '11111111111111111111111111111111'
      }
    });
    
    if (response.data.success) {
      success('Solana read executed (simulated)');
      console.log(`  Address: ${response.data.result.address}`);
      console.log(`  Exists: ${response.data.result.exists}`);
      return true;
    } else {
      error(`Execution failed: ${response.data.error}`);
      return false;
    }
  } catch (err) {
    error(`Execute Solana read failed: ${err.message}`);
    return false;
  }
}

// Test 6: Execute GitHub search
async function testExecuteGitHubSearch() {
  try {
    log('Test 6: Execute GitHub Search (Simulated)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'github',
      operation: 'searchRepos',
      params: {
        query: 'solana',
        limit: 5
      }
    });
    
    if (response.data.success) {
      success('GitHub search executed (simulated)');
      console.log(`  Found: ${response.data.result.total_count} repositories`);
      return true;
    } else {
      error(`Execution failed: ${response.data.error}`);
      return false;
    }
  } catch (err) {
    error(`Execute GitHub search failed: ${err.message}`);
    return false;
  }
}

// Test 7: Execute web search
async function testExecuteWebSearch() {
  try {
    log('Test 7: Execute Web Search (Simulated)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'web-search',
      operation: 'search',
      params: {
        query: 'Solana blockchain',
        limit: 3
      }
    });
    
    if (response.data.success) {
      success('Web search executed (simulated)');
      console.log(`  Found: ${response.data.result.total} results`);
      return true;
    } else {
      error(`Execution failed: ${response.data.error}`);
      return false;
    }
  } catch (err) {
    error(`Execute web search failed: ${err.message}`);
    return false;
  }
}

// Test 8: Get registry stats
async function testRegistryStats() {
  try {
    log('Test 8: Get Registry Statistics');
    const response = await axios.get(`${API_URL}/tools/stats`);
    
    if (response.data.success && response.data.stats) {
      success('Retrieved registry statistics');
      console.log(`  Total tools: ${response.data.stats.totalTools}`);
      console.log(`  Available: ${response.data.stats.availableTools}`);
      console.log(`  Unavailable: ${response.data.stats.unavailableTools}`);
      console.log('  By type:', response.data.stats.toolsByType);
      return true;
    } else {
      error('Stats request failed');
      return false;
    }
  } catch (err) {
    error(`Get stats failed: ${err.message}`);
    return false;
  }
}

// Test 9: Test invalid tool
async function testInvalidTool() {
  try {
    log('Test 9: Execute Invalid Tool (Should Fail)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'nonexistent',
      operation: 'test',
      params: {}
    });
    
    if (!response.data.success) {
      success('Invalid tool correctly rejected');
      console.log(`  Error: ${response.data.error}`);
      return true;
    } else {
      error('Invalid tool should have been rejected');
      return false;
    }
  } catch (err) {
    // This is expected
    success('Invalid tool correctly rejected with error');
    return true;
  }
}

// Test 10: Test invalid operation
async function testInvalidOperation() {
  try {
    log('Test 10: Execute Invalid Operation (Should Fail)');
    const response = await axios.post(`${API_URL}/tools/execute`, {
      tool: 'twitter',
      operation: 'nonexistent',
      params: {}
    });
    
    if (!response.data.success) {
      success('Invalid operation correctly rejected');
      console.log(`  Error: ${response.data.error}`);
      return true;
    } else {
      error('Invalid operation should have been rejected');
      return false;
    }
  } catch (err) {
    error(`Test failed unexpectedly: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  section('🧪 MCP Registry - Integration Tests');
  
  const tests = [
    { name: 'List All Tools', fn: testListTools },
    { name: 'Get Twitter Tool Info', fn: testGetToolInfo },
    { name: 'Execute Twitter Post', fn: testExecuteTwitterPost },
    { name: 'Execute IPFS Upload', fn: testExecuteIPFSUpload },
    { name: 'Execute Solana Read', fn: testExecuteSolanaRead },
    { name: 'Execute GitHub Search', fn: testExecuteGitHubSearch },
    { name: 'Execute Web Search', fn: testExecuteWebSearch },
    { name: 'Get Registry Stats', fn: testRegistryStats },
    { name: 'Test Invalid Tool', fn: testInvalidTool },
    { name: 'Test Invalid Operation', fn: testInvalidOperation }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (err) {
      error(`Test '${test.name}' threw exception: ${err.message}`);
      failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  section('Test Summary');
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
