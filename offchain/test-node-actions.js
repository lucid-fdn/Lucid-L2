/**
 * Test script to show node actions/operations
 */

const axios = require('axios');

async function testNodeActions() {
  try {
    // Fetch Airtable node
    const response = await axios.get('http://localhost:3001/api/flow/nodes?search=airtable');
    
    const airtableNode = response.data.nodes[1];
    
    if (!airtableNode) {
      console.log('Airtable node not found');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`NODE: ${airtableNode.displayName} (${airtableNode.name})`);
    console.log('='.repeat(60));
    console.log(`Description: ${airtableNode.description}`);
    console.log(`Version: ${JSON.stringify(airtableNode.version)}`);
    console.log(`Group: ${JSON.stringify(airtableNode.group)}`);
    console.log(`Usable as Tool: ${airtableNode.usableAsTool}`);
    
    // Check if properties are included
    if (airtableNode.properties) {
      console.log(`\n📊 Total Properties: ${airtableNode.properties.length}`);
      
      // Find Resource and Operation properties
      const resourceProp = airtableNode.properties.find(p => p.name === 'resource');
      const operationProp = airtableNode.properties.find(p => p.name === 'operation');
      
      if (resourceProp && resourceProp.options) {
        console.log('\n📋 RESOURCES:');
        resourceProp.options.forEach(opt => {
          console.log(`  - ${opt.name} (${opt.value})`);
        });
      }
      
      if (operationProp && operationProp.options) {
        console.log('\n⚙️  OPERATIONS:');
        operationProp.options.forEach(opt => {
          console.log(`  - ${opt.name} (${opt.value})`);
        });
      }
    } else {
      console.log('\n⚠️  Properties not included in response');
      console.log('The API is currently filtering out the properties field.');
      console.log('Properties contain all the actions, resources, and form fields for each node.');
    }
    
    console.log(`\n🖼️  Icon URL: http://localhost:3001/api/n8n/icon/${airtableNode.iconUrl}`);
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testNodeActions();
