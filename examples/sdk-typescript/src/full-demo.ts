/**
 * LucidLayer SDK - Full Demo
 * 
 * This is a comprehensive example demonstrating all major SDK features:
 * - Passport CRUD operations
 * - Model/Compute matching
 * - Inference routing
 * - Receipt verification
 * - Epoch management
 * - Payout calculations
 * 
 * SDK v0.3.2 - Updated to use clean method names (create, list, get, etc.)
 */

import { RaijinLabsLucidAi } from "raijin-labs-lucid-ai";
import * as errors from "raijin-labs-lucid-ai/models/errors";

// =============================================================================
// Configuration
// =============================================================================
const config = {
  // API URL - change for local development
  serverURL: process.env.LUCID_API_URL || "https://api.lucid.foundation",
  
  // Test wallet address
  testWallet: process.env.TEST_WALLET || "3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3",
  
  // Enable verbose logging
  debug: process.env.DEBUG === "true",
};

// Generate unique IDs for this demo run
const timestamp = Date.now();
const modelPassportIdForCreate = `model-demo-${timestamp}`;
const computePassportIdForCreate = `compute-demo-${timestamp}`;

// =============================================================================
// Initialize SDK
// =============================================================================
const lucid = new RaijinLabsLucidAi({
  serverURL: config.serverURL,
  debugLogger: config.debug ? console : undefined,
});

// =============================================================================
// Helper Functions
// =============================================================================
function section(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`📌 ${title}`);
  console.log("=".repeat(60));
}

function subsection(title: string) {
  console.log(`\n  → ${title}`);
}

async function safeCall<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    console.log(`    ✅ ${name}: Success`);
    return result;
  } catch (error: unknown) {
    if (error instanceof errors.RaijinLabsLucidAiError) {
      console.log(`    ❌ ${name}: ${error.message} (${error.statusCode})`);
    } else if (error instanceof Error) {
      console.log(`    ❌ ${name}: ${error.message}`);
    } else {
      console.log(`    ❌ ${name}: ${error}`);
    }
    return null;
  }
}

// =============================================================================
// Demo: Passports
// =============================================================================
async function demoPassports(): Promise<string | null> {
  section("PASSPORTS - Identity Layer for AI Assets");
  
  // Create a model passport with CORRECT SCHEMA
  subsection("Creating a Model Passport");
  const modelPassport = await safeCall("Create model", () =>
    lucid.passports.create({
      type: "model",
      owner: config.testWallet,
      name: "Llama-3.1-8B-Instruct",
      description: "Meta's Llama 3.1 8B Instruct model",
      version: "1.0.0",
      tags: ["llama", "instruct", "8b", "meta"],
      metadata: {
        // Required fields per ModelMeta.schema.json
        schema_version: "1.0",
        model_passport_id: modelPassportIdForCreate,
        format: "safetensors",
        runtime_recommended: "vllm",
        // Optional fields
        base: "hf",
        hf: {
          repo_id: "meta-llama/Llama-3.1-8B-Instruct",
          revision: "main",
        },
        context_length: 131072,
        quantizations: ["fp16", "int8"],
        requirements: {
          min_vram_gb: 24,
          gpu_classes: ["A100", "H100"],
          cuda_min: "11.8",
        },
      },
    })
  );
  
  // Create a compute passport with CORRECT SCHEMA
  subsection("Creating a Compute Passport");
  const computePassport = await safeCall("Create compute", () =>
    lucid.passports.create({
      type: "compute",
      owner: config.testWallet,
      name: "GPU-Node-A100-US-East",
      description: "NVIDIA A100 80GB node in US-East",
      version: "1.0.0",
      tags: ["a100", "80gb", "us-east", "vllm"],
      metadata: {
        // Required fields per ComputeMeta.schema.json
        schema_version: "1.0",
        compute_passport_id: computePassportIdForCreate,
        provider_type: "cloud",
        regions: ["us-east-1"],
        hardware: {
          gpu: "A100-80GB",
          vram_gb: 80,
          arch: "ampere",
        },
        runtimes: [
          { name: "vllm", version: "0.4.0" },
          { name: "tgi", version: "2.0.0" },
        ],
        endpoints: {
          inference_url: "https://compute.example.com/v1/completions",
        },
        capabilities: {
          supports_streaming: true,
          supports_attestation: false,
          supports_cc_on: false,
        },
        network: {
          p95_ms_estimate: 250,
          bandwidth: "10Gbps",
        },
        limits: {
          max_context: 131072,
          max_batch: 64,
        },
        pricing: {
          price_per_1k_tokens_estimate: 0.0015,
          price_per_minute_estimate: 0.05,
        },
      },
    })
  );
  
  // List passports
  subsection("Listing Passports");
  const list = await safeCall("List passports", () =>
    lucid.passports.list({
      type: "model",
      status: "active",
      page: 1,
      perPage: 10,
      sortBy: "created_at",
      sortOrder: "desc",
    })
  );
  if (list && 'pagination' in list) {
    console.log(`    Found ${(list as any).pagination.total} total passports`);
  }
  
  // Get passport by ID
  if (modelPassport && 'passportId' in modelPassport) {
    subsection("Getting Passport by ID");
    await safeCall("Get passport", () =>
      lucid.passports.get({ passportId: (modelPassport as any).passportId })
    );
  }
  
  // Update passport
  if (modelPassport && 'passportId' in modelPassport) {
    subsection("Updating Passport");
    await safeCall("Update passport", () =>
      lucid.passports.update({
        passportId: (modelPassport as any).passportId,
        body: {
          description: "Updated description - Meta's Llama 3.1 8B",
          tags: ["llama", "instruct", "8b", "meta", "updated"],
        },
      })
    );
  }
  
  // Get passport stats
  subsection("Passport Statistics");
  await safeCall("Get stats", () => lucid.passports.getStats());
  
  // Search models
  subsection("Searching Models");
  await safeCall("Search models", () =>
    lucid.passports.searchModels({
      runtime: "vllm",
      maxVram: 48,
      perPage: 5,
    })
  );
  
  // Search compute
  subsection("Searching Compute");
  await safeCall("Search compute", () =>
    lucid.passports.searchCompute({
      runtimes: "vllm",
      minVram: 24,
      regions: "us-east",
      perPage: 5,
    })
  );
  
  return modelPassport && 'passportId' in modelPassport ? (modelPassport as any).passportId : null;
}

