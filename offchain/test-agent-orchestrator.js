/**
 * Agent Orchestrator Test Suite
 * Tests the unified agent experience: natural language → plan → execute → results
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.cyan}━━━ Test: ${name} ━━━${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  logTest(name);
  try {
    await fn();
    logSuccess('PASSED');
    passed++;
  } catch (error) {
    logError(`FAILED: ${error.message}`);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    failed++;
  }
}

// ============================================================================
// Test 1: Health Check
// ============================================================================

async function testHealthCheck() {
  const response = await axios.get(`${API_BASE}/agents/orchestrator/health`);
  
  logInfo(`Health status: ${response.data.health.healthy ? 'Healthy' : 'Unhealthy'}`);
  logInfo(`Components:`);
  logInfo(`  - Planner (CrewAI): ${response.data.health.components.planner ? '✓' : '✗'}`);
  logInfo(`  - Router: ${response.data.health.components.router ? '✓' : '✗'}`);
  logInfo(`  - LangGraph: ${response.data.health.components.langgraph ? '✓' : '✗'}`);
  
  if (!response.data.success) {
    throw new Error('Health check failed - some components unavailable');
  }
}

// ============================================================================
// Test 2: Preview Workflow (Dry Run)
// ============================================================================

async function testPreviewWorkflow() {
  const response = await axios.post(`${API_BASE}/agents/accomplish/preview`, {
    goal: 'Fetch Bitcoin price from CoinGecko API',
    context: {
      tenantId: 'test-user-preview'
    }
  });
  
  if (!response.data.success) {
    throw new Error('Preview failed');
  }
  
  logInfo(`Preview generated FlowSpec with ${response.data.flowspec.nodes.length} nodes`);
  logInfo(`Planning time: ${response.data.planningTime}ms`);
  logInfo(`Total time: ${response.data.totalTime}ms`);
  
  if (response.data.executionResult) {
    throw new Error('Preview should not execute workflow');
  }
}

// ============================================================================
// Test 3: Simple Workflow Accomplishment
// ============================================================================

async function testSimpleAccomplish() {
  const response = await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Make a simple HTTP GET request to https://api.github.com/zen',
    context: {
      tenantId: 'test-user-simple'
    }
  });
  
  if (!response.data.success) {
    throw new Error(`Accomplish failed: ${response.data.error || 'Unknown error'}`);
  }
  
  logInfo(`Goal: "${response.data.goal}"`);
  logInfo(`FlowSpec nodes: ${response.data.flowspec.nodes.length}`);
  logInfo(`Executor: ${response.data.executor}`);
  logInfo(`Planning time: ${response.data.planningTime}ms`);
  logInfo(`Execution time: ${response.data.executionTime}ms`);
  logInfo(`Total time: ${response.data.totalTime}ms`);
  
  if (!response.data.executor) {
    throw new Error('No executor selected');
  }
}

// ============================================================================
// Test 4: Complex Workflow with MCP Tools
// ============================================================================

async function testComplexAccomplish() {
  const response = await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Search Twitter for Solana news and store results in IPFS',
    context: {
      tenantId: 'test-user-complex',
      searchQuery: 'Solana blockchain'
    }
  });
  
  if (!response.data.success) {
    throw new Error(`Complex accomplish failed: ${response.data.error || 'Unknown error'}`);
  }
  
  logInfo(`Goal: "${response.data.goal}"`);
  logInfo(`FlowSpec nodes: ${response.data.flowspec.nodes.length}`);
  logInfo(`Executor: ${response.data.executor}`);
  logInfo(`Total time: ${response.data.totalTime}ms`);
  
  // Should route to LangGraph for MCP tools
  if (response.data.executor !== 'langgraph') {
    logInfo(`⚠️  Expected LangGraph for MCP tools, got ${response.data.executor}`);
  }
}

// ============================================================================
// Test 5: Force Executor Selection
// ============================================================================

async function testForceExecutor() {
  const response = await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Simple workflow: fetch data from an API',
    context: {
      tenantId: 'test-user-force'
    },
    preferredExecutor: 'langgraph'
  });
  
  if (!response.data.success) {
    throw new Error(`Force executor failed: ${response.data.error || 'Unknown error'}`);
  }
  
  logInfo(`Requested executor: langgraph`);
  logInfo(`Actual executor: ${response.data.executor}`);
  
  if (response.data.executor !== 'langgraph') {
    throw new Error('Executor preference not honored');
  }
}

// ============================================================================
// Test 6: Get Execution History
// ============================================================================

async function testGetHistory() {
  // First, make a few accomplishments
  await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Test workflow 1',
    context: { tenantId: 'history-test-user' }
  });
  
  await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Test workflow 2',
    context: { tenantId: 'history-test-user' }
  });
  
  // Now get history
  const response = await axios.get(`${API_BASE}/agents/history/history-test-user?limit=10`);
  
  if (!response.data.success) {
    throw new Error('Failed to retrieve history');
  }
  
  logInfo(`History entries: ${response.data.history.length}`);
  logInfo(`Stats:`);
  logInfo(`  - Total executions: ${response.data.stats.totalExecutions}`);
  logInfo(`  - Success rate: ${response.data.stats.successRate.toFixed(1)}%`);
  logInfo(`  - Avg execution time: ${response.data.stats.averageExecutionTime}ms`);
  logInfo(`  - Favored executor: ${response.data.stats.favoredExecutor || 'none'}`);
  
  if (response.data.history.length < 2) {
    throw new Error('Expected at least 2 history entries');
  }
}

// ============================================================================
// Test 7: Dry Run Flag
// ============================================================================

async function testDryRunFlag() {
  const response = await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Test dry run workflow',
    context: {
      tenantId: 'test-dry-run'
    },
    dryRun: true
  });
  
  if (!response.data.success) {
    throw new Error('Dry run failed');
  }
  
  logInfo(`Dry run completed in ${response.data.totalTime}ms`);
  logInfo(`FlowSpec generated: ${response.data.flowspec ? 'Yes' : 'No'}`);
  
  if (response.data.executionResult) {
    throw new Error('Dry run should not execute');
  }
  
  if (!response.data.flowspec) {
    throw new Error('Dry run should return FlowSpec');
  }
}

// ============================================================================
// Test 8: Error Handling - Invalid Goal
// ============================================================================

async function testInvalidGoal() {
  try {
    await axios.post(`${API_BASE}/agents/accomplish`, {
      goal: '', // Empty goal
      context: {
        tenantId: 'test-error'
      }
    });
    throw new Error('Should have rejected empty goal');
  } catch (error) {
    if (error.response?.status === 400) {
      logInfo('Correctly rejected empty goal');
    } else {
      throw error;
    }
  }
}

// ============================================================================
// Test 9: Multiple Goals in Sequence
// ============================================================================

async function testSequentialGoals() {
  const goals = [
    'Fetch data from GitHub API',
    'Search for Solana information',
    'Make an HTTP POST request'
  ];
  
  const results = [];
  
  for (const goal of goals) {
    const response = await axios.post(`${API_BASE}/agents/accomplish`, {
      goal,
      context: {
        tenantId: 'test-sequential'
      }
    });
    
    if (response.data.success) {
      results.push({
        goal,
        executor: response.data.executor,
        time: response.data.totalTime
      });
    }
  }
  
  logInfo(`Completed ${results.length}/${goals.length} goals`);
  results.forEach((r, i) => {
    logInfo(`  ${i + 1}. ${r.goal} → ${r.executor} (${r.time}ms)`);
  });
  
  if (results.length !== goals.length) {
    throw new Error('Not all goals completed successfully');
  }
}

// ============================================================================
// Test 10: Performance Benchmark
// ============================================================================

async function testPerformance() {
  const startTime = Date.now();
  
  const response = await axios.post(`${API_BASE}/agents/accomplish`, {
    goal: 'Simple performance test workflow',
    context: {
      tenantId: 'test-performance'
    }
  });
  
  const endTime = Date.now();
  const wallClockTime = endTime - startTime;
  
  if (!response.data.success) {
    throw new Error('Performance test failed');
  }
  
  logInfo(`Wall clock time: ${wallClockTime}ms`);
  logInfo(`Planning time: ${response.data.planningTime}ms`);
  logInfo(`Execution time: ${response.data.executionTime}ms`);
  logInfo(`Reported total: ${response.data.totalTime}ms`);
  logInfo(`Overhead: ${wallClockTime - response.data.totalTime}ms`);
  
  if (response.data.totalTime > 10000) {
    logInfo('⚠️  Workflow took longer than 10 seconds');
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTests() {
  log('\n🧪 Agent Orchestrator Test Suite\n', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  await test('Health Check', testHealthCheck);
  await test('Preview Workflow (Dry Run)', testPreviewWorkflow);
  await test('Simple Workflow Accomplishment', testSimpleAccomplish);
  await test('Complex Workflow with MCP Tools', testComplexAccomplish);
  await test('Force Executor Selection', testForceExecutor);
  await test('Get Execution History', testGetHistory);
  await test('Dry Run Flag', testDryRunFlag);
  await test('Error Handling - Invalid Goal', testInvalidGoal);
  await test('Multiple Goals in Sequence', testSequentialGoals);
  await test('Performance Benchmark', testPerformance);
  
  // Summary
  log('\n' + '═'.repeat(60), 'cyan');
  log(`\n📊 Test Summary:`, 'cyan');
  log(`   ✅ Passed: ${passed}`, 'green');
  log(`   ❌ Failed: ${failed}`, 'red');
  log(`   📈 Total: ${passed + failed}`, 'blue');
  log(`   🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`, 'cyan');
  
  if (failed === 0) {
    log('🎉 All tests passed!\n', 'green');
    process.exit(0);
  } else {
    log('⚠️  Some tests failed. Please review the errors above.\n', 'yellow');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  logError(`\nFatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
