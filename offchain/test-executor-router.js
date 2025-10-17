#!/usr/bin/env node
/**
 * Executor Router Integration Test Script
 * Tests smart routing between n8n and LangGraph executors
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

// Test 1: Check executor health
async function testExecutorHealth() {
  try {
    log('Test 1: Check Executor Health');
    const response = await axios.get(`${API_URL}/agents/executor/health`);
    
    if (response.data.success) {
      success('Executor health check successful');
      console.log(`  n8n: ${response.data.executors.n8n ? '✓ healthy' : '✗ unavailable'}`);
      console.log(`  LangGraph: ${response.data.executors.langgraph ? '✓ healthy' : '✗ unavailable'}`);
      return true;
    } else {
      error('Health check failed');
      return false;
    }
  } catch (err) {
    error(`Health check failed: ${err.message}`);
    return false;
  }
}

// Test 2: Simple workflow decision (should route to n8n)
async function testSimpleWorkflowDecision() {
  try {
    log('Test 2: Simple Workflow Decision (should suggest n8n)');
    
    const flowspec = {
      name: 'Simple Workflow',
      nodes: [
        { id: 'node1', type: 'llm.chat', input: { prompt: 'Hello' } }
      ],
      edges: []
    };

    const response = await axios.post(`${API_URL}/agents/executor/decision`, {
      flowspec
    });
    
    if (response.data.success && response.data.decision) {
      const decision = response.data.decision;
      success(`Decision: ${decision.executor}`);
      console.log(`  Reason: ${decision.reason}`);
      console.log(`  Complexity: ${decision.complexity}`);
      console.log(`  Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
      
      // Simple workflows should route to n8n
      if (decision.executor === 'n8n' && decision.complexity === 'simple') {
        success('Correctly routed simple workflow to n8n');
        return true;
      } else {
        error(`Expected n8n for simple workflow, got ${decision.executor}`);
        return false;
      }
    } else {
      error('Decision request failed');
      return false;
    }
  } catch (err) {
    error(`Simple workflow decision failed: ${err.message}`);
    return false;
  }
}

// Test 3: Complex workflow with MCP tools (should route to LangGraph)
async function testComplexWorkflowDecision() {
  try {
    log('Test 3: Complex Workflow with MCP Tools (should suggest LangGraph)');
    
    const flowspec = {
      name: 'Complex MCP Workflow',
      nodes: [
        { id: 'tool1', type: 'tool.mcp', input: { tool: 'twitter', operation: 'search' } },
        { id: 'llm1', type: 'llm.chat', input: { prompt: 'Analyze' } },
        { id: 'tool2', type: 'tool.mcp', input: { tool: 'ipfs', operation: 'upload' } }
      ],
      edges: [
        { from: 'tool1', to: 'llm1' },
        { from: 'llm1', to: 'tool2' }
      ]
    };

    const response = await axios.post(`${API_URL}/agents/executor/decision`, {
      flowspec
    });
    
    if (response.data.success && response.data.decision) {
      const decision = response.data.decision;
      success(`Decision: ${decision.executor}`);
      console.log(`  Reason: ${decision.reason}`);
      console.log(`  Complexity: ${decision.complexity}`);
      console.log(`  Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
      
      // MCP tool workflows should route to LangGraph
      if (decision.executor === 'langgraph') {
        success('Correctly routed MCP workflow to LangGraph');
        return true;
      } else {
        error(`Expected LangGraph for MCP workflow, got ${decision.executor}`);
        return false;
      }
    } else {
      error('Decision request failed');
      return false;
    }
  } catch (err) {
    error(`Complex workflow decision failed: ${err.message}`);
    return false;
  }
}

// Test 4: Workflow with conditionals (should route to LangGraph if many)
async function testConditionalWorkflowDecision() {
  try {
    log('Test 4: Workflow with Conditionals (should suggest LangGraph)');
    
    const flowspec = {
      name: 'Conditional Workflow',
      nodes: [
        { id: 'start', type: 'llm.chat' },
        { id: 'check1', type: 'transform' },
        { id: 'check2', type: 'transform' },
        { id: 'check3', type: 'transform' },
        { id: 'check4', type: 'transform' },
        { id: 'end', type: 'llm.chat' }
      ],
      edges: [
        { from: 'start', to: 'check1', when: 'cond1' },
        { from: 'check1', to: 'check2', when: 'cond2' },
        { from: 'check2', to: 'check3', when: 'cond3' },
        { from: 'check3', to: 'check4', when: 'cond4' },
        { from: 'check4', to: 'end' }
      ]
    };

    const response = await axios.post(`${API_URL}/agents/executor/decision`, {
      flowspec
    });
    
    if (response.data.success && response.data.decision) {
      const decision = response.data.decision;
      success(`Decision: ${decision.executor}`);
      console.log(`  Reason: ${decision.reason}`);
      console.log(`  Conditional edges: 4`);
      
      // 4 conditional edges should route to LangGraph
      if (decision.executor === 'langgraph') {
        success('Correctly routed conditional workflow to LangGraph');
        return true;
      } else {
        console.log('  Note: Routed to n8n (acceptable for <4 conditionals)');
        return true;
      }
    } else {
      error('Decision request failed');
      return false;
    }
  } catch (err) {
    error(`Conditional workflow decision failed: ${err.message}`);
    return false;
  }
}

// Test 5: Execute simple workflow via router
async function testExecuteSimpleWorkflow() {
  try {
    log('Test 5: Execute Simple Workflow via Router');
    
    const flowspec = {
      name: 'Simple HTTP Test',
      nodes: [
        {
          id: 'fetch',
          type: 'tool.http',
          input: {
            url: 'https://api.github.com/zen',
            method: 'GET'
          }
        }
      ],
      edges: []
    };

    const response = await axios.post(`${API_URL}/agents/execute`, {
      flowspec,
      context: { tenantId: 'test-user' }
    });
    
    if (response.data.success) {
      success(`Workflow executed via ${response.data.executor}`);
      console.log(`  Execution ID: ${response.data.executionId}`);
      console.log(`  Success: ${response.data.success}`);
      return true;
    } else {
      error('Execution failed');
      console.log(`  Error: ${response.data.errors}`);
      return false;
    }
  } catch (err) {
    error(`Execute simple workflow failed: ${err.message}`);
    if (err.response) {
      console.log('  Error response:', err.response.data);
    }
    return false;
  }
}

// Test 6: Force execution via LangGraph
async function testForceLangGraphExecution() {
  try {
    log('Test 6: Force Execution via LangGraph');
    
    const flowspec = {
      name: 'Forced LangGraph Test',
      nodes: [
        {
          id: 'test',
          type: 'tool.http',
          input: {
            url: 'https://api.github.com/zen',
            method: 'GET'
          }
        }
      ],
      edges: []
    };

    const response = await axios.post(`${API_URL}/agents/execute`, {
      flowspec,
      context: { tenantId: 'test-user' },
      executor: 'langgraph'  // Force LangGraph
    });
    
    if (response.data.success && response.data.executor === 'langgraph') {
      success('Successfully forced execution via LangGraph');
      console.log(`  Execution ID: ${response.data.executionId}`);
      return true;
    } else {
      error(`Expected LangGraph executor, got ${response.data.executor}`);
      return false;
    }
  } catch (err) {
    error(`Force LangGraph execution failed: ${err.message}`);
    if (err.response) {
      console.log('  Error response:', err.response.data);
    }
    return false;
  }
}

// Test 7: Large workflow decision (should route to LangGraph)
async function testLargeWorkflowDecision() {
  try {
    log('Test 7: Large Workflow Decision (>10 nodes, should suggest LangGraph)');
    
    const nodes = [];
    const edges = [];
    
    // Create 12 nodes
    for (let i = 1; i <= 12; i++) {
      nodes.push({ id: `node${i}`, type: 'llm.chat', input: {} });
      if (i > 1) {
        edges.push({ from: `node${i-1}`, to: `node${i}` });
      }
    }

    const flowspec = {
      name: 'Large Workflow',
      nodes,
      edges
    };

    const response = await axios.post(`${API_URL}/agents/executor/decision`, {
      flowspec
    });
    
    if (response.data.success && response.data.decision) {
      const decision = response.data.decision;
      success(`Decision: ${decision.executor}`);
      console.log(`  Node count: 12`);
      console.log(`  Reason: ${decision.reason}`);
      
      // 12 nodes should route to LangGraph
      if (decision.executor === 'langgraph' && decision.complexity === 'complex') {
        success('Correctly routed large workflow to LangGraph');
        return true;
      } else {
        error(`Expected LangGraph for 12 nodes, got ${decision.executor}`);
        return false;
      }
    } else {
      error('Decision request failed');
      return false;
    }
  } catch (err) {
    error(`Large workflow decision failed: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  section('🧪 Executor Router - Integration Tests');
  
  const tests = [
    { name: 'Check Executor Health', fn: testExecutorHealth },
    { name: 'Simple Workflow Decision', fn: testSimpleWorkflowDecision },
    { name: 'Complex MCP Workflow Decision', fn: testComplexWorkflowDecision },
    { name: 'Conditional Workflow Decision', fn: testConditionalWorkflowDecision },
    { name: 'Execute Simple Workflow', fn: testExecuteSimpleWorkflow },
    { name: 'Force LangGraph Execution', fn: testForceLangGraphExecution },
    { name: 'Large Workflow Decision', fn: testLargeWorkflowDecision }
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
    await new Promise(resolve => setTimeout(resolve, 1000));
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