// =============================================================================
// Demo: Matching & Routing
// =============================================================================
async function demoMatching() {
  section("MATCHING - Policy-Based Compute Selection");
  
  // Model metadata (correct schema)
  const modelMeta = {
    schema_version: "1.0",
    model_passport_id: "model-llama3-8b-001",
    format: "safetensors",
    runtime_recommended: "vllm",
    requirements: {
      min_vram_gb: 24,
    },
  };
  
  // Policy - use proper SDK type with policyVersion
  const policy = {
    policyVersion: "1.0",
    allowRegions: ["us-east-1", "us-west-2"],
    attestation: {
      attestationRequired: false,
      fallbackAllowed: true,
    },
    latency: {
      p95MsBudget: 500,
      hardTimeoutMs: 5000,
    },
    cost: {
      maxPricePer1kTokensUsd: 0.005,
    },
  };
  
  // Compute catalog (correct schema)
  const computeCatalog = [
    {
      schema_version: "1.0",
      compute_passport_id: "compute-a100-us-1",
      provider_type: "cloud",
      regions: ["us-east-1"],
      hardware: {
        gpu: "A100-80GB",
        vram_gb: 80,
      },
      runtimes: [{ name: "vllm" }, { name: "tgi" }],
      endpoints: {
        inference_url: "https://compute1.example.com/v1/completions",
      },
    },
    {
      schema_version: "1.0",
      compute_passport_id: "compute-h100-us-2",
      provider_type: "cloud",
      regions: ["us-west-2"],
      hardware: {
        gpu: "H100-80GB",
        vram_gb: 80,
      },
      runtimes: [{ name: "vllm" }],
      endpoints: {
        inference_url: "https://compute2.example.com/v1/completions",
      },
    },
  ];
  
  // Match explain
  subsection("Explain Policy Evaluation");
  await safeCall("Match explain", () =>
    lucid.match.explain({
      policy,
      computeMeta: computeCatalog[0],
      modelMeta,
    })
  );
  
  // Match compute
  subsection("Match Compute for Model");
  await safeCall("Match compute", () =>
    lucid.match.compute({
      modelMeta,
      policy,
      computeCatalog,
      requireLiveHealthy: false,
    })
  );
  
  // Plan route
  subsection("Plan Route (Match + Resolve Endpoint)");
  await safeCall("Plan route", () =>
    lucid.match.planRoute({
      modelMeta,
      policy,
      computeCatalog,
      requestId: `req-${Date.now()}`,
      requireLiveHealthy: false,
    })
  );
}

// =============================================================================
// Demo: Inference
// =============================================================================
async function demoInference() {
  section("INFERENCE - Run AI Workloads");
  
  // Policy with proper SDK format
  const inferencePolicy = {
    policyVersion: "1.0",
    latency: {
      p95MsBudget: 1000,
    },
  };
  
  // Standard inference
  subsection("Run Inference");
  await safeCall("Run inference", () =>
    lucid.run.inference({
      modelPassportId: "model-llama3-8b-001",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is LucidLayer?" },
      ],
      maxTokens: 100,
      temperature: 0.7,
      stream: false,
      policy: inferencePolicy,
    })
  );
  
  // OpenAI-compatible chat completions
  subsection("Chat Completions (OpenAI-compatible)");
  await safeCall("Chat completions", () =>
    lucid.run.chatCompletions({
      model: "model-llama3-8b-001",
      messages: [
        { role: "user", content: "Explain blockchain in one sentence." },
      ],
      maxTokens: 50,
      temperature: 0.5,
      policy: inferencePolicy,
    })
  );
}

