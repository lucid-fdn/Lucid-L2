#!/usr/bin/env node
/**
 * FlowSpec Test with File Output - Proof of Execution
 * 
 * Creates a workflow that writes to a file to prove execution worked
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const OUTPUT_FILE = path.join(__dirname, 'test-output.txt');
const TENANT_ID = 'test-' + Date.now();

console.log('\n🧪 FlowSpec File Output Test\n');
console.log('This test will:');
console.log('1. Create a workflow that writes to a file');
console.log('2. Execute the workflow');
console.log('3. Verify the file was created with correct content\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFileTest() {
  let workflowId = null;
  
  try {
    // Clean up any existing test file
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
      console.log('✓ Cleaned up existing test file');
    }
    
    // Create workflow
    console.log('\n📝 Creating workflow that writes to file...');
    const testMessage = `FlowSpec Test - ${new Date().toISOString()}`;
    
    const flowspec = {
      name: 'File Writer Test',
      description: 'Writes output to a file to prove execution',
      nodes: [
        {
          id: 'webhook',
          type: 'webhook',
          config: {
            path: 'file-test',
            method: 'POST'
          }
        },
        {
          id: 'write_file',
          type: 'transform',
          config: {
            code: `
              const fs = require('fs');
              const message = items[0].json.message;
              const timestamp = new Date().toISOString();
              const content = \`Message: \${message}\\nTimestamp: \${timestamp}\\nStatus: SUCCESS\\n\`;
              
              fs.writeFileSync('${OUTPUT_FILE}', content);
              
              return [{ 
                json: { 
                  success: true, 
                  message: 'File written successfully',
                  path: '${OUTPUT_FILE}',
                  content: content
                } 
              }];
            `
          }
        }
      ],
      edges: [
        { from: 'webhook', to: 'write_file' }
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
    
    if (!createResponse.data.success) {
      throw new Error('Failed to create workflow');
    }
    
    workflowId = createResponse.data.workflowId;
    console.log(`✓ Workflow created: ${workflowId}`);
    console.log(`  URL: ${createResponse.data.workflowUrl}`);
    
    // Wait for workflow to be ready
    await sleep(2000);
    
    // Execute workflow
    console.log('\n▶️  Executing workflow...');
    const execResponse = await axios.post(
      `${API_BASE_URL}/flowspec/execute`,
      {
        workflowId,
        context: {
          tenantId: TENANT_ID,
          variables: {
            message: testMessage
          }
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );
    
    console.log(`✓ Execution completed in ${execResponse.data.duration}ms`);
    
    if (execResponse.data.outputs) {
      console.log('  Output:', JSON.stringify(execResponse.data.outputs, null, 2));
    }
    
    // Verify file was created
    console.log('\n🔍 Verifying file output...');
    await sleep(1000); // Give filesystem a moment
    
    if (!fs.existsSync(OUTPUT_FILE)) {
      throw new Error(`File not found: ${OUTPUT_FILE}`);
    }
    
    const fileContent = fs.readFileSync(OUTPUT_FILE, 'utf8');
    console.log('✓ File created successfully!');
    console.log('\n📄 File contents:');
    console.log('─'.repeat(60));
    console.log(fileContent);
    console.log('─'.repeat(60));
    
    // Verify content
    if (!fileContent.includes(testMessage)) {
      throw new Error('File content does not match expected message');
    }
    
    if (!fileContent.includes('Status: SUCCESS')) {
      throw new Error('File does not contain success status');
    }
    
    console.log('\n✅ VERIFICATION COMPLETE');
    console.log('   The workflow successfully:');
    console.log('   1. Created and activated in n8n');
    console.log('   2. Executed with input data');
    console.log('   3. Produced real output (file written)');
    console.log(`   4. File location: ${OUTPUT_FILE}`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    if (workflowId) {
      await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
      console.log(`✓ Deleted workflow: ${workflowId}`);
    }
    
    console.log('\n🎉 TEST PASSED - FlowSpec routes are working correctly!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Server response:', error.response.data);
    }
    
    // Cleanup on failure
    if (workflowId) {
      try {
        await axios.delete(`${API_BASE_URL}/flowspec/delete/${workflowId}`);
        console.log(`Cleaned up workflow: ${workflowId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    process.exit(1);
  }
}

runFileTest();
