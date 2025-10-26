#!/usr/bin/env node

/**
 * Script to fetch workflow nodes from the API and organize them by category and popularity
 * Usage: node organize-nodes.js
 * Output: organized-nodes.json
 */

const http = require('http');
const fs = require('fs');

// Configuration
const API_URL = 'http://localhost:3001/api/flow/nodes';
const OUTPUT_FILE = 'organized-nodes.json';
const TOP_N_NODES = 796;

// Category mapping - organize nodes by function
const CATEGORY_MAPPING = {
  'Core Nodes': ['Core Nodes'],
  'AI': ['AI'],
  'Integration': ['Data & Storage', 'Sales', 'Marketing'],
  'Communication': ['Communication'],
  'Development': ['Development', 'Developer Tools'],
  'Productivity': ['Productivity'],
  'Analytics': ['Analytics'],
  'Other': ['Miscellaneous', 'Utility', 'Finance & Accounting', 'HITL']
};

// Remove n8n mentions from text
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/n8n/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate popularity score for a node
function calculatePopularity(node) {
  let score = 0;
  
  const nodeCategories = node.codex?.categories || [];
  const nodeName = (node.displayName || node.name || '').toLowerCase();
  
  // ACTUAL AI PROVIDERS get massive priority (OpenAI, Anthropic, Gemini, etc.)
  const aiProviders = ['openai', 'anthropic', 'gemini', 'claude', 'cohere', 'hugging face', 
                        'mistral', 'palm', 'llama', 'bedrock', 'azure openai', 'vertex'];
  const isActualAIProvider = aiProviders.some(provider => nodeName.includes(provider));
  
  if (isActualAIProvider) {
    score += 500; // Overwhelming priority for actual AI providers
  } else if (nodeCategories.includes('AI')) {
    // Other AI category nodes (like "Tool" nodes) get less priority
    score += 100;
  }
  
  // Prioritize nodes usable as tools (very important for automation)
  if (node.usableAsTool) score += 50;
  
  // Core nodes are essential
  if (nodeCategories.includes('Core Nodes')) score += 40;
  
  // Popular categories for integrations
  const popularCategories = ['Communication', 'Development', 'Data & Storage'];
  if (nodeCategories.some(cat => popularCategories.includes(cat))) score += 30;
  
  // Versatility - more operations = more useful
  if (node.properties) {
    score += Math.min(node.properties.length, 20);
  }
  
  // External integrations are valuable
  if (node.credentials && node.credentials.length > 0) score += 15;
  
  // Documentation availability
  if (node.codex?.resources) score += 10;
  
  // Bonus for input/output nodes
  if (node.group) {
    if (node.group.includes('trigger')) score += 25;
    if (node.group.includes('input')) score += 15;
    if (node.group.includes('output')) score += 15;
  }
  
  return score;
}

// Map node to a primary category
function getPrimaryCategory(node) {
  const nodeCategories = node.codex?.categories || [];
  
  // Check each category mapping in priority order
  for (const [mainCat, subCats] of Object.entries(CATEGORY_MAPPING)) {
    if (nodeCategories.some(cat => subCats.includes(cat))) {
      return mainCat;
    }
  }
  
  return 'Other';
}

// Fetch nodes from API
function fetchNodes(limit = 1000) {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}?limit=${limit}`;
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success && json.nodes) {
            resolve(json.nodes);
          } else {
            reject(new Error('Invalid API response format'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Main processing function
async function organizeNodes() {
  console.log('🔄 Fetching nodes from API...');
  
  try {
    const allNodes = await fetchNodes();
    console.log(`✓ Fetched ${allNodes.length} nodes`);
    
    console.log('🧮 Calculating popularity scores...');
    
    // Score and clean all nodes
    const scoredNodes = allNodes.map(node => ({
      name: cleanText(node.displayName || node.name),
      description: cleanText(node.description || ''),
      category: getPrimaryCategory(node),
      icon: node.iconUrl || node.icon || '',
      usableAsTool: node.usableAsTool || false,
      credentials: node.credentials?.map(c => c.name) || [],
      operations: node.properties?.filter(p => p.name === 'operation').length || 0,
      popularityScore: calculatePopularity(node),
      originalName: node.name,
      version: node.version
    }));
    
    // Sort by popularity and take top N
    scoredNodes.sort((a, b) => b.popularityScore - a.popularityScore);
    const topNodes = scoredNodes.slice(0, TOP_N_NODES);
    
    console.log(`✓ Selected top ${TOP_N_NODES} nodes`);
    
    // Organize by category
    const organized = {
      success: true,
      totalNodes: TOP_N_NODES,
      generatedAt: new Date().toISOString(),
      categories: {}
    };
    
    // Initialize categories
    Object.keys(CATEGORY_MAPPING).forEach(cat => {
      organized.categories[cat] = [];
    });
    
    // Distribute nodes into categories
    topNodes.forEach(node => {
      organized.categories[node.category].push({
        name: node.name,
        description: node.description,
        usableAsTool: node.usableAsTool,
        popularityScore: node.popularityScore
      });
    });
    
    // Remove empty categories
    Object.keys(organized.categories).forEach(cat => {
      if (organized.categories[cat].length === 0) {
        delete organized.categories[cat];
      }
    });
    
    // Add statistics
    organized.statistics = {
      byCategory: {},
      topCredentials: {}
    };
    
    Object.entries(organized.categories).forEach(([cat, nodes]) => {
      organized.statistics.byCategory[cat] = nodes.length;
    });
    
    // Count most used credentials
    const credentialCount = {};
    topNodes.forEach(node => {
      node.credentials.forEach(cred => {
        credentialCount[cred] = (credentialCount[cred] || 0) + 1;
      });
    });
    
    organized.statistics.topCredentials = Object.entries(credentialCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {});
    
    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(organized, null, 2));
    console.log(`\n✅ Success! Organized nodes saved to ${OUTPUT_FILE}`);
    
    // Display summary
    console.log('\n📊 Summary:');
    console.log(`   Total nodes: ${TOP_N_NODES}`);
    console.log(`   Categories: ${Object.keys(organized.categories).length}`);
    console.log('\n   Nodes per category:');
    Object.entries(organized.statistics.byCategory).forEach(([cat, count]) => {
      console.log(`     - ${cat}: ${count}`);
    });
    
    console.log('\n   Top 5 most popular nodes:');
    topNodes.slice(0, 5).forEach((node, i) => {
      console.log(`     ${i + 1}. ${node.name} (score: ${node.popularityScore})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
organizeNodes();