// =============================================================================
// Demo: Compute Health
// =============================================================================
async function demoComputeHealth() {
  section("COMPUTE - Node Health & Heartbeats");
  
  // Submit heartbeat
  subsection("Submit Compute Heartbeat");
  await safeCall("Heartbeat", () =>
    lucid.compute.heartbeat({
      computePassportId: "compute-node-demo-1",
      status: "healthy",
      queueDepth: 5,
      pricePer1kTokensEstimate: 0.0015,
      p95MsEstimate: 250,
    })
  );
  
  // Get node health
  subsection("Get Compute Node Health");
  await safeCall("Get health", () =>
    lucid.compute.getNodeHealth({ computePassportId: "compute-node-demo-1" })
  );
}

// =============================================================================
// Demo: Receipts
// =============================================================================
async function demoReceipts() {
  section("RECEIPTS - Verifiable Execution Proofs");
  
  const runId = `run-${Date.now()}`;
  
  // Create receipt
  subsection("Create Receipt");
  const receipt = await safeCall("Create receipt", () =>
    lucid.receipts.create({
      runId,
      modelPassportId: "model-passport-demo-1",
      computePassportId: "compute-passport-demo-1",
      policyHash: "sha256:abc123def456",
      runtime: "vllm",
      tokensIn: 100,
      tokensOut: 50,
      ttftMs: 150,
      totalLatencyMs: 500,
      timestamp: Math.floor(Date.now() / 1000),
      receiptHash: "sha256:receipt-hash-demo",
      signature: "sig:demo-signature",
    })
  );
  
  // Get receipt
  if (receipt) {
    subsection("Get Receipt");
    await safeCall("Get receipt", () =>
      lucid.receipts.get({ receiptId: runId })
    );
    
    // Verify receipt
    subsection("Verify Receipt");
    await safeCall("Verify receipt", () =>
      lucid.receipts.verify({ receiptId: runId })
    );
    
    // Get proof
    subsection("Get Inclusion Proof");
    await safeCall("Get proof", () =>
      lucid.receipts.getProof({ receiptId: runId })
    );
  }
  
  // Get MMR root
  subsection("Get MMR Root");
  await safeCall("Get MMR root", () => lucid.receipts.getMmrRoot());
  
  // Get signer pubkey
  subsection("Get Orchestrator Signing Key");
  await safeCall("Get signer pubkey", () => lucid.receipts.getSignerPubKey());
}

// =============================================================================
// Demo: Epochs
// =============================================================================
async function demoEpochs() {
  section("EPOCHS - On-Chain Anchoring");
  
  // Get current epoch
  subsection("Get Current Epoch");
  await safeCall("Get current epoch", () =>
    lucid.epochs.getCurrent({})
  );
  
  // List epochs
  subsection("List Epochs");
  await safeCall("List epochs", () =>
    lucid.epochs.list({
      status: "anchored",
      page: 1,
      perPage: 10,
    })
  );
  
  // Create epoch
  subsection("Create New Epoch");
  await safeCall("Create epoch", () =>
    lucid.epochs.create({})
  );
  
  // Get epoch stats
  subsection("Epoch Statistics");
  await safeCall("Get epoch stats", () => lucid.epochs.getStats());
  
  // List ready epochs
  subsection("Epochs Ready for Finalization");
  await safeCall("List ready epochs", () => lucid.epochs.listReady());
  
  // Get anchoring health
  subsection("Anchoring Service Health");
  await safeCall("Get anchoring health", () => lucid.epochs.getAnchoringHealth());
}

// =============================================================================
// Demo: Payouts
// =============================================================================
async function demoPayouts() {
  section("PAYOUTS - Revenue Distribution");
  
  const runId = `run-${Date.now()}`;
  
  // Calculate payout - use proper basis points format (must sum to 10000)
  subsection("Calculate Payout Split");
  await safeCall("Calculate payout", () =>
    lucid.payouts.calculate({
      runId,
      totalAmountLamports: 1000000,
      computeWallet: config.testWallet,
      modelWallet: config.testWallet,
      orchestratorWallet: config.testWallet,
      config: {
        computeBp: 7000,        // 70% to compute provider
        modelBp: 2000,          // 20% to model provider
        orchestratorBp: 1000,   // 10% to orchestrator
      },
    })
  );
  
  // Create payout from receipt data
  subsection("Create Payout from Receipt");
  await safeCall("Payout from receipt", () =>
    lucid.payouts.createFromReceipt({
      runId: `run-receipt-${Date.now()}`,
      tokensIn: 100,
      tokensOut: 50,
      pricePer1kTokensLamports: 10000,
      computeWallet: config.testWallet,
      modelWallet: config.testWallet,
    })
  );
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log("🌟 LucidLayer SDK - Full Feature Demo (v0.3.2)");
  console.log(`📡 API: ${config.serverURL}`);
  console.log(`🔧 Debug: ${config.debug}`);
  
  // Run all demos
  const passportId = await demoPassports();
  await demoMatching();
  await demoInference();
  await demoComputeHealth();
  await demoReceipts();
  await demoEpochs();
  await demoPayouts();
  
  // Cleanup: Delete the test passport we created
  if (passportId) {
    section("CLEANUP");
    subsection("Deleting Test Passport");
    await safeCall("Delete passport", () =>
      lucid.passports.delete({ passportId })
    );
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Demo Complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
