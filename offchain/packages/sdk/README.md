# @lucid-l2/sdk

Embeddable SDK for the Lucid verifiable AI execution layer.

Lucid gives AI assets (models, agents, tools, compute, datasets) provable identity, cryptographic receipts, and on-chain reputation backed by real traffic data. This SDK provides a single `Lucid` instance with namespaced access to passports, receipts, epochs, agents, payments, deployment, cryptographic primitives, and multi-chain operations.

## Install

```bash
npm install @lucid-l2/sdk
```

## Quick Start

```typescript
import { Lucid } from '@lucid-l2/sdk';

const lucid = new Lucid({
  orchestratorKey: process.env.LUCID_ORCHESTRATOR_SECRET_KEY!,
  chains: {
    solana: { rpc: 'https://api.devnet.solana.com' },
  },
});

// Or create from environment variables:
// const lucid = Lucid.fromEnv();

// Register an AI model passport
const passport = await lucid.passport.create({
  name: 'my-model',
  type: 'model',
  meta: { format: 'safetensors', parameterCount: '7B' },
});

// Create a cryptographic receipt after inference
const receipt = await lucid.receipt.create({
  passport_id: passport.passport_id,
  input_hash: lucid.crypto.hash('What is the meaning of life?'),
  output_hash: lucid.crypto.hash('42'),
  model_id: passport.passport_id,
  latency_ms: 320,
  tokens_in: 8,
  tokens_out: 1,
});

// Verify a receipt (signature + hash integrity)
const valid = await lucid.receipt.verify(receipt.receipt_id);

// Check chain capabilities before calling chain-specific features
const caps = lucid.chain.capabilities('solana');
console.log(caps);
// { epoch: true, passport: true, escrow: false, sessionKeys: false, zkml: false, paymaster: false, verifyAnchor: true }
```

## Namespaces

The SDK organizes all functionality into 8 stable namespaces accessible from the `Lucid` instance:

| Namespace | Accessor | Purpose |
|-----------|----------|---------|
| **Passport** | `lucid.passport` | Register, update, list, and anchor AI asset passports (model, agent, tool, compute, dataset) |
| **Receipt** | `lucid.receipt` | Create, verify, and prove cryptographic inference receipts with MMR proofs |
| **Epoch** | `lucid.epoch` | Manage epoch lifecycle -- finalization, on-chain anchoring, cross-chain verification |
| **Agent** | `lucid.agent` | Deploy agents to 6 targets, manage PDA wallets, query marketplace revenue |
| **Payment** | `lucid.payment` | Create/verify payment grants (x402 flow), calculate revenue splits, settle epochs |
| **Deploy** | `lucid.deploy` | Build container images, push to GHCR, list available deployment targets |
| **Crypto** | `lucid.crypto` | SHA-256, Ed25519 signing/verification, RFC 8785 canonical JSON, MMR operations |
| **Chain** | `lucid.chain` | Query chain capabilities, health checks, access raw blockchain adapters |

### Passport Operations

```typescript
// Create a passport for any AI asset type
const agentPassport = await lucid.passport.create({
  name: 'my-agent',
  type: 'agent',
  meta: { runtime: 'crewai', tools: ['web_search', 'code_exec'] },
});

// Anchor passport on-chain (multi-chain)
await lucid.passport.anchor(agentPassport.passport_id, {
  chains: ['solana-devnet', 'base'],
});

// Set a payment gate (x402)
await lucid.passport.setPaymentGate(agentPassport.passport_id, {
  price: 0.01,       // USD per call
  priceLucid: 1,     // LUCID tokens per call
});
```

### Receipt and Epoch Lifecycle

```typescript
// Receipts are appended to the current epoch's MMR
const receipt = await lucid.receipt.create({ /* ... */ });

// Get an MMR inclusion proof for any receipt
const proof = await lucid.receipt.prove(receipt.receipt_id);

// Epochs auto-finalize at >100 receipts or >1 hour; manual finalization:
const epoch = await lucid.epoch.current();
const finalized = await lucid.epoch.finalize(epoch.epoch_id);

// Anchor the epoch root on-chain
await lucid.epoch.anchor(finalized.epoch_id);

// Verify an epoch commitment on a specific chain
const verified = await lucid.epoch.verify(finalized.epoch_id, 'solana-devnet');
```

### Agent Deployment

