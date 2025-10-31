#!/usr/bin/env node
/**
 * FlowSpec API Test Suite
 * 
 * Comprehensive testing for /flowspec/create and /flowspec/execute endpoints
 * Tests workflow creation, execution, and validation with real results
 */

// Load environment variables from .env file
require('dotenv').config();

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const TENANT_ID = 'test-' + Date.now();

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Created workflow IDs for cleanup
const createdWorkflows = [];

// Utility functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'cyan');
}

function warning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function section(title) {
  log(`\n${'='.repeat(60)}`, 'bright');
  log(`  ${title}`, 'bright');
  log(`${'='.repeat(60)}`, 'bright');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Pre-flight checks
async function checkPrerequisites() {
  section('Pre-flight Checks');
  
  const checks = [];
  
  // Check Docker
  try {
    await execAsync('docker --version');
    success('Docker is installed');
    checks.push({ name: 'Docker', status: 'pass' });
  } catch (err) {
    error('Docker is not installed or not in PATH');
    checks.push({ name: 'Docker', status: 'fail', error: err.message });
  }
  
  // Check n8n container
  try {
    const { stdout } = await execAsync('docker ps --filter "name=n8n" --format "{{.Names}}"');
    if (stdout.trim()) {
      success(`n8n container running: ${stdout.trim()}`);
      checks.push({ name: 'n8n Container', status: 'pass' });
    } else {
      warning('n8n container not found - some tests may fail');
      checks.push({ name: 'n8n Container', status: 'warn', message: 'Not running' });
    }
  } catch (err) {
    warning('Could not check n8n container status');
    checks.push({ name: 'n8n Container', status: 'warn', error: err.message });
  }
  
  // Check API server
  try {
    const response = await axios.get(`${API_BASE_URL}/system/status`, { timeout: 5000 });
    if (response.data.success) {
      success(`API server accessible at ${API_BASE_URL}`);
      checks.push({ name: 'API Server', status: 'pass' });
    } else {
      error('API server returned error');
      checks.push({ name: 'API Server', status: 'fail', message: 'Server error' });
    }
  } catch (err) {
    error(`Cannot connect to API server at ${API_BASE_URL}`);
    error(`Error: ${err.message}`);
    checks.push({ name: 'API Server', status: 'fail', error: err.message });
    throw new Error('API server not accessible - cannot proceed with tests');
  }
  
  // Check n8n API
  try {
    const response = await axios.get(`${N8N_URL}/healthz`, { timeout: 5000 });
    success(`n8n API accessible at ${N8N_URL}`);
    checks.push({ name: 'n8n API', status: 'pass' });
  } catch (err) {
    warning(`n8n API may not be accessible at ${N8N_URL}`);
    warning('Some tests may fail if n8n is not properly configured');
    checks.push({ name: 'n8n API', status: 'warn', error: err.message });
  }
  
  // Check environment variables
  const requiredEnvVars = ['N8N_URL', 'N8N_HMAC_SECRET'];
  const optionalEnvVars = ['N8N_API_KEY', 'OPENAI_API_KEY'];
  
  info('\nEnvironment Variables:');
  requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
      success(`  ${varName}: Set`);
      checks.push({ name: `Env: ${varName}`, status: 'pass' });
    } else {
      error(`  ${varName}: Not set (REQUIRED)`);
      checks.push({ name: `Env: ${varName}`, status: 'fail', message: 'Not set' });
    }
  });
  
  optionalEnvVars.forEach(varName => {
    if (process.env[varName]) {
      success(`  ${varName}: Set (optional)`);
    } else {
      warning(`  ${varName}: Not set (optional - some tests may be skipped)`);
    }
  });
  
  log('');
  return checks;
}

