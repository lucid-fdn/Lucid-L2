#!/usr/bin/env node
/**
 * LangGraph Executor Service Test Script
 * Tests FlowSpec compilation and execution
 */

const axios = require('axios');

const LANGGRAPH_URL = 'http://localhost:8083';

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

// Test 1: Health Check
async function testHealthCheck() {
  try {
    log('Test 1: Health Check');
    const response = await axios.get(`${LANGGRAPH_URL}/health`);
    
    if (response.data.status === 'healthy' && response.data.executor === 'langgraph') {
      success('LangGraph service is healthy');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } else {
      error('Unexpected health check response');
      return false;
    }
  } catch (err) {
    error(`Health check failed: ${err.message}`);
    return false;
  }
}

// Test 2: Service Info
async function testServiceInfo() {
  try {
    log('Test 2: Service Info');
    const response = await axios.get(`${LANGGRAPH_URL}/info`);
    
    success('Retrieved service info');
    console.log(`Executor: ${response.data.executor}`);
    console.log(`Capabilities: ${response.data.capabilities.length}`);
    console.log(`Supported Node Types: ${response.data.supportedNodeTypes.length}`);
    return true;
  } catch (err) {
    error(`Service info failed: ${err.message}`);
    return false;
  }
}

// Test 3: Simple HTTP Node Workflow
async function testSimpleHTTPWorkflow() {
  try {
    log('Test 3: Simple HTTP Node Workflow');
    
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
    
    const response = await axios.post(`${LANGGRAPH_URL}/execute`, {
      flowspec,
      context: { tenantId: 'test-user' }
    });
    
    if (response.data.success) {
      success('HTTP workflow executed successfully');
      console.log(`Execution time: ${response.data.executionTime}s`);
      console.log('Result:', JSON.stringify(response.data.result.fetch, null, 2));
      return true;
    } else {
      error('HTTP workflow execution failed');
      return false;
    }
  } catch (err) {
    error(`HTTP workflow test failed: ${err.message}`);
    if (err.response) {
      console.log('Error response:', err.response.data);
    }
    return false;
  }
}

// Test 4: Multi-Node Workflow with Edges
async function testMultiNodeWorkflow() {
  try {
    log('Test 4: Multi-Node Workflow with Edges');
    
    const flowspec = {
      name: 'Multi-Node Test',
      nodes: [
        {
          id: 'http1',
          type: 'tool.http',
          input: {
            url: 'https://api.github.com/users/github',
            method: 'GET'
          }
        },
        {
          id: 'transform1',
          type: 'data.transform',
          input: {
            type: 'extract',
            source: '$ref.http1',
            field: 'data'
          }
        }
      ],
      edges: [
        { from: 'http1', to: 'transform1' }
      ]
    };
    
    const response = await axios.post(`${LANGGRAPH_URL}/execute`, {
      flowspec,
      context: { tenantId: 'test-user' }
    });
    
    if (response.data.success) {
      success('Multi-node workflow executed successfully');
      console.log(`Execution time: ${response.data.executionTime}s`);
      console.log(`Nodes executed: ${Object.keys(response.data.result).length}`);
      return true;
    } else {
      error('Multi-node workflow execution failed');
      return false;
    }
  } catch (err) {
    error(`Multi-node workflow test failed: ${err.message}`);
    if (err.response) {
      console.log('Error response:', err.response.data);
    }
    return false;
  }
}

// Test 5: Validation Test
async function testValidation() {
  try {
    log('Test 5: FlowSpec Validation');
    
    const validFlowspec = {
      name: 'Valid Test',
      nodes: [
        { id: 'node1', type: 'tool.http', input: {} }
      ],
      edges: []
    };
    
    const response = await axios.post(`${LANGGRAPH_URL}/validate`, validFlowspec);
    
    if (response.data.valid) {
      success('Valid FlowSpec passed validation');
      return true;
    } else {
      error('Valid FlowSpec failed validation');
      return false;
    }
  } catch (err) {
    error(`Validation test failed: ${err.message}`);
    return false;
  }
}

// Test 6: Invalid FlowSpec Validation
async function testInvalidValidation() {
  try {
    log('Test 6: Invalid FlowSpec Validation');
    
    const invalidFlowspec = {
      name: 'Invalid Test',
      nodes: [
        { id: 'node1', type: 'tool.http', input: {} }
      ],
      edges: [
        { from: 'node1', to: 'node2' } // node2 doesn't exist
      ]
    };
    
    const response = await axios.post(`${LANGGRAPH_URL}/validate`, invalidFlowspec);
    
    if (!response.data.valid) {
      success('Invalid FlowSpec correctly rejected');
      console.log(`Error: ${response.data.error}`);
      return true;
    } else {
      error('Invalid FlowSpec incorrectly accepted');
      return false;
    }
  } catch (err) {
    error(`Invalid validation test failed: ${err.message}`);
    return false;
  }
}

// Test 7: Condition Node Workflow
async function testConditionWorkflow() {
  try {
    log('Test 7: Conditional Workflow');
    
    const flowspec = {
      name: 'Conditional Test',
      nodes: [
        {
          id: 'condition1',
          type: 'control.condition',
          input: {
            condition: 'true'
          }
        },
        {
          id: 'action1',
          type: 'data.transform',
          input: {
            type: 'json'
          }
        }
      ],
      edges: [
        { from: 'condition1', to: 'action1', when: 'true' }
      ]
    };
    
    const response = await axios.post(`${LANGGRAPH_URL}/execute`, {
      flowspec,
      context: { tenantId: 'test-user' }
    });
    
    if (response.data.success) {
      success('Conditional workflow executed successfully');
      console.log(`Execution time: ${response.data.executionTime}s`);
      return true;
    } else {
      error('Conditional workflow execution failed');
      return false;
    }
  } catch (err) {
    error(`Conditional workflow test failed: ${err.message}`);
    if (err.response) {
      console.log('Error response:', err.response.data);
    }
    return false;
  }
}

// Main test runner
async function runTests() {
  section('🧪 LangGraph Executor Service - Integration Tests');
  
  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Service Info', fn: testServiceInfo },
    { name: 'Simple HTTP Workflow', fn: testSimpleHTTPWorkflow },
    { name: 'Multi-Node Workflow', fn: testMultiNodeWorkflow },
    { name: 'FlowSpec Validation', fn: testValidation },
    { name: 'Invalid Validation', fn: testInvalidValidation },
    { name: 'Conditional Workflow', fn: testConditionWorkflow }
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