```typescript
// Deploy to any of 6 targets: docker, railway, akash, phala, ionet, nosana
const deployment = await lucid.agent.deploy('passport-abc', 'railway', {
  env: { API_KEY: 'sk-...' },
});

// Check status, stream logs, or terminate
const status = await lucid.agent.status('passport-abc');
const logs = await lucid.agent.logs('passport-abc', { tail: 100 });
await lucid.agent.terminate('passport-abc');

// Agent PDA wallets (Solana)
const wallet = await lucid.agent.wallet.create('passport-abc');
const { balance, currency } = await lucid.agent.wallet.balance('passport-abc');
```

### Cryptographic Primitives

```typescript
// SHA-256 hashing
const hash = lucid.crypto.hash('hello world');

// Ed25519 signing and verification
const signature = lucid.crypto.sign('message to sign');
const valid = lucid.crypto.verify(signature, publicKey, 'message to sign');

// RFC 8785 canonical JSON (deterministic serialization)
const canonical = lucid.crypto.canonicalJson({ b: 2, a: 1 });
// '{"a":1,"b":2}'

// MMR operations (stateful — persists across calls)
const root1 = lucid.crypto.mmr.append(hash);  // Returns new root hex
const root2 = lucid.crypto.mmr.root();          // Same root
const proof = lucid.crypto.mmr.prove(0);         // Inclusion proof
const size = lucid.crypto.mmr.size();            // Node count
lucid.crypto.mmr.reset();                        // Clear state
```

### Chain Capabilities

Before calling chain-specific features, check what's available:

```typescript
const caps = lucid.chain.capabilities('solana-devnet');
if (caps.escrow) {
  // Safe to call escrow methods
}
if (caps.sessionKeys) {
  // Session key support available
}

// Get a chain adapter (returns a Promise)
const adapter = await lucid.chain.adapter('solana-devnet');
```

## Preview

Features under `lucid.preview` are experimental and not covered by semver stability guarantees. They may change without notice between minor versions.

```typescript
// First access logs a console warning
const reputation = lucid.preview.reputation;
const identity = lucid.preview.identity;
const zkml = lucid.preview.zkml;
```

> **Warning:** Preview APIs are subject to breaking changes in any release. Do not depend on them in production code.

You can also import preview features directly:

```typescript
import { getReputation, getIdentity, getZkml } from '@lucid-l2/sdk/preview';
```

## `Lucid.fromEnv()`

Create a Lucid instance entirely from environment variables:

```typescript
import { Lucid } from '@lucid-l2/sdk';

const lucid = Lucid.fromEnv();
```

Required env vars:
- `LUCID_ORCHESTRATOR_SECRET_KEY` — Ed25519 secret key (hex)
- At least one of: `SOLANA_RPC_URL`, `EVM_RPC_URL`

Optional env vars:
- `EVM_PRIVATE_KEY`, `DATABASE_URL`, `NFT_PROVIDER`, `DEPLOY_TARGET`, `DEPIN_PERMANENT_PROVIDER`, `ANCHORING_CHAINS`

## Subpath Imports

For tree-shaking or when you only need a specific domain, use subpath imports instead of the full SDK:

```typescript
// Only passport functions and types
import { getPassportManager, PassportManager } from '@lucid-l2/sdk/passports';
import type { CreatePassportInput, OperationResult } from '@lucid-l2/sdk/passports';

// Only receipt and crypto primitives
import { createReceipt, verifyReceipt, getReceiptProof } from '@lucid-l2/sdk/receipts';
import { sha256Hex, canonicalJson, AgentMMR } from '@lucid-l2/sdk/crypto';

// Only deployment
import { getDeployer, listDeployerTargets } from '@lucid-l2/sdk/deploy';
import type { IDeployer, DeploymentResult, RuntimeArtifact } from '@lucid-l2/sdk/deploy';

// Chain adapters
import { blockchainAdapterFactory, SolanaAdapter, EVMAdapter } from '@lucid-l2/sdk/chains';

// Epoch management
import { commitEpochRoot, finalizeEpoch, getCurrentEpoch } from '@lucid-l2/sdk/epochs';

// Payment and escrow
import { getPaymentGateService, getEscrowService, EscrowStatus } from '@lucid-l2/sdk/payments';

// Agent deployment and revenue
import { getAgentDeploymentService, getAgentRevenuePool } from '@lucid-l2/sdk/agents';

// Error classes only
import { LucidError, ChainFeatureUnavailable, ValidationError } from '@lucid-l2/sdk/errors';

// Type-only imports
import type { ChainCapabilities, SignedReceipt, Epoch } from '@lucid-l2/sdk/types';
```

