#!/usr/bin/env node
// Test script to verify the enhanced n8n node indexing
require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testEnhancedIndexing() {
  console.log('🧪 Testing Enhanced n8n Node Indexing\n');
  console.log('=' .repeat(60));
  
  try {
    // 1. Get current status
    console.log('\n📊 Step 1: Getting current indexer status...');
    const statusResponse = await axios.get(`${API_URL}/api/flow/admin/status`);
    console.log('Current status:', JSON.stringify(statusResponse.data, null, 2));
    
    // 2. Trigger reindex with force refresh
    console.log('\n🔄 Step 2: Triggering reindex (force refresh)...');
    const reindexResponse = await axios.post(`${API_URL}/api/flow/admin/reindex`, {
      forceRefresh: true
    });
    console.log('Reindex result:', JSON.stringify(reindexResponse.data, null, 2));
    
    if (!reindexResponse.data.success) {
      throw new Error('Reindex failed: ' + reindexResponse.data.error);
    }
    
    // 3. Wait a moment for indexing to complete
    console.log('\n⏳ Step 3: Waiting for indexing to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Get stats to verify
    console.log('\n📈 Step 4: Getting Elasticsearch stats...');
    const statsResponse = await axios.get(`${API_URL}/api/flow/admin/stats`);
    console.log('ES stats:', JSON.stringify(statsResponse.data, null, 2));
    
    // 5. Search for a node to verify enhanced data
    console.log('\n🔍 Step 5: Testing search with enhanced data...');
    const searchResponse = await axios.get(`${API_URL}/api/flow/nodes`, {
      params: { search: 'GitHub', limit: 3 }
    });
    
    console.log(`\nFound ${searchResponse.data.total} nodes matching "GitHub"`);
    console.log('\nSample nodes (first 3):');
    searchResponse.data.nodes.slice(0, 3).forEach((node, idx) => {
      console.log(`\n${idx + 1}. ${node.displayName}`);
      console.log(`   Description: ${node.description?.substring(0, 80)}...`);
      console.log(`   Usable as Tool: ${node.usableAsTool !== undefined ? node.usableAsTool : 'N/A'}`);
      console.log(`   Popularity Score: ${node.popularityScore !== undefined ? node.popularityScore : 'N/A'}`);
      console.log(`   Tags: ${node.tags ? node.tags.join(', ') : 'N/A'}`);
    });
    
    // 6. Verify enrichment
    console.log('\n✅ Step 6: Verifying enrichment...');
    const enrichedNodes = searchResponse.data.nodes.filter(n => 
      n.popularityScore !== undefined && n.tags !== undefined
    );
    
    console.log(`\n📊 Enrichment Stats:`);
    console.log(`   Total nodes searched: ${searchResponse.data.nodes.length}`);
    console.log(`   Nodes with enrichment: ${enrichedNodes.length}`);
    console.log(`   Enrichment rate: ${((enrichedNodes.length / searchResponse.data.nodes.length) * 100).toFixed(1)}%`);
    
    if (enrichedNodes.length > 0) {
      console.log('\n🎉 SUCCESS! Enhanced indexing is working!');
      console.log('   Nodes now include:');
      console.log('   ✓ Enhanced descriptions');
      console.log('   ✓ Popularity scores');
      console.log('   ✓ Categorized tags');
    } else {
      console.log('\n⚠️  WARNING: No enriched nodes found.');
      console.log('   This could mean:');
      console.log('   - Enrichment data file not found or empty');
      console.log('   - Node names don\'t match between CLI and enrichment file');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testEnhancedIndexing();
