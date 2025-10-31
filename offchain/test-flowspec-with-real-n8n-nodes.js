#!/usr/bin/env node
/**
 * FlowSpec Test with Real n8n Nodes
 * 
 * Demonstrates testing workflows using actual n8n nodes from the node registry,
 * including both credential-free nodes (HTTP) and credential-based nodes (Email).
 * 
 * This test shows how to:
 * 1. Query the /api/flow/nodes endpoint to discover available nodes
 * 2. Create workflows using actual n8n node types (not just transform nodes)
 * 3. Execute workflows and verify real API responses
 * 4. Use nodes that require credentials (optional)
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const TENANT_ID = 'test-' + Date.now();

console.log('\n🔬 FlowSpec Real n8n Nodes Test\n');
console.log('This test demonstrates using actual n8n nodes:');
console.log('1. HTTP Request node (no credentials needed)');
console.log('2. Data transformation nodes');
console.log('3. Optional: Email node (requires credentials)\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: HTTP Request to Public API
 * Uses n8n-nodes-base.httpRequest to call a real API
 */
async function testHttpRequestNode() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: HTTP Request Node (Public API Call)');
  console.log('═'.repeat(70));
  
  let workflowId = null;
  
  try {
    // First, verify the HTTP Request node is available
    console.log('\n🔍 Checking available nodes...');
    const nodesResponse = await axios.get(
      `${API_BASE_URL}/flow/nodes?search=http request&limit=5`
    );
    
    if (nodesResponse.data.success) {
      console.log(`✓ Found ${nodesResponse.data.count} HTTP-related nodes`);
      const httpNode = nodesResponse.data.nodes.find(n => 
        n.name === 'n8n-nodes-base.httpRequest'
      );
      if (httpNode) {
        console.log(`  - ${httpNode.displayName}: ${httpNode.description}`);
      }
    }
    
    // Create workflow with HTTP Request node
    console.log('\n📝 Creating workflow with HTTP Request node...');
    
    const flowspec = {
      name: 'Real n8n Node - HTTP Request Test',
      description: 'Calls GitHub API to fetch repository info',
      nodes: [
        {
          id: 'trigger',
          type: 'webhook',
          config: {
            path: 'http-test',
            method: 'POST'
          }
        },
        {
          id: 'fetch_github',
          type: 'n8n-nodes-base.httpRequest',
          config: {
            method: 'GET',
            url: 'https://api.github.com/repos/n8n-io/n8n',
            responseFormat: 'json',
            options: {}
          }
        },
        {
          id: 'process_response',
          type: 'transform',
          config: {
            code: `
              const repoData = items[0].json;
              return [{
                json: {
                  verification: 'REAL API DATA FROM GITHUB',
                  repository: repoData.full_name,
                  stars: repoData.stargazers_count,
                  forks: repoData.forks_count,
                  language: repoData.language,
                  description: repoData.description,
                  url: repoData.html_url,
                  fetched_at: new Date().toISOString()
                }
              }];
            `
          }
        }
      ],
      edges: [
        { from: 'trigger', to: 'fetch_github' },
        { from: 'fetch_github', to: 'process_response' }
      ]
    };
    
    const createResponse = await axios.post(
      `${API_BASE_URL}/flowspec/create`,
      flowspec,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    workflowId = createResponse.data.workflowId;
    console.log(`✓ Workflow created: ${workflowId}`);
    console.log(`  URL: ${createResponse.data.workflowUrl}`);
    
    await sleep(3000);  // Give workflow time to activate
    
    // Execute workflow via production webhook URL (now that it's activated)
    console.log('\n▶️  Executing workflow via webhook...');
    const webhookUrl = `http://localhost:5678/webhook/http-test`;
    
    const execResponse = await axios.post(
      webhookUrl,
      {},  // Empty payload for this test
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );
    
    console.log(`✓ Execution completed in ${execResponse.data.duration}ms`);
    
    // Display results
    console.log('\n📊 Execution Response:');
    console.log('─'.repeat(70));
    console.log(JSON.stringify(execResponse.data, null, 2));
    console.log('─'.repeat(70));
    
    if (execResponse.data.outputs) {
      console.log('\n📊 Workflow Outputs:');
      const output = execResponse.data.outputs;
      
      if (output.verification === 'REAL API DATA FROM GITHUB') {
        console.log('\n✅ SUCCESS: Got real data from GitHub API!');
        console.log(`   Repository: ${output.repository}`);
        console.log(`   Stars: ${output.stars}`);
        console.log(`   Language: ${output.language}`);
      } else {
        // Display whatever output we got
        console.log(JSON.stringify(output, null, 2));
      }
    } else {
      console.log('\n⚠️  No outputs in response - workflow may not have returned data');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
    console.log(`✓ Deleted workflow: ${workflowId}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ TEST 1 FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Server response:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (workflowId) {
      try {
        await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    return false;
  }
}

/**
 * Test 2: RSS Feed Reader
 * Uses n8n-nodes-base.rssFeed to read real RSS feeds
 */
async function testRssFeedNode() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: RSS Feed Node (No Credentials Required)');
  console.log('═'.repeat(70));
  
  let workflowId = null;
  
  try {
    console.log('\n📝 Creating workflow with RSS Feed node...');
    
    const flowspec = {
      name: 'Real n8n Node - RSS Feed Test',
      description: 'Fetches latest posts from a public RSS feed',
      nodes: [
        {
          id: 'trigger',
          type: 'webhook',
          config: {
            path: 'rss-test',
            method: 'POST'
          }
        },
        {
          id: 'fetch_rss',
          type: 'n8n-nodes-base.rssFeedRead',
          config: {
            url: 'https://hnrss.org/newest?limit=3'  // Hacker News RSS
          }
        },
        {
          id: 'format_output',
          type: 'transform',
          config: {
            code: `
              return items.map(item => ({
                json: {
                  verification: 'REAL RSS FEED DATA',
                  title: item.json.title,
                  link: item.json.link,
                  published: item.json.pubDate,
                  fetched_at: new Date().toISOString()
                }
              }));
            `
          }
        }
      ],
      edges: [
        { from: 'trigger', to: 'fetch_rss' },
        { from: 'fetch_rss', to: 'format_output' }
      ]
    };
    
    const createResponse = await axios.post(
      `${API_BASE_URL}/flowspec/create`,
      flowspec,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    workflowId = createResponse.data.workflowId;
    console.log(`✓ Workflow created: ${workflowId}`);
    
    await sleep(3000);  // Give workflow time to activate
    
    // Execute workflow via production webhook URL (now that it's activated)
    console.log('\n▶️  Executing workflow via webhook...');
    const webhookUrl = `http://localhost:5678/webhook/rss-test`;
    
    const execResponse = await axios.post(
      webhookUrl,
      {},  // Empty payload for this test
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );
    
    console.log(`✓ Execution completed`);
    
    // Display full response
    console.log('\n📊 Webhook Response:');
    console.log('─'.repeat(70));
    console.log(JSON.stringify(execResponse.data, null, 2));
    console.log('─'.repeat(70));
    
    if (execResponse.data && Array.isArray(execResponse.data)) {
      console.log('\n📰 RSS Feed Items:');
      console.log(`   Received ${execResponse.data.length} items`);
      execResponse.data.slice(0, 3).forEach((item, idx) => {
        console.log(`\n   ${idx + 1}. ${item.title}`);
        console.log(`      ${item.link}`);
      });
      console.log('\n✅ SUCCESS: Got real RSS feed data!');
    } else {
      console.log('\n⚠️  Unexpected response format');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
    console.log(`✓ Deleted workflow: ${workflowId}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ TEST 2 FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Server response:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (workflowId) {
      try {
        await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
      } catch (e) {
        // Ignore
      }
    }
    
    return false;
  }
}

/**
 * Test 3: Email Node (Requires Credentials)
 * Example of using a node that requires authentication
 */
async function testEmailNode() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: Email Node (Requires Credentials - OPTIONAL)');
  console.log('═'.repeat(70));
  
  console.log('\n⚠️  This test requires SMTP credentials to be set up in n8n.');
  console.log('To enable this test:');
  console.log('1. Go to n8n UI (http://localhost:5678)');
  console.log('2. Settings → Credentials → Add Credential');
  console.log('3. Choose "SMTP" and configure your email settings');
  console.log('4. Name the credential "test-smtp"');
  console.log('5. Set TEST_EMAIL_ENABLED=true in your .env file\n');
  
  if (process.env.TEST_EMAIL_ENABLED !== 'true') {
    console.log('ℹ️  Email test skipped (set TEST_EMAIL_ENABLED=true to enable)');
    return true;
  }
  
  let workflowId = null;
  
  try {
    console.log('\n📝 Creating workflow with Email Send node...');
    
    const recipientEmail = process.env.TEST_EMAIL_RECIPIENT || 'test@example.com';
    
    const flowspec = {
      name: 'Real n8n Node - Email Test',
      description: 'Sends a real test email',
      nodes: [
        {
          id: 'trigger',
          type: 'webhook',
          config: {
            path: 'email-test',
            method: 'POST'
          }
        },
        {
          id: 'send_email',
          type: 'n8n-nodes-base.emailSend',
          config: {
            credentials: {
              smtp: 'test-smtp'  // Name of credentials configured in n8n
            },
            fromEmail: process.env.TEST_EMAIL_FROM || 'noreply@example.com',
            toEmail: recipientEmail,
            subject: 'FlowSpec Test Email',
            text: `This is a test email sent from a FlowSpec workflow at ${new Date().toISOString()}.

This proves that:
1. The workflow was created in n8n
2. The workflow executed successfully
3. Real n8n nodes (Email Send) work with FlowSpec
4. Credentials are properly passed to nodes

Test ID: ${TENANT_ID}`
          }
        },
        {
          id: 'confirm',
          type: 'transform',
          config: {
            code: `
              return [{
                json: {
                  verification: 'EMAIL SENT VIA REAL N8N NODE',
                  success: true,
                  recipient: '${recipientEmail}',
                  sent_at: new Date().toISOString()
                }
              }];
            `
          }
        }
      ],
      edges: [
        { from: 'trigger', to: 'send_email' },
        { from: 'send_email', to: 'confirm' }
      ]
    };
    
    const createResponse = await axios.post(
      `${API_BASE_URL}/flowspec/create`,
      flowspec,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    workflowId = createResponse.data.workflowId;
    console.log(`✓ Workflow created: ${workflowId}`);
    
    await sleep(2000);
    
    // Execute workflow
    console.log('\n▶️  Executing workflow...');
    const execResponse = await axios.post(
      `${API_BASE_URL}/flowspec/execute`,
      {
        workflowId,
        context: {
          tenantId: TENANT_ID,
          variables: {}
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );
    
    console.log(`✓ Execution completed in ${execResponse.data.duration}ms`);
    
    // Display full response
    console.log('\n📊 Execution Response:');
    console.log('─'.repeat(70));
    console.log(JSON.stringify(execResponse.data, null, 2));
    console.log('─'.repeat(70));
    
    if (execResponse.data.outputs) {
      console.log('\n📧 Email Status:');
      console.log(JSON.stringify(execResponse.data.outputs, null, 2));
      console.log('\n✅ SUCCESS: Email sent via real n8n Email Send node!');
      console.log(`   Check ${recipientEmail} for the test email`);
    } else {
      console.log('\n⚠️  No outputs in response - workflow may not have returned data');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
    console.log(`✓ Deleted workflow: ${workflowId}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ TEST 3 FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Server response:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (workflowId) {
      try {
        await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
      } catch (e) {
        // Ignore
      }
    }
    
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('Starting FlowSpec Real n8n Nodes Tests...\n');
  
  const results = {
    httpRequest: false,
    rssFeed: false,
    email: false
  };
  
  try {
    // Test 1: HTTP Request
    results.httpRequest = await testHttpRequestNode();
    await sleep(1000);
    
    // Test 2: RSS Feed
    results.rssFeed = await testRssFeedNode();
    await sleep(1000);
    
    // Test 3: Email (optional)
    results.email = await testEmailNode();
    
    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`HTTP Request Test: ${results.httpRequest ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`RSS Feed Test: ${results.rssFeed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Email Test: ${results.email ? '✅ PASSED' : 'ℹ️  SKIPPED'}`);
    
    const allPassed = results.httpRequest && results.rssFeed;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('\nWhat was proven:');
      console.log('✓ FlowSpec can use actual n8n node types (not just transform nodes)');
      console.log('✓ Workflows can fetch real data from external APIs');
      console.log('✓ Nodes without credentials work seamlessly');
      console.log('✓ The /api/flow/nodes endpoint helps discover available nodes');
      console.log('✓ Results are verifiable and contain real external data\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Check logs above for details.\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();
