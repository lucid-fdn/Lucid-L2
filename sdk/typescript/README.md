# @lucid-fdn/sdk

TypeScript SDK for the Lucid verified AI execution network. Identity, receipts, memory, payment, deployment — one package.

## Install

```bash
npm install @lucid-fdn/sdk
```

## Quick Start

### LucidAgent — 2 lines, everything automatic

```typescript
import { LucidAgent } from '@lucid-fdn/sdk';

const agent = new LucidAgent({
  apiKey: 'lk_...',                    // from lucid.foundation dashboard
  passportId: 'passport_...',          // your agent's identity
  providerUrl: 'https://your-provider/v1',  // any OpenAI-compatible endpoint
  providerApiKey: 'sk-...',            // provider API key
});

const result = await agent.run({
  model: 'gpt-4o',
  prompt: 'Review this smart contract for vulnerabilities',
});

console.log(result.text);          // LLM response
console.log(result.receipt_id);    // Cryptographic receipt (auto-created)
console.log(result.passport_id);   // Agent identity
```

Every `agent.run()` call automatically:
1. Routes inference through your provider
2. Creates a cryptographic receipt on the Lucid API
3. Attaches your agent's identity to the receipt
4. Builds reputation from real usage

### Environment Variables

```bash
LUCID_API_URL=https://api.lucid.foundation    # Lucid API (receipts, identity)
LUCID_PASSPORT_ID=passport_...                 # Agent passport ID
PROVIDER_URL=https://your-provider/v1          # Inference endpoint
PROVIDER_API_KEY=sk-...                        # Provider key
```

When env vars are set, the constructor simplifies to:

```typescript
const agent = new LucidAgent({ apiKey: 'lk_...' });
```

## LucidSDK — Full API Access

For advanced operations, use the generated SDK directly:

```typescript
import { LucidSDK } from '@lucid-fdn/sdk';

const sdk = new LucidSDK({ BASE: 'https://api.lucid.foundation' });

// Passports
const passport = await sdk.passports.lucidCreatePassport({
  type: 'agent', owner: '0x...', name: 'My Agent', metadata: { ... }
});

// Receipts
const receipt = await sdk.receipts.lucidCreateReceipt({ ... });

// Memory
await sdk.memory.lucidWriteEpisodicMemory({ ... });
const recalled = await sdk.memory.lucidRecallMemory({ ... });

// Launch agent
await sdk.agentLaunch.lucidLaunchAgent({
  mode: 'image',
  image: 'ghcr.io/myorg/my-agent:latest',
  target: 'railway',
  owner: '0x...',
  name: 'MyAgent',
});

// Blue-green deploy
await sdk.agentLaunch.lucidDeployBlueGreen('passport_123', { image: 'v2' });
await sdk.agentLaunch.lucidPromoteBlue('passport_123');

// Reputation
const score = await sdk.reputation.lucidGetReputationScore('passport_123');

// Epochs
const epoch = await sdk.epochs.lucidGetCurrentEpoch();
```

## 29 Services

| Service | What it does |
|---------|-------------|
| `agentLaunch` | Launch agents, blue-green deploy, promote, rollback |
| `passports` | CRUD for AI asset passports (model, agent, tool, compute, dataset) |
| `receipts` | Create, verify, prove cryptographic execution receipts |
| `memory` | Read/write agent memory (episodic, semantic, procedural, entity) |
| `epochs` | Epoch lifecycle and anchoring |
| `reputation` | Reputation scores and algorithms |
| `anchoring` | DePIN storage registry |
| `payments` | x402 payment protocol |
| `escrow` | On-chain escrow |
| `identity` | Cross-chain identity bridge |
| `shares` | Share token launch and airdrop |
| `compute` | Compute node registry |
| `match` | Policy-based compute matching |
| `health` | System health check |
| ...and 15 more | See generated services |

## LucidAgent vs LucidSDK

| | LucidAgent | LucidSDK |
|---|---|---|
| **Use when** | Building an agent that does inference | Building tools, dashboards, or advanced integrations |
| **Inference** | Built-in (any OpenAI-compatible provider) | Not included (raw API client) |
| **Receipts** | Automatic on every call | Manual (`sdk.receipts.create()`) |
| **Complexity** | 2 lines | Full control |

## License

Apache-2.0
