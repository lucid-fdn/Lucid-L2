/**
 * LucidLayer SDK Example - Quick Start
 * 
 * This example demonstrates basic SDK usage including:
 * - SDK initialization
 * - Creating passports
 * - Listing passports
 * - Running inference
 * 
 * Install: npm install raijin-labs-lucid-ai
 * Run: npx tsx src/index.ts
 */

import { RaijinLabsLucidAi } from "raijin-labs-lucid-ai";

// Initialize the SDK
// By default it connects to https://api.lucid.foundation
// You can override with serverURL for local development
const lucid = new RaijinLabsLucidAi({
  // serverURL: "http://localhost:3000", // Uncomment for local dev
  // debugLogger: console, // Uncomment to enable debug logging
});

// Generate unique IDs for demo
const timestamp = Date.now();
const modelPassportId = `model-quickstart-${timestamp}`;

// Sample valid Solana wallet address (devnet phantom wallet format)
// Replace with your own wallet address when testing
const DEMO_WALLET = "3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3";

async function main() {
  console.log("🚀 LucidLayer SDK Quick Start Example\n");
  console.log("=".repeat(50));

  // Example 1: List existing passports
  console.log("\n📋 Example 1: Listing Passports");
  console.log("-".repeat(30));
  
  try {
    const listResult = await lucid.passports.list({
      page: 1,
      perPage: 5,
    });
    
    console.log(`Found ${listResult.passports.length} passports`);
    console.log(`Total: ${listResult.pagination.total}`);
    
    if (listResult.passports.length > 0) {
      console.log("\nFirst passport:");
      console.log(`  ID: ${listResult.passports[0].passportId}`);
      console.log(`  Type: ${listResult.passports[0].type}`);
      console.log(`  Owner: ${listResult.passports[0].owner}`);
    }
  } catch (error) {
    console.error("Error listing passports:", error);
  }

  // Example 2: Create a new model passport (with correct schema)
  console.log("\n📝 Example 2: Creating a Model Passport");
  console.log("-".repeat(30));
  
  try {
    const createResult = await lucid.passports.create({
      type: "model",
      owner: DEMO_WALLET,
      name: "Demo Model - Llama 3.1 8B",
      description: "A sample model passport created via SDK quickstart",
      version: "1.0.0",
      tags: ["demo", "sdk", "quickstart"],
      metadata: {
        // Required fields (per ModelMeta.schema.json)
        schema_version: "1.0",
        model_passport_id: modelPassportId,
        format: "safetensors",
        runtime_recommended: "vllm",
        // Optional fields
        base: "hf",
        hf: {
          repo_id: "meta-llama/Llama-3.1-8B-Instruct",
        },
        context_length: 128000,
        requirements: {
          min_vram_gb: 24,
        },
      },
    });
    
    console.log("✅ Passport created successfully!");
    console.log(`  Passport ID: ${createResult.passportId}`);
    console.log(`  Owner: ${createResult.passport.owner}`);
    console.log(`  Type: ${createResult.passport.type}`);
    
    // Cleanup: Delete the passport we just created
    console.log("\n🧹 Cleaning up test passport...");
    await lucid.passports.delete({ passportId: createResult.passportId });
    console.log("  Deleted successfully");
  } catch (error) {
    console.error("Error creating passport:", error);
  }

  // Example 3: Search for model passports
  console.log("\n🔍 Example 3: Searching Models");
  console.log("-".repeat(30));
  
  try {
    const searchResult = await lucid.passports.searchModels({
      runtime: "vllm",
      perPage: 5,
    });
    console.log("Model search completed");
    console.log(`  Results:`, searchResult);
  } catch (error) {
    console.error("Error searching models:", error);
  }

  // Example 4: Get MMR Root (Receipts)
  console.log("\n📊 Example 4: Get MMR Root");
  console.log("-".repeat(30));
  
  try {
    const mmrResult = await lucid.receipts.getMmrRoot();
    console.log("MMR Root info:");
    console.log(`  Root: ${mmrResult.root}`);
    console.log(`  Leaf Count: ${mmrResult.leafCount}`);
  } catch (error) {
    console.error("Error getting MMR root:", error);
  }

  // Example 5: Get Current Epoch
  console.log("\n⏰ Example 5: Get Current Epoch");
  console.log("-".repeat(30));
  
  try {
    const epochResult = await lucid.epochs.getCurrent({});
    console.log("Current epoch info:");
    console.log(`  Result:`, epochResult);
  } catch (error) {
    console.error("Error getting current epoch:", error);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✨ Quick Start Example Complete!");
  console.log("\nNext steps:");
  console.log("  - Run 'npm run full-demo' for comprehensive examples");
  console.log("  - See README.md for SDK quick reference");
  console.log("  - Visit https://docs.lucid.foundation for full docs");
}

main().catch(console.error);
