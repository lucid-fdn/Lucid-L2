/**
 * LucidLayer SDK - Create Passport Example
 * 
 * This example demonstrates how to create model and compute passports
 * using the LucidLayer SDK.
 */

import { LucidClient, PassportType } from '@lucidlayer/sdk';

async function main() {
  // Initialize the client
  const client = new LucidClient({
    baseUrl: process.env.LUCID_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.LUCID_API_KEY,
  });

  const ownerWallet = process.env.OWNER_WALLET || 'demo_wallet_address';

  console.log('🎫 Creating Passports\n');

  try {
    // 1. Create a Model Passport
    console.log('📦 Creating model passport...');
    const modelPassport = await client.passports.create({
      type: 'model',
      owner: ownerWallet,
      metadata: {
        name: 'My Custom LLM',
        description: 'A fine-tuned language model for code generation',
        model_id: 'my-org/my-custom-llm',
        runtime_recommended: 'vllm',
        format: 'safetensors',
        parameters_b: 7.0,
        context_window: 4096,
        capabilities: ['text-generation', 'code-generation'],
        license: 'Apache-2.0',
        tags: ['llm', 'code', 'fine-tuned'],
        requirements: {
          min_vram_gb: 16,
        },
      },
    });

    console.log(`✅ Model passport created: ${modelPassport.passport_id}`);
    console.log(`   Name: ${modelPassport.metadata?.name}`);
    console.log(`   Type: ${modelPassport.type}`);

    // 2. Create a Compute Passport
    console.log('\n💻 Creating compute passport...');
    const computePassport = await client.passports.create({
      type: 'compute',
      owner: ownerWallet,
      metadata: {
        name: 'GPU Cloud Provider A',
        description: 'High-performance GPU compute for AI inference',
        endpoint: 'https://api.provider-a.example.com/v1',
        provider_type: 'cloud',
        regions: ['us-east-1', 'eu-west-1'],
        hardware: {
          gpu: 'A100',
          vram_gb: 80,
          gpu_count: 8,
        },
        runtimes: [
          { name: 'vllm', version: '0.4.0' },
          { name: 'tgi', version: '2.0' },
        ],
        pricing: {
          unit: 'token',
          cost_per_input_token: 0.00001,
          cost_per_output_token: 0.00003,
          currency: 'USD',
        },
        availability: {
          uptime_sla: 99.9,
          avg_latency_ms: 50,
        },
        max_batch_size: 64,
        max_concurrent: 100,
      },
    });

    console.log(`✅ Compute passport created: ${computePassport.passport_id}`);
    console.log(`   Name: ${computePassport.metadata?.name}`);
    console.log(`   Regions: ${computePassport.metadata?.regions?.join(', ')}`);

    // 3. List all passports
    console.log('\n📋 Listing all passports...');
    const allPassports = await client.passports.list({ owner: ownerWallet });
    console.log(`   Found ${allPassports.passports.length} passports`);

    for (const p of allPassports.passports) {
      console.log(`   - ${p.passport_id} (${p.type}): ${p.metadata?.name}`);
    }

    // 4. Update a passport
    console.log('\n✏️ Updating model passport...');
    const updatedPassport = await client.passports.update(modelPassport.passport_id, {
      metadata: {
        ...modelPassport.metadata,
        tags: ['llm', 'code', 'fine-tuned', 'production-ready'],
        description: 'A production-ready fine-tuned language model for code generation',
      },
    });
    console.log(`✅ Updated tags: ${updatedPassport.metadata?.tags?.join(', ')}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Code:', error.code);
    }
    if (error.details) {
      console.error('   Details:', JSON.stringify(error.details, null, 2));
    }
  }
}

main();
