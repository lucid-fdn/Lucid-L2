const axios = require('axios');
const crypto = require('crypto');

const secret = '3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4';
const payload = {
  workflowType: 'llm-inference',
  text: 'Test n8n directly without API',
  model: 'openai-gpt35-turbo'
};

const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('📡 Calling n8n gateway directly...');
axios.post('http://localhost:5678/webhook/lucid-gateway', payload, {
  headers: {
    'Content-Type': 'application/json',
    'X-Signature': signature,
    'X-Tenant-Id': 'test'
  }
}).then(res => {
  console.log('✅ n8n Response:', JSON.stringify(res.data, null, 2));
  console.log('\n🎉 n8n is working! Check n8n UI → Executions tab to see the workflow run.');
}).catch(err => {
  console.error('❌ n8n Error:', err.response?.data || err.message);
  console.error('Full error:', err);
});
