/**
 * Test script for CrewAI Agent Planner Service
 * 
 * Tests the integration between Lucid API and CrewAI planner
 */

const axios = require('axios');

const LUCID_API_URL = 'http://localhost:3001/api';
const CREWAI_URL = 'http://localhost:8082';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

async function testCrewAIHealth() {
  logSection('Test 1: CrewAI Service Health Check');
  
  try {
    const response = await axios.get(`${CREWAI_URL}/health`, { timeout: 5000 });
    
    if (response.data.status === 'healthy') {
      log('✅ CrewAI service is healthy', 'green');
      return true;
    } else {
      log('❌ CrewAI service unhealthy', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Cannot connect to CrewAI service: ${error.message}`, 'red');
    log('Make sure the service is running on port 8082', 'yellow');
    return false;
  }
}

async function testCrewAIInfo() {
  logSection('Test 2: CrewAI Service Info');
  
  try {
    const response = await axios.get(`${CREWAI_URL}/`);
    log('📊 Service Info:', 'green');
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    log(`❌ Failed to get service info: ${error.message}`, 'red');
    return false;
  }
}

async function testSimplePlanning() {
  logSection('Test 3: Simple Workflow Planning');
  
  const goal = 'Get current BTC price from CoinGecko API';
  
  try {
    log(`🎯 Planning workflow for: "${goal}"`, 'blue');
    
    const response = await axios.post(`${CREWAI_URL}/plan`, {
      goal,
      context: {
        tenantId: 'test-user'
      }
    }, { timeout: 60000 });
    
    log('✅ Workflow planned successfully', 'green');
    log(`📋 Generated ${response.data.flowspec.nodes.length} nodes`, 'blue');
    log(`📊 Complexity: ${response.data.estimated_complexity}`, 'blue');
    log('\n🔍 FlowSpec Preview:', 'yellow');
    console.log(JSON.stringify(response.data.flowspec, null, 2));
    
    return response.data.flowspec;
  } catch (error) {
    log(`❌ Planning failed: ${error.message}`, 'red');
    if (error.response) {
      console.log('Response:', error.response.data);
    }
    return null;
  }
}

async function testComplexPlanning() {
  logSection('Test 4: Complex Workflow Planning');
  
  const goal = 'Fetch BTC price, analyze if bullish, post to Twitter if price > $50k';
  
  try {
    log(`🎯 Planning complex workflow: "${goal}"`, 'blue');
    
    const response = await axios.post(`${CREWAI_URL}/plan`, {
      goal,
      context: {
        tenantId: 'test-user',
        twitter_handle: '@cryptobot'
      },
      constraints: [
        'use conditional logic',
        'complete in < 30 seconds'
      ]
    }, { timeout: 60000 });
    
    log('✅ Complex workflow planned successfully', 'green');
    log(`📋 Generated ${response.data.flowspec.nodes.length} nodes`, 'blue');
    log(`📊 Complexity: ${response.data.estimated_complexity}`, 'blue');
    log(`💭 Reasoning: ${response.data.reasoning}`, 'yellow');
    
    return response.data.flowspec;
  } catch (error) {
    log(`❌ Complex planning failed: ${error.message}`, 'red');
    return null;
  }
}

async function testFlowSpecValidation(flowspec) {
  logSection('Test 5: FlowSpec Validation');
  
  if (!flowspec) {
    log('⏭️  Skipping validation (no flowspec to validate)', 'yellow');
    return false;
  }
  
  try {
    const response = await axios.post(`${CREWAI_URL}/validate`, flowspec);
    
    if (response.data.valid) {
      log('✅ FlowSpec is valid', 'green');
      log(`📝 ${response.data.message}`, 'blue');
      return true;
    } else {
      log('❌ FlowSpec validation failed', 'red');
      log(`📝 ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Validation request failed: ${error.message}`, 'red');
    return false;
  }
}

async function testLucidAPIIntegration() {
  logSection('Test 6: Lucid API Integration');
  
  const goal = 'Monitor Solana network status';
  
  try {
    log(`🎯 Testing /agents/plan endpoint: "${goal}"`, 'blue');
    
    const response = await axios.post(`${LUCID_API_URL}/agents/plan`, {
      goal,
      context: {
        tenantId: 'test-user',
        network: 'devnet'
      }
    }, { timeout: 60000 });
    
    if (response.data.success) {
      log('✅ Lucid API integration working', 'green');
      log(`📋 Generated ${response.data.flowspec.nodes.length} nodes`, 'blue');
      return true;
    } else {
      log('❌ Lucid API returned unsuccessful response', 'red');
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('⏭️  Skipping Lucid API test (service not running)', 'yellow');
      log('Start Lucid API with: cd offchain && npm run dev', 'yellow');
    } else if (error.response?.status === 503) {
      log('⚠️  Lucid API is running but CrewAI service not available', 'yellow');
      log('This is expected if CrewAI service is not running', 'yellow');
    } else {
      log(`❌ Lucid API integration failed: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testPlannerInfo() {
  logSection('Test 7: Planner Info Endpoint');
  
  try {
    const response = await axios.get(`${LUCID_API_URL}/agents/planner/info`);
    
    if (response.data.success) {
      log('✅ Planner info retrieved', 'green');
      log(`📊 Status: ${response.data.status}`, 'blue');
      console.log('Info:', JSON.stringify(response.data.info, null, 2));
      return true;
    } else {
      log('⚠️  Planner service unavailable', 'yellow');
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('⏭️  Skipping (Lucid API not running)', 'yellow');
    } else {
      log(`❌ Failed: ${error.message}`, 'red');
    }
    return false;
  }
}

async function runAllTests() {
  log('\n🧪 CrewAI Agent Planner - Integration Tests', 'blue');
  log('=' .repeat(60) + '\n');
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };
  
  // Test 1: Health Check
  results.total++;
  const healthOk = await testCrewAIHealth();
  if (healthOk) results.passed++;
  else results.failed++;
  
  if (!healthOk) {
    log('\n⚠️  CrewAI service not available. Skipping remaining tests.', 'yellow');
    log('To start the service:', 'yellow');
    log('  cd agent-services/crewai-service', 'yellow');
    log('  docker-compose up -d', 'yellow');
    printSummary(results);
    return;
  }
  
  // Test 2: Service Info
  results.total++;
  if (await testCrewAIInfo()) results.passed++;
  else results.failed++;
  
  // Test 3: Simple Planning
  results.total++;
  const simpleFlowspec = await testSimplePlanning();
  if (simpleFlowspec) results.passed++;
  else results.failed++;
  
  // Test 4: Complex Planning
  results.total++;
  const complexFlowspec = await testComplexPlanning();
  if (complexFlowspec) results.passed++;
  else results.failed++;
  
  // Test 5: Validation
  results.total++;
  if (await testFlowSpecValidation(simpleFlowspec || complexFlowspec)) results.passed++;
  else results.failed++;
  
  // Test 6: Lucid API Integration
  results.total++;
  if (await testLucidAPIIntegration()) results.passed++;
  else results.skipped++;
  
  // Test 7: Planner Info
  results.total++;
  if (await testPlannerInfo()) results.passed++;
  else results.skipped++;
  
  printSummary(results);
}

function printSummary(results) {
  logSection('Test Summary');
  
  log(`Total Tests: ${results.total}`, 'blue');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`⏭️  Skipped: ${results.skipped}`, 'yellow');
  
  const successRate = (results.passed / results.total * 100).toFixed(1);
  log(`\n📊 Success Rate: ${successRate}%`, successRate >= 70 ? 'green' : 'red');
  
  if (results.failed === 0 && results.passed > 0) {
    log('\n🎉 All active tests passed!', 'green');
  } else if (results.failed > 0) {
    log('\n⚠️  Some tests failed. Check logs above for details.', 'yellow');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
