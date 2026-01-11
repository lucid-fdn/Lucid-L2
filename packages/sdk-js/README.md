# @lucidlayer/sdk

TypeScript SDK for **LucidLayer** - Decentralized AI Compute Orchestration.

## Installation

```bash
npm install @lucidlayer/sdk
# or
yarn add @lucidlayer/sdk
# or
pnpm add @lucidlayer/sdk
```

## Quick Start

```typescript
import { LucidClient } from '@lucidlayer/sdk';

// Create client
const client = new LucidClient({
  baseUrl: 'https://api.lucidlayer.io',
  apiKey: 'your-api-key', // optional
});

// Run inference
const result = await client.run.inference({
  model_passport_id: 'model-passport-id',
  prompt: 'What is the capital of France?',
  max_tokens: 100,
});

console.log(result.text);
```

## Features

- 🎫 **Passport Management** - Create and manage model, compute, tool, dataset, and agent passports
- 🔍 **Search & Discovery** - Find models and compute providers with powerful filtering
- ⚡ **Inference Execution** - Run inference with automatic compute matching
- 🔄 **Streaming** - Full streaming support for real-time responses
- 📜 **Receipts & Proofs** - Verify execution with Merkle proofs anchored on-chain
- 🤖 **OpenAI Compatible** - Drop-in replacement for OpenAI API

## Usage Examples

### Create a Model Passport

```typescript
const passport = await client.passports.create({
  type: 'model',
  owner: 'your-wallet-address',
  metadata: {
    name: 'Llama-2-7b',
    format: 'safetensors',
    runtime_recommended: 'vllm',
    hf_repo: 'meta-llama/Llama-2-7b-hf',
    requirements: {
      min_vram_gb: 16,
    },
  },
  tags: ['llama', 'meta', '7b'],
});

console.log(`Created passport: ${passport.passport_id}`);
```

### Search Models

```typescript
// Search for models compatible with vLLM
const models = await client.search.models({
  runtime: 'vllm',
  max_vram: 24,
  search: 'llama',
});

for (const model of models.items) {
  console.log(`${model.name} - ${model.passport_id}`);
}
```

### Search Compute Providers

```typescript
// Find compute providers in specific regions
const compute = await client.search.compute({
  regions: ['us-east', 'eu-west'],
  min_vram: 40,
  runtimes: ['vllm'],
  provider_type: 'cloud',
});

for (const provider of compute.items) {
  console.log(`${provider.name} - ${provider.metadata.hardware.gpu}`);
}
```

### Match Compute for Model

```typescript
const match = await client.match.computeForModel('model-passport-id', {
  version: '1.0',
  constraints: {
    allowed_regions: ['us-east', 'eu-west'],
    min_vram_gb: 24,
  },
  preferences: {
    prefer_low_latency: true,
  },
});

if (match.success) {
  console.log(`Matched compute: ${match.match.compute_passport_id}`);
}
```

### Run Inference

```typescript
// Simple inference
const result = await client.run.inference({
  model_passport_id: 'model-passport-id',
  prompt: 'Explain quantum computing in simple terms.',
  max_tokens: 500,
  temperature: 0.7,
});

console.log(result.text);
console.log(`Tokens: ${result.tokens_in} in, ${result.tokens_out} out`);
console.log(`Latency: ${result.total_latency_ms}ms (TTFT: ${result.ttft_ms}ms)`);
```

### Streaming Inference

```typescript
// Streaming with async iteration
for await (const chunk of client.run.inferenceStream({
  model_passport_id: 'model-passport-id',
  prompt: 'Tell me a story about a robot.',
  max_tokens: 1000,
})) {
  process.stdout.write(chunk.text || '');
  
  if (chunk.done) {
    console.log(`\n\nReceipt: ${chunk.receipt_id}`);
  }
}
```

### OpenAI-Compatible Chat Completion

```typescript
// Drop-in replacement for OpenAI
const response = await client.run.chatCompletion({
  model: 'passport:model-passport-id',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);

// With LucidLayer extensions
console.log(`Run ID: ${response.lucid?.run_id}`);
console.log(`Compute: ${response.lucid?.compute_passport_id}`);
```

### Verify Receipt

```typescript
// Get receipt
const receipt = await client.receipts.get(result.run_id);

// Verify integrity
const verification = await client.receipts.verify(result.run_id);
console.log(`Valid: ${verification.valid}`);
console.log(`Hash valid: ${verification.hash_valid}`);
console.log(`Signature valid: ${verification.signature_valid}`);

// Get Merkle proof
const proof = await client.receipts.getProof(result.run_id);
console.log(`Proof elements: ${proof.proof.length}`);

// Wait for anchor
const anchored = await client.receipts.waitForAnchor(result.run_id, 300000);
console.log(`Anchored in tx: ${anchored.anchor?.tx}`);
```

### Helper Methods

```typescript
// Simple completion
const text = await client.run.complete('model-id', 'Hello world');

// Simple chat
const reply = await client.run.chat('model-id', [
  { role: 'user', content: 'What is 2+2?' }
]);

// Streaming with callback
await client.run.streamComplete(
  'model-id',
  'Count to 10',
  (text) => process.stdout.write(text)
);
```

## API Reference

### LucidClient

```typescript
const client = new LucidClient({
  baseUrl: string;        // Required: API base URL
  apiKey?: string;        // Optional: API key for authentication
  timeout?: number;       // Optional: Request timeout in ms (default: 30000)
  retries?: number;       // Optional: Number of retries (default: 3)
  retryDelay?: number;    // Optional: Delay between retries in ms (default: 1000)
  debug?: boolean;        // Optional: Enable debug logging (default: false)
  headers?: Record<string, string>; // Optional: Custom headers
});
```

### Modules

| Module | Description |
|--------|-------------|
| `client.passports` | Passport CRUD operations |
| `client.search` | Search and discovery |
| `client.match` | Compute matching |
| `client.run` | Inference execution |
| `client.receipts` | Receipt management |

### Passport Types

- `model` - AI models (LLMs, etc.)
- `compute` - Compute providers
- `tool` - Agent tools
- `dataset` - Data sources
- `agent` - AI agents

## Error Handling

```typescript
import { 
  LucidError, 
  ValidationError, 
  NotFoundError,
  NoCompatibleComputeError,
  ComputeUnavailableError,
  TimeoutError 
} from '@lucidlayer/sdk';

try {
  await client.run.inference({ ... });
} catch (error) {
  if (error instanceof NoCompatibleComputeError) {
    console.log('No compute available:', error.details);
  } else if (error instanceof ComputeUnavailableError) {
    console.log('Compute endpoint unavailable');
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof LucidError) {
    console.log(`Error: ${error.message} (${error.code})`);
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions. All types are exported:

```typescript
import type {
  Passport,
  PassportType,
  PassportStatus,
  ModelMeta,
  ComputeMeta,
  Policy,
  InferenceRequest,
  InferenceResult,
  ChatMessage,
  Receipt,
  Epoch,
} from '@lucidlayer/sdk';
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (for TypeScript users)

## License

MIT

## Links

- [Documentation](https://docs.lucidlayer.io)
- [GitHub](https://github.com/lucidlayer/lucid-l2)
- [Discord](https://discord.gg/lucidlayer)