Available subpath exports:

| Subpath | Contents |
|---------|----------|
| `@lucid-l2/sdk` | Full SDK: `Lucid` class + all types + error classes |
| `@lucid-l2/sdk/passports` | `getPassportManager`, `PassportManager`, `getPassportService`, `getPassportSyncService` |
| `@lucid-l2/sdk/receipts` | `createReceipt`, `verifyReceipt`, `getReceiptProof`, `listReceipts`, `getMmrRoot` |
| `@lucid-l2/sdk/epochs` | `createEpoch`, `finalizeEpoch`, `commitEpochRoot`, `commitEpochRootsBatch`, `getCurrentEpoch` |
| `@lucid-l2/sdk/agents` | `getAgentDeploymentService`, `processAgentRevenue`, `triggerAgentAirdrop`, `getAgentRevenuePool` |
| `@lucid-l2/sdk/payments` | `calculatePayoutSplit`, `getPaymentGateService`, `getEscrowService`, `EscrowStatus`, `DisputeService` |
| `@lucid-l2/sdk/deploy` | `getDeployer`, `listDeployerTargets`, `getAllDeployers` |
| `@lucid-l2/sdk/crypto` | `sha256Hex`, `canonicalJson`, `signMessage`, `verifySignature`, `AgentMMR`, `MerkleTree` |
| `@lucid-l2/sdk/chains` | `blockchainAdapterFactory`, `SolanaAdapter`, `EVMAdapter`, `CHAIN_CONFIGS` |
| `@lucid-l2/sdk/errors` | All error classes (`LucidError`, `ChainError`, `SolanaError`, etc.) |
| `@lucid-l2/sdk/types` | Type-only exports: `ChainCapabilities`, `SignedReceipt`, `Epoch`, adapter interfaces |
| `@lucid-l2/sdk/preview` | `getReputation()`, `getIdentity()`, `getZkml()` |

## Error Handling

All SDK errors extend `LucidError`, which includes a machine-readable `code` and supports `cause` chaining. Catch specific error types to handle different failure modes:

```typescript
import { Lucid } from '@lucid-l2/sdk';
import { ChainFeatureUnavailable, ValidationError, NetworkError } from '@lucid-l2/sdk/errors';

const lucid = new Lucid({
  orchestratorKey: process.env.LUCID_ORCHESTRATOR_SECRET_KEY!,
  chains: { solana: { rpc: 'https://api.devnet.solana.com' } },
});

try {
  await lucid.passport.create({ name: '', type: 'model' });
} catch (err) {
  if (err instanceof ValidationError) {
    // Field-level validation failure
    console.error(`Validation failed on "${err.field}": expected ${err.expected}`);
    console.error(`Code: ${err.code}`);  // 'VALIDATION_ERROR'
  } else if (err instanceof ChainFeatureUnavailable) {
    // Feature not supported on the target chain
    console.error(`${err.feature} is not available on ${err.chain}`);
    console.error(`Code: ${err.code}`);  // 'CHAIN_FEATURE_UNAVAILABLE'
  } else if (err instanceof NetworkError) {
    // RPC or HTTP failure
    console.error(`Network error reaching ${err.url}: ${err.statusCode}`);
  } else {
    throw err;
  }
}
```

All errors serialize cleanly to JSON via `.toJSON()`:

```typescript
import { ChainFeatureUnavailable } from '@lucid-l2/sdk/errors';

const err = new ChainFeatureUnavailable('escrow', 'evm');
console.log(JSON.stringify(err.toJSON(), null, 2));
// {
//   "name": "ChainFeatureUnavailable",
//   "code": "CHAIN_FEATURE_UNAVAILABLE",
//   "message": "escrow is not yet available on evm",
//   "chain": "evm",
//   "feature": "escrow"
// }
```

### Error Hierarchy

```
LucidError (code, cause, toJSON)
  |
  +-- ChainError (chain)
  |     +-- SolanaError (txSignature)
  |     +-- EVMError (txHash)
  |     +-- ChainFeatureUnavailable (feature)
  |
  +-- ValidationError (field, expected)
  +-- AuthError
  +-- DeployError (target, deploymentId)
  +-- NetworkError (url, statusCode)
  +-- TimeoutError (operationMs, limitMs)
  +-- RateLimitError (retryAfterMs)
```

