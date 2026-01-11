/**
 * LucidLayer SDK - Basic Inference Example
 * 
 * This example demonstrates how to run a simple inference request
 * using the LucidLayer SDK.
 */

import { LucidClient } from '@lucidlayer/sdk';

async function main() {
  // Initialize the client
  const client = new LucidClient({
    baseUrl: process.env.LUCID_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.LUCID_API_KEY,
  });

  // Model passport ID - replace with your model passport
  const modelPassportId = process.env.MODEL_PASSPORT_ID || 'model_llama2_7b';

  console.log('🚀 Running inference...\n');

  try {
    // Simple inference request
    const result = await client.run.inference({
      model_passport_id: modelPassportId,
      prompt: 'Explain the concept of AI passports in one paragraph.',
      max_tokens: 150,
      temperature: 0.7,
    });

    console.log('📝 Response:');
    console.log(result.output);
    console.log('\n📊 Metrics:');
    console.log(`  - Tokens in: ${result.tokens_in}`);
    console.log(`  - Tokens out: ${result.tokens_out}`);
    console.log(`  - Time to first token: ${result.ttft_ms}ms`);
    console.log(`  - Receipt ID: ${result.receipt_id}`);

    // Optionally verify the receipt
    if (result.receipt_id) {
      console.log('\n🔍 Verifying receipt...');
      const verification = await client.receipts.verify(result.receipt_id);
      console.log(`  - Valid: ${verification.valid}`);
      if (verification.anchor_tx) {
        console.log(`  - Anchored in tx: ${verification.anchor_tx}`);
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
