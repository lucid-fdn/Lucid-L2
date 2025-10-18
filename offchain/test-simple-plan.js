/**
 * Simple test for /agents/plan endpoint
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function testPlanEndpoint() {
  console.log('🧪 Testing /agents/plan endpoint...\n');
  
  try {
    const response = await axios.post(`${API_BASE}/api/agents/plan`, {
      goal: 'Fetch BTC price and analyze trend'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success!');
    console.log('\nResponse:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPlanEndpoint();
