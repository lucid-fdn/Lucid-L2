/**
 * Test n8n REST endpoints (what the editor UI actually uses)
 */

const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMGZkMTEzZi00ZGU4LTRjM2YtYjdkZi1hY2JjMmRlOGQwM2EiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNjg4MDI2fQ.lXPWfxXIygw73SMJKm1Cx6dVIvG4SsOJj8We_d98mX4';

// The HTML meta tag shows rest-endpoint is 'rest' (base64 decoded from 'cmVzdA==')
// So REST endpoints are at /rest/*

const restEndpoints = [
  '/rest/node-types',
  '/rest/node-types/nodes', 
  '/rest/node-types/credentials',
  '/rest/nodes-list',
  '/rest/workflows',
  '/rest/settings',
  '/rest/node-parameter-options'
];

async function testEndpoint(endpoint) {
  try {
    console.log(`\n🔍 Testing: ${N8N_URL}${endpoint}`);
    
    const response = await axios.get(
      `${N8N_URL}${endpoint}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': N8N_API_KEY,
          'Accept': 'application/json'
        },
        timeout: 5000,
        validateStatus: () => true // Don't throw on any status
      }
    );

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    
    if (response.status === 200) {
      const dataType = Array.isArray(response.data) ? 'Array' : typeof response.data;
      console.log(`   ✅ Data type: ${dataType}`);
      
      if (Array.isArray(response.data)) {
        console.log(`   Count: ${response.data.length}`);
        if (response.data.length > 0) {
          console.log(`   First item keys:`, Object.keys(response.data[0]).join(', '));
        }
      } else if (typeof response.data === 'object' && response.data !== null) {
        const keys = Object.keys(response.data);
        console.log(`   Keys: ${keys.length} properties`);
        console.log(`   Sample keys:`, keys.slice(0, 10).join(', '));
      }
      
      return { success: true, endpoint, status: response.status };
    } else {
      console.log(`   ❌ ${response.status} - ${response.data?.message || 'Failed'}`);
      return { success: false, endpoint, status: response.status };
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return { success: false, endpoint, error: error.message };
  }
}

async function main() {
  console.log('================================================');
  console.log('🚀 n8n REST Endpoints Discovery');
  console.log('================================================');
  console.log(`n8n URL: ${N8N_URL}`);
  console.log('================================================');

  const results = [];
  
  for (const endpoint of restEndpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n\n================================================');
  console.log('📊 RESULTS');
  console.log('================================================');
  
  const successful = results.filter(r => r.success);
  
  if (successful.length > 0) {
    console.log(`\n✅ Working endpoints (${successful.length}):`);
    successful.forEach(r => console.log(`   - ${r.endpoint}`));
  } else {
    console.log('\n❌ No working REST endpoints found.');
    console.log('\n💡 Recommendation: Use /api/v1/workflows to extract node types from existing workflows.');
  }
}

main().catch(console.error);
