/**
 * LucidLayer SDK - Search and Match Example
 * 
 * This example demonstrates how to search for models and compute,
 * then match them using policy-based routing.
 */

import { LucidClient } from '@lucidlayer/sdk';

async function main() {
  // Initialize the client
  const client = new LucidClient({
    baseUrl: process.env.LUCID_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.LUCID_API_KEY,
  });

  console.log('🔍 LucidLayer Search & Match Demo\n');

  try {
    // 1. Search for models
    console.log('📦 Searching for vLLM-compatible models...');
    const models = await client.search.models({
      runtime: 'vllm',
      max_vram: 24,
      per_page: 5,
    });

    if (models.length === 0) {
      console.log('   No models found. Try creating some passports first.');
    } else {
      console.log(`   Found ${models.length} models:`);
      for (const model of models) {
        console.log(`   - ${model.metadata?.name || model.passport_id}`);
        console.log(`     Runtime: ${model.metadata?.runtime_recommended}`);
        console.log(`     Parameters: ${model.metadata?.parameters_b}B`);
      }
    }

    // 2. Search for compute providers
    console.log('\n💻 Searching for compute in US regions...');
    const compute = await client.search.compute({
      regions: ['us-east-1', 'us-west-2'],
      runtimes: ['vllm'],
      min_vram_gb: 40,
      per_page: 5,
    });

    if (compute.length === 0) {
      console.log('   No compute found. Try creating some compute passports first.');
    } else {
      console.log(`   Found ${compute.length} compute providers:`);
      for (const c of compute) {
        console.log(`   - ${c.metadata?.name || c.passport_id}`);
        console.log(`     GPU: ${c.metadata?.hardware?.gpu}`);
        console.log(`     VRAM: ${c.metadata?.hardware?.vram_gb}GB`);
        console.log(`     Regions: ${c.metadata?.regions?.join(', ')}`);
      }
    }

    // 3. Match model to compute with policy
    if (models.length > 0) {
      const modelId = models[0].passport_id;
      console.log(`\n🎯 Matching compute for model: ${modelId}`);

      const matches = await client.match.computeForModel(modelId, {
        regions: ['us-east-1'],
        max_cost_per_token: 0.0001,
        preferred_runtimes: ['vllm'],
        min_availability: 99.0,
      });

      if (matches.length === 0) {
        console.log('   No matching compute found for this policy.');
      } else {
        console.log(`   Found ${matches.length} matching compute providers:`);
        for (const match of matches) {
          console.log(`   - ${match.compute.metadata?.name || match.compute.passport_id}`);
          console.log(`     Score: ${(match.score * 100).toFixed(1)}%`);
          console.log(`     Region: ${match.selected_region || 'any'}`);
          console.log(`     Runtime: ${match.selected_runtime || 'default'}`);
        }
      }

      // 4. Get detailed match explanation
      console.log('\n📊 Getting match explanation...');
      const explanation = await client.match.explain(modelId, {
        regions: ['us-east-1'],
        max_cost_per_token: 0.0001,
      });

      console.log('   Matching criteria:');
      if (explanation.criteria) {
        for (const [key, value] of Object.entries(explanation.criteria)) {
          console.log(`   - ${key}: ${JSON.stringify(value)}`);
        }
      }
      console.log(`   Total candidates: ${explanation.total_candidates || 0}`);
      console.log(`   Passed filter: ${explanation.passed_filter || 0}`);
    }

    // 5. Search with full-text
    console.log('\n🔤 Full-text search for "code generation"...');
    const codeModels = await client.search.models({
      search: 'code generation',
      per_page: 3,
    });

    if (codeModels.length === 0) {
      console.log('   No models found matching "code generation".');
    } else {
      console.log(`   Found ${codeModels.length} models:`);
      for (const model of codeModels) {
        console.log(`   - ${model.metadata?.name}: ${model.metadata?.description?.substring(0, 50)}...`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Code:', error.code);
    }
  }
}

main();