Every error includes:
- **`code`** -- machine-readable string (e.g. `'CHAIN_FEATURE_UNAVAILABLE'`, `'VALIDATION_ERROR'`, `'DEPLOY_ERROR'`)
- **`cause`** -- optional wrapped original error
- **`toJSON()`** -- structured serialization with all error-specific fields

## Retry & Timeout

All async SDK methods are wrapped with configurable retry and timeout policies. By default:
- **Timeout**: 30 seconds per operation
- **Retry**: Up to 3 attempts with exponential backoff and jitter
- **Retryable errors**: `NetworkError`, `TimeoutError`, `RateLimitError`, connection resets, 503/429 responses

`RateLimitError` includes a `retryAfterMs` hint that the retry logic respects automatically.

```typescript
// Disable retries (fail fast)
const lucid = new Lucid({ ..., retry: false });

// Custom retry behavior
const lucid = new Lucid({ ..., retry: { maxRetries: 5, baseDelayMs: 500 } });

// No timeout
const lucid = new Lucid({ ..., timeout: 0 });
```

You can also use the utilities directly:

```typescript
import { withRetry, withTimeout, withRetryAndTimeout } from '@lucid-l2/sdk';

const result = await withRetry(() => fetch(url), { maxRetries: 5 });
const fast = await withTimeout(() => slowOperation(), 5000);
```

## Configuration

The `Lucid` constructor accepts a `LucidConfig` object. Only `orchestratorKey` and at least one chain in `chains` are required:

```typescript
import { Lucid } from '@lucid-l2/sdk';

const lucid = new Lucid({
  // ── Required ──────────────────────────────────────────────────────────

  // Ed25519 secret key (hex) used for signing receipts
  orchestratorKey: process.env.LUCID_ORCHESTRATOR_SECRET_KEY!,

  // At least one chain connection is required
  chains: {
    solana: {
      rpc: 'https://api.devnet.solana.com',
      keypairPath: '/path/to/keypair.json',  // or keypair: Uint8Array
    },
    evm: {
      rpc: 'https://mainnet.base.org',
      privateKey: process.env.EVM_PRIVATE_KEY,
    },
  },

  // ── Optional ──────────────────────────────────────────────────────────

  // Which chains receive epoch root anchoring
  // Values: 'solana-devnet', 'solana-mainnet', 'base', 'ethereum', etc.
  anchoringChains: ['solana-devnet', 'base'],

  // PostgreSQL connection string (enables persistence for receipts, epochs, passports)
  db: process.env.DATABASE_URL,

  // NFT minting backend for passport creation
  // Options: 'token2022' | 'metaplex-core' | 'evm-erc721' | 'mock'
  nftProvider: 'metaplex-core',

  // Default target for agent deployment
  // Options: 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana'
  deployTarget: 'railway',

  // DePIN storage provider for permanent artifact storage
  // Options: 'arweave' | 'lighthouse' | 'mock'
  depinStorage: 'arweave',

  // Custom logger (defaults to console)
  logger: {
    info: (...args: any[]) => myLogger.info(...args),
    warn: (...args: any[]) => myLogger.warn(...args),
    error: (...args: any[]) => myLogger.error(...args),
  },

  // Retry config for transient failures (NetworkError, TimeoutError, RateLimitError)
  // Set to false to disable retries entirely
  retry: {
    maxRetries: 3,     // default: 3
    baseDelayMs: 200,  // default: 200 (exponential backoff with jitter)
  },

  // Timeout in ms for each async operation (default: 30000)
  // Set to 0 to disable timeouts
  timeout: 30000,
});
```

### Environment Variable Mapping

The constructor maps config values to environment variables consumed by the engine:

| Config Key | Environment Variable |
|------------|---------------------|
| `orchestratorKey` | `LUCID_ORCHESTRATOR_SECRET_KEY` |
| `chains.solana.rpc` | `SOLANA_RPC_URL` |
| `anchoringChains` | `ANCHORING_CHAINS` (comma-separated) |
| `db` | `DATABASE_URL` |
| `nftProvider` | `NFT_PROVIDER` |
| `deployTarget` | `DEPLOY_TARGET` |
| `depinStorage` | `DEPIN_PERMANENT_PROVIDER` |

## Generating API Docs

This package includes [TypeDoc](https://typedoc.org/) for generating API reference documentation from source:

```bash
cd offchain/packages/sdk
npm run docs
```

Output is written to `offchain/packages/sdk/docs/` in Markdown format.

## License

Apache-2.0
