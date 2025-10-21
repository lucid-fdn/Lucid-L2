/**
 * Check /rest/settings for node information
 */

const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMGZkMTEzZi00ZGU4LTRjM2YtYjdkZi1hY2JjMmRlOGQwM2EiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNjg4MDI2fQ.lXPWfxXIygw73SMJKm1Cx6dVIvG4SsOJj8We_d98mX4';

async function checkSettings() {
  try {
    const response = await axios.get(
      `${N8N_URL}/rest/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': N8N_API_KEY
        }
      }
    );

    console.log('Full Settings Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSettings();
