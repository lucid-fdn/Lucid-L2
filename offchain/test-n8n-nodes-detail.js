/**
 * Detailed test of the working /api/nodes endpoint
 */

const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMGZkMTEzZi00ZGU4LTRjM2YtYjdkZi1hY2JjMmRlOGQwM2EiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNjg4MDI2fQ.lXPWfxXIygw73SMJKm1Cx6dVIvG4SsOJj8We_d98mX4';

async function testNodesEndpoint() {
  try {
    console.log(`Testing: ${N8N_URL}/api/nodes\n`);
    
    const response = await axios.get(
      `${N8N_URL}/api/nodes`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': N8N_API_KEY
        },
        timeout: 5000
      }
    );

    console.log('Response Status:', response.status);
    console.log('Response Headers:', response.headers['content-type']);
    console.log('Response Data Type:', typeof response.data);
    console.log('Is Array:', Array.isArray(response.data));
    console.log('\nFull Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Try to parse if it's a string
    if (typeof response.data === 'string') {
      try {
        const parsed = JSON.parse(response.data);
        console.log('\n\nParsed Response:');
        console.log(JSON.stringify(parsed, null, 2).substring(0, 1000));
      } catch (e) {
        console.log('Not JSON string, raw content:', response.data.substring(0, 500));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (axios.isAxiosError(error)) {
      console.error('Response:', error.response?.data);
    }
  }
}

testNodesEndpoint();
