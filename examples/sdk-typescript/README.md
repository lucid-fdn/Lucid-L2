# LucidLayer SDK TypeScript Examples

This directory contains example code demonstrating how to use the `raijin-labs-lucid-ai` SDK.

## Installation

```bash
# Install dependencies
npm install
```

## Examples

### Quick Start (Basic Usage)

```bash
npm start
```

Demonstrates:
- SDK initialization
- Listing passports
- Creating a passport
- Getting passport statistics
- Searching models

### Full Demo (All Features)

```bash
npm run full-demo
```

Comprehensive demo covering:
- **Passports**: Create, read, update, delete, list, search
- **Matching**: Policy evaluation, compute matching, route planning
- **Inference**: Run inference, OpenAI-compatible chat completions
- **Compute**: Health monitoring, heartbeats
- **Receipts**: Create, verify, get proofs, MMR root
- **Epochs**: Create, list, anchoring, verification
- **Payouts**: Calculate splits, create from receipts

## Environment Variables

You can customize the examples with environment variables:

```bash
# API endpoint (default: https://api.lucid.foundation)
export LUCID_API_URL=http://localhost:3000

# Test wallet address
export TEST_WALLET=YourWalletAddress...

# Enable debug logging
export DEBUG=true
```

## SDK Quick Reference

### Initialize SDK

```typescript
import { RaijinLabsLucidAi } from "raijin-labs-lucid-ai";

const lucid = new RaijinLabsLucidAi({
  serverURL: "https://api.lucid.foundation",
  debugLogger: console, // Optional: enable logging
});
```

### Passports

```typescript
// Create a model passport
const result = await lucid.passports.create({
  type: "model",
  owner: "wallet-address",
  name: "My Model",
  metadata: {
    runtime: "vllm",
    vram_gb: 24,
  },
});

// List passports
const list = await lucid.passports.list({
  type: "model",
  status: "active",
  page: 1,
  perPage: 10,
});

// Get a passport
const passport = await lucid.passports.get({
  passportId: "passport-id",
});

// Update a passport
await lucid.passports.update({
  passportId: "passport-id",
  updatePassportRequest: {
    description: "Updated description",
  },
});

// Delete a passport
await lucid.passports.delete({
  passportId: "passport-id",
});
```

### Inference

```typescript
// Run inference
const result = await lucid.run.inference({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  messages: [
    { role: "user", content: "Hello!" },
  ],
  maxTokens: 100,
});

// OpenAI-compatible chat completions
const chat = await lucid.run.chatCompletions({
  model: "meta-llama/Llama-3.1-8B-Instruct",
  messages: [
    { role: "user", content: "What is LucidLayer?" },
  ],
});
```

### Matching

```typescript
// Match compute for a model
const match = await lucid.match.compute({
  modelMeta: { runtime: "vllm", vram_gb: 24 },
  policy: {
    version: "1.0",
    constraints: { min_vram_gb: 24 },
  },
  computeCatalog: [...],
});
```

### Receipts

```typescript
// Get current MMR root
const root = await lucid.receipts.getMmrRoot();

// Verify a receipt
const verification = await lucid.receipts.verify({
  receiptId: "run-id",
});
```

### Epochs

```typescript
// Get current epoch
const epoch = await lucid.epochs.getCurrent({});

// List epochs
const epochs = await lucid.epochs.list({
  status: "anchored",
  page: 1,
});
```

## Error Handling

```typescript
import * as errors from "raijin-labs-lucid-ai/models/errors";

try {
  await lucid.passports.get({ passportId: "invalid" });
} catch (error) {
  if (error instanceof errors.RaijinLabsLucidAiError) {
    console.log("HTTP Error:", error.statusCode);
    console.log("Message:", error.message);
    
    if (error instanceof errors.ErrorResponse) {
      console.log("API Error:", error.data$.error);
    }
  }
}
```

## NPM Package

The SDK is published at:
- **Package**: `raijin-labs-lucid-ai`
- **Version**: `0.1.2`
- **NPM**: https://www.npmjs.com/package/raijin-labs-lucid-ai

## Documentation

- [SDK README](https://github.com/raijin-labs/lucid-ai-typescript)
- [API Reference](https://api.lucid.foundation/docs)
- [LucidLayer Docs](https://docs.lucid.foundation)
