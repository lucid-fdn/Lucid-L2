/**
 * Test script to find the correct n8n API endpoint for listing all nodes
 * Run: node test-n8n-nodes.js
 */

const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMGZkMTEzZi00ZGU4LTRjM2YtYjdkZi1hY2JjMmRlOGQwM2EiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNjg4MDI2fQ.lXPWfxXIygw73SMJKm1Cx6dVIvG4SsOJj8We_d98mX4';

const endpoints = [
  '/rest/node-types',
  '/api/v1/node-types',
  '/api/v1/nodes',
  '/types/nodes.json',
  '/rest/nodes',
  '/api/nodes',
  '/rest/node-types/all',
  '/rest/credentials/schema'
];

async function testEndpoint(endpoint) {
  try {
    console.log(`\n🔍 Testing: ${N8N_URL}${endpoint}`);
    
    const response = await axios.get(
      `${N8N_URL}${endpoint}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': N8N_API_KEY
        },
        timeout: 5000
      }
    );

    console.log(`✅ SUCCESS! Status: ${response.status}`);
    console.log(`   Response type: ${Array.isArray(response.data) ? 'Array' : typeof response.data}`);
    
    if (Array.isArray(response.data)) {
      console.log(`   Count: ${response.data.length} items`);
      if (response.data.length > 0) {
        console.log(`   Sample item keys:`, Object.keys(response.data[0]));
        console.log(`   First item:`, JSON.stringify(response.data[0], null, 2).substring(0, 200));
      }
    } else if (typeof response.data === 'object') {
      const keys = Object.keys(response.data);
      console.log(`   Object keys count: ${keys.length}`);
      console.log(`   First few keys:`, keys.slice(0, 5));
      if (keys.length > 0) {
        console.log(`   Sample value:`, JSON.stringify(response.data[keys[0]], null, 2).substring(0, 200));
      }
    }
    
    return { success: true, endpoint, data: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`❌ FAILED: ${error.response?.status || 'Network Error'} - ${error.response?.data?.message || error.message}`);
    } else {
      console.log(`❌ FAILED: ${error.message}`);
    }
    return { success: false, endpoint, error: error.message };
  }
}

async function main() {
  console.log('================================================');
  console.log('🚀 n8n Node Types Discovery Test');
  console.log('================================================');
  console.log(`n8n URL: ${N8N_URL}`);
  console.log(`API Key: ${N8N_API_KEY ? 'Configured' : 'Not Set'}`);
  console.log('================================================');

  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  console.log('\n\n================================================');
  console.log('📊 SUMMARY');
  console.log('================================================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful endpoints (${successful.length}):`);
  successful.forEach(r => {
    console.log(`   - ${r.endpoint}`);
  });
  
  console.log(`\n❌ Failed endpoints (${failed.length}):`);
  failed.forEach(r => {
    console.log(`   - ${r.endpoint}`);
  });

  if (successful.length > 0) {
    console.log('\n\n🎯 RECOMMENDED ENDPOINT:');
    console.log(`   ${successful[0].endpoint}`);
    console.log('\nYou can update the API to use this endpoint to fetch all n8n nodes.');
  } else {
    console.log('\n\n⚠️  No working endpoints found!');
    console.log('n8n may not expose node types via its public API.');
    console.log('Alternative: Extract from workflows (GET /api/v1/workflows)');
  }
}

main().catch(console.error);