// Test workflow creation
async function testWorkflowCreate(name, flowspec) {
  results.total++;
  const testResult = { name, status: 'pending', startTime: Date.now() };
  
  try {
    info(`\nCreating workflow: ${name}`);
    
    const response = await axios.post(
      `${API_BASE_URL}/flowspec/create`,
      flowspec,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    if (response.data.success && response.data.workflowId) {
      const workflowId = response.data.workflowId;
      createdWorkflows.push(workflowId);
      
      success(`Created workflow: ${workflowId}`);
      info(`  URL: ${response.data.workflowUrl}`);
      
      testResult.status = 'pass';
      testResult.workflowId = workflowId;
      testResult.url = response.data.workflowUrl;
      results.passed++;
      
      return { success: true, workflowId, data: response.data };
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (err) {
    error(`Failed to create workflow: ${err.message}`);
    if (err.response?.data) {
      error(`  Server error: ${JSON.stringify(err.response.data)}`);
      testResult.error = err.response.data;
    }
    testResult.status = 'fail';
    testResult.error = err.message;
    results.failed++;
    return { success: false, error: err.message };
  } finally {
    testResult.endTime = Date.now();
    testResult.duration = testResult.endTime - testResult.startTime;
    results.tests.push(testResult);
  }
}

// Test workflow execution
async function testWorkflowExecute(name, workflowId, context) {
  results.total++;
  const testResult = { name, status: 'pending', startTime: Date.now(), workflowId };
  
  try {
    info(`\nExecuting workflow: ${name} (ID: ${workflowId})`);
    
    // Wait a bit for workflow to be ready
    await sleep(2000);
    
    const response = await axios.post(
      `${API_BASE_URL}/flowspec/execute`,
      {
        workflowId,
        context: {
          tenantId: TENANT_ID,
          ...context
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );
    
    if (response.data.success) {
      success(`Execution completed successfully`);
      info(`  Execution ID: ${response.data.executionId}`);
      info(`  Duration: ${response.data.duration}ms`);
      
      if (response.data.outputs) {
        info(`  Outputs: ${JSON.stringify(response.data.outputs, null, 2)}`);
      }
      
      testResult.status = 'pass';
      testResult.executionId = response.data.executionId;
      testResult.executionDuration = response.data.duration;
      testResult.outputs = response.data.outputs;
      results.passed++;
      
      return { success: true, data: response.data };
    } else {
      throw new Error(response.data.errors?.join(', ') || 'Execution failed');
    }
  } catch (err) {
    error(`Execution failed: ${err.message}`);
    if (err.response?.data) {
      error(`  Server response: ${JSON.stringify(err.response.data, null, 2)}`);
      testResult.error = err.response.data;
    }
    testResult.status = 'fail';
    testResult.error = err.message;
    results.failed++;
    return { success: false, error: err.message };
  } finally {
    testResult.endTime = Date.now();
    testResult.duration = testResult.endTime - testResult.startTime;
    results.tests.push(testResult);
  }
}

// Test execution history
async function testExecutionHistory(workflowId) {
  results.total++;
  const testResult = { 
    name: `Get execution history for workflow ${workflowId}`, 
    status: 'pending', 
    startTime: Date.now() 
  };
  
  try {
    info(`\nFetching execution history for workflow: ${workflowId}`);
    
    const response = await axios.get(
      `${API_BASE_URL}/flowspec/history/${workflowId}?limit=5`,
      { timeout: 10000 }
    );
    
    if (response.data.success) {
      success(`Retrieved ${response.data.history.length} execution records`);
      
      response.data.history.forEach((exec, idx) => {
        info(`  [${idx + 1}] ${exec.id} - ${exec.finished ? 'Completed' : 'Running/Failed'}`);
        if (exec.startedAt) {
          info(`      Started: ${new Date(exec.startedAt).toISOString()}`);
        }
      });
      
      testResult.status = 'pass';
      testResult.historyCount = response.data.history.length;
      results.passed++;
      
      return { success: true, data: response.data };
    } else {
      throw new Error('Failed to retrieve history');
    }
  } catch (err) {
    error(`Failed to get execution history: ${err.message}`);
    testResult.status = 'fail';
    testResult.error = err.message;
    results.failed++;
    return { success: false, error: err.message };
  } finally {
    testResult.endTime = Date.now();
    testResult.duration = testResult.endTime - testResult.startTime;
    results.tests.push(testResult);
  }
}

// Cleanup created workflows
async function cleanup() {
  section('Cleanup');
  
  if (createdWorkflows.length === 0) {
    info('No workflows to clean up');
    return;
  }
  
  info(`Cleaning up ${createdWorkflows.length} test workflows...`);
  
  for (const workflowId of createdWorkflows) {
    try {
      await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
      success(`Deleted workflow: ${workflowId}`);
    } catch (err) {
      warning(`Failed to delete workflow ${workflowId}: ${err.message}`);
    }
  }
}

// Generate test report
function generateReport() {
  section('Test Report');
  
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  log(`\nTotal Tests: ${results.total}`, 'bright');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`Skipped: ${results.skipped}`, 'yellow');
  log(`Success Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'red');
  
  log('\nDetailed Results:', 'bright');
  results.tests.forEach((test, idx) => {
    const statusColor = test.status === 'pass' ? 'green' : test.status === 'fail' ? 'red' : 'yellow';
    log(`\n[${idx + 1}] ${test.name}`, 'bright');
    log(`    Status: ${test.status.toUpperCase()}`, statusColor);
    log(`    Duration: ${test.duration}ms`);
    
    if (test.workflowId) {
      log(`    Workflow ID: ${test.workflowId}`);
    }
    if (test.executionId) {
      log(`    Execution ID: ${test.executionId}`);
    }
    if (test.error) {
      log(`    Error: ${test.error}`, 'red');
    }
  });
  
  // Save results to file
  const reportFile = `test-results-${Date.now()}.json`;
  const fs = require('fs');
  fs.writeFileSync(reportFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped,
      successRate: passRate
    },
    tests: results.tests
  }, null, 2));
  
  info(`\nDetailed results saved to: ${reportFile}`);
  
  return passRate >= 80;
}

// Main test suite
async function runTests() {
  log('\n');
  log('═══════════════════════════════════════════════════════════', 'bright');
  log('          FlowSpec API Test Suite', 'bright');
  log('═══════════════════════════════════════════════════════════', 'bright');
  log('');
  
  try {
    // Pre-flight checks
    await checkPrerequisites();
    
    // Test 1: Echo Workflow
    section('Test 1: Echo Workflow (Basic)');
    info('Tests basic workflow creation and execution with data transformation');
    
    const echoFlowSpec = {
      name: 'Test Echo Workflow',
      description: 'Simple echo test with data transformation',
      nodes: [
        {
          id: 'webhook',
          type: 'webhook',
          config: {
            path: 'test-echo',
            method: 'POST'
          }
        },
        {
          id: 'transform',
          type: 'transform',
          config: {
            code: 'return [{ json: { message: items[0].json.input, timestamp: new Date().toISOString(), echo: true } }];'
          }
        }
      ],
      edges: [
        { from: 'webhook', to: 'transform' }
      ]
    };
    
    const echoCreate = await testWorkflowCreate('Echo Workflow - Create', echoFlowSpec);
    
    if (echoCreate.success) {
      await testWorkflowExecute(
        'Echo Workflow - Execute',
        echoCreate.workflowId,
        {
          variables: {
            input: 'Hello from FlowSpec test suite!'
          }
        }
      );
      
      await testExecutionHistory(echoCreate.workflowId);
    }
    
    // Test 2: HTTP API Call
    section('Test 2: HTTP API Integration');
    info('Tests external API call with real data from GitHub');
    
    const httpFlowSpec = {
      name: 'Test HTTP API Workflow',
      description: 'Fetches data from GitHub API',
      nodes: [
        {
          id: 'trigger',
          type: 'webhook',
          config: {
            path: 'test-http',
            method: 'POST'
          }
        },
        {
          id: 'fetch',
          type: 'tool.http',
          config: {
            url: 'https://api.github.com/repos/nodejs/node',
            method: 'GET'
          }
        }
      ],
      edges: [
        { from: 'trigger', to: 'fetch' }
      ]
    };
    
    const httpCreate = await testWorkflowCreate('HTTP API - Create', httpFlowSpec);
    
    if (httpCreate.success) {
      await testWorkflowExecute(
        'HTTP API - Execute',
        httpCreate.workflowId,
        {
          variables: {
            repo: 'nodejs/node'
          }
        }
      );
    }
    
    // Test 3: Conditional Branch
    section('Test 3: Conditional Workflow');
    info('Tests branching logic based on input conditions');
    
    const branchFlowSpec = {
      name: 'Test Conditional Branch',
      description: 'Routes based on input type',
      nodes: [
        {
          id: 'start',
          type: 'webhook',
          config: {
            path: 'test-branch',
            method: 'POST'
          }
        },
        {
          id: 'branch',
          type: 'branch',
          config: {
            condition: '{{ $json.priority === "high" }}'
          }
        },
        {
          id: 'high_priority',
          type: 'transform',
          config: {
            code: 'return [{ json: { status: "urgent", priority: items[0].json.priority } }];'
          }
        },
        {
          id: 'normal_priority',
          type: 'transform',
          config: {
            code: 'return [{ json: { status: "normal", priority: items[0].json.priority } }];'
          }
        }
      ],
      edges: [
        { from: 'start', to: 'branch' },
        { from: 'branch', to: 'high_priority', when: 'true' },
        { from: 'branch', to: 'normal_priority', when: 'false' }
      ]
    };
    
    const branchCreate = await testWorkflowCreate('Branch Workflow - Create', branchFlowSpec);
    
    if (branchCreate.success) {
      await testWorkflowExecute(
        'Branch Workflow - Execute (High Priority)',
        branchCreate.workflowId,
        {
          variables: {
            priority: 'high',
            message: 'Urgent task'
          }
        }
      );
      
      await testWorkflowExecute(
        'Branch Workflow - Execute (Normal Priority)',
        branchCreate.workflowId,
        {
          variables: {
            priority: 'normal',
            message: 'Regular task'
          }
        }
      );
    }
    
    // Cleanup
    await cleanup();
    
    // Generate report
    const success = generateReport();
    
    log('\n');
    if (success) {
      log('✓ TEST SUITE PASSED', 'green');
    } else {
      log('✗ TEST SUITE FAILED', 'red');
    }
    log('\n');
    
    process.exit(success ? 0 : 1);
    
  } catch (err) {
    error(`\nFATAL ERROR: ${err.message}`);
    error(err.stack);
    process.exit(1);
  }
}

// Run the test suite
if (require.main === module) {
  runTests().catch(err => {
    error(`Unhandled error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runTests, testWorkflowCreate, testWorkflowExecute };
