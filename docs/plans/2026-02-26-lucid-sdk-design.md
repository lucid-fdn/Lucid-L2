# Lucid SDK Design — Product-First Multi-Chain AI Infrastructure

**Date:** 2026-02-26 (updated 2026-03-02)
**Status:** Design (approved, ready for implementation)
**Goal:** 300% ahead of competition — make verifiable AI as easy as Stripe made payments

---

## Design Principles

1. **Product-first, chain as config** — Developers choose products (`@lucid/passports`, `@lucid/escrow`), not chains. Chain is a configuration option.
2. **Progressive complexity** — API key only → add chain → add signer → add React hooks. Each level unlocks more capability without rewriting.
3. **Types that teach** — TypeScript autocomplete is the primary documentation surface. Declaration merging shows only what you imported.
4. **Errors are data, not exceptions** — Every operation returns `{ data, error }`. Errors include chain, txHash, explorerUrl, docsUrl.
5. **Streaming first-class** — `for await`, `.toResponse()`, `useChat()` all work natively.
6. **Tree-shakeable by design** — Import only the products you use. Each product is a separate npm package.

---

## Package Architecture

```
@lucid/core         — Client factory, chain config, signer abstraction, types, errors
@lucid/passports    — Register, update, attest, search passports (model/compute/tool/agent)
@lucid/escrow       — Create, release, dispute, arbitrate escrows
@lucid/receipts     — Create, verify, prove, anchor receipts + MMR proofs
@lucid/inference    — Chat completions, model routing, streaming
@lucid/memory       — Portable agent memory (MMR-based proof-of-contribution)
@lucid/paymaster    — Gas abstraction ($LUCID as gas, UserOp sponsoring) — EVM only
@lucid/react        — React hooks for all products
@lucid/ai           — Vercel AI SDK provider (re-export of existing createLucidProvider)
```

### Dependency Graph

```
@lucid/passports  ─┐
@lucid/escrow     ─┤
@lucid/receipts   ─┤── all peer-depend on @lucid/core
@lucid/inference  ─┤
@lucid/memory     ─┤
@lucid/paymaster  ─┘
@lucid/react      ─── peer-depends on @lucid/core + all product packages (optional)
@lucid/ai         ─── peer-depends on @lucid/core + ai (Vercel AI SDK)
```

### Monorepo Structure

```
sdk/
  packages/
    core/
      src/
        index.ts              — createLucid(), LucidClient class, plugin registry
        types.ts              — Chain, Signer, LucidConfig, LucidPlugins interface
        errors.ts             — LucidError, error codes, { data, error } Result type
        chains.ts             — Chain definitions (base, ethereum, arbitrum, solana, testnets)
        adapters/
          evm.ts              — Viem-based EVM adapter
          solana.ts           — @solana/web3.js adapter
          api.ts              — HTTP client for Lucid API
        schemas/              — Zod schemas for all shared types
      package.json
    passports/
      src/
        index.ts              — Plugin registration + PassportClient class
        types.ts              — Passport, PassportCreateParams, etc.
      package.json
    escrow/
      src/
        index.ts              — Plugin registration + EscrowClient class
        types.ts
      package.json
    receipts/
      src/
        index.ts              — Plugin registration + ReceiptClient class
        types.ts
      package.json
    inference/
      src/
        index.ts              — Plugin registration + InferenceClient class
        stream.ts             — AsyncIterableStream, .toResponse()
        types.ts
      package.json
    memory/
      src/
        index.ts              — Plugin registration + MemoryClient class
        types.ts
      package.json
    paymaster/
      src/
        index.ts              — Plugin registration + PaymasterClient class
        types.ts
      package.json
    react/
      src/
        index.ts              — Re-exports all hooks
        provider.tsx           — LucidProvider context
        hooks/
          usePassport.ts
          usePassports.ts
          useCreatePassport.ts
          useEscrow.ts
          useCreateEscrow.ts
          useReceipt.ts
          useVerifyReceipt.ts
          useChat.ts           — Vercel AI-style chat hook with receipts
          useAgent.ts
          useAgentProof.ts
          usePaymasterRate.ts
          useLucid.ts          — Raw client access
      package.json
    ai/
      src/
        index.ts              — Vercel AI SDK provider wrapper
      package.json
```

---

## Initialization — Progressive Complexity

### Level 1: API-only (30 seconds to first call)

```typescript
import { createLucid } from '@lucid/core';
import '@lucid/inference';

const lucid = createLucid({ apiKey: 'lk_live_...' });

const { data } = await lucid.inference.chat({
  model: 'deepseek-v3',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### Level 2: With chain (on-chain reads)

```typescript
const lucid = createLucid({
  apiKey: 'lk_live_...',
  chain: 'base',
});
```

### Level 3: With signer (on-chain writes)

```typescript
// EVM
const lucid = createLucid({
  apiKey: 'lk_live_...',
  chain: 'base',
  signer: walletClient,  // viem WalletClient
});

// Solana
const lucid = createLucid({
  apiKey: 'lk_live_...',
  chain: 'solana',
  signer: keypair,  // @solana/web3.js Keypair or wallet adapter
});
```

### Level 4: Multi-chain

```typescript
const lucid = createLucid({
  apiKey: 'lk_live_...',
  chains: {
    base: { signer: evmWallet },
    solana: { signer: solanaKeypair },
  },
  defaultChain: 'base',
});

await lucid.escrow.create({ ... });                   // → Base
await lucid.escrow.create({ ..., chain: 'solana' });  // → Solana
```

---

## Chain Abstraction

### Chain Definitions

```typescript
// Importable chain objects (like wagmi/chains)
import { base, ethereum, arbitrum, solana } from '@lucid/core/chains';

type Chain = 'base' | 'ethereum' | 'arbitrum' | 'solana'
           | 'base-sepolia' | 'ethereum-sepolia' | 'solana-devnet';
```

### Internal Adapter Layer

```
@lucid/core/adapters/
  ├── evm.ts      — Uses viem (publicClient + walletClient)
  ├── solana.ts   — Uses @solana/web3.js (Connection + Keypair)
  └── api.ts      — HTTP client for Lucid API server
```

Each product client calls `this.lucid.adapter.sendTransaction()` or `this.lucid.api.post()` — never touches chain-specific code directly.

### Signer Types (Chain-Aware)

The signer type narrows based on the chain:
- EVM chains: `viem.WalletClient` or `ethers.Signer`
- Solana: `@solana/web3.js.Keypair` or Wallet Adapter `Wallet`
- API-only: No signer needed

---

## Product APIs — Consistent CRUD Pattern

Every product follows Stripe's `resource.verb()` convention.

### Passports

```typescript
await lucid.passports.create({ name: 'GPT-4', type: 'model', owner: '0x...', metadata: {...} });
await lucid.passports.get('passport_abc123');
await lucid.passports.update('passport_abc123', { tags: ['fast', 'cheap'] });
await lucid.passports.list({ type: 'model', limit: 10 });
await lucid.passports.delete('passport_abc123');
await lucid.passports.search({ type: 'model', runtime: 'vllm' });
await lucid.passports.sync('passport_abc123');  // trigger on-chain sync
```

### Escrow

```typescript
await lucid.escrow.create({ beneficiary: '0x...', token: 'LUCID', amount: '100', duration: 3600 });
await lucid.escrow.get('escrow_xyz');
await lucid.escrow.release('escrow_xyz', { receiptHash: '0x...', signature: '0x...' });
await lucid.escrow.dispute('escrow_xyz', { reason: 'No inference delivered' });
await lucid.escrow.claimTimeout('escrow_xyz');
```

### Receipts

```typescript
await lucid.receipts.create({ model: 'deepseek-v3', tokensIn: 100, tokensOut: 50, policyHash: '0x...' });
await lucid.receipts.get('receipt_xyz');
await lucid.receipts.verify('receipt_xyz');
await lucid.receipts.getProof('receipt_xyz');
await lucid.receipts.getMmrRoot();
```

### Inference

```typescript
// Non-streaming
const { data } = await lucid.inference.chat({ model: 'deepseek-v3', messages: [...] });

// Streaming
const stream = await lucid.inference.chat({ model: 'deepseek-v3', messages: [...], stream: true });
for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
const { text, usage, receipt } = await stream.finalResult();
```

### Memory

```typescript
await lucid.memory.initAgent({ agentId: 'my-agent' });
await lucid.memory.processEpoch({ agentId: 'my-agent', vectors: ['action1', 'action2'] });
await lucid.memory.generateProof({ agentId: 'my-agent', epoch: 1, vectorText: 'action1' });
await lucid.memory.getStats('my-agent');
await lucid.memory.getRoot('my-agent');
```

### Paymaster (EVM only)

```typescript
await lucid.paymaster.estimate({ userOp: {...} });
await lucid.paymaster.sponsor({ userOp: {...} });
await lucid.paymaster.getRate();
await lucid.paymaster.getDeposit();
```

---

## TypeScript Patterns

### Declaration Merging (Plugin System)

```typescript
// @lucid/core defines an empty interface
interface LucidPlugins {}

// Each product package augments it:
// In @lucid/passports:
declare module '@lucid/core' {
  interface LucidPlugins {
    passports: PassportClient;
  }
}

// In @lucid/escrow:
declare module '@lucid/core' {
  interface LucidPlugins {
    escrow: EscrowClient;
  }
}

// Result: lucid.passports and lucid.escrow autocomplete only if imported
```

### Branded Types for IDs

```typescript
type PassportId = string & { readonly __brand: 'PassportId' };
type EscrowId = string & { readonly __brand: 'EscrowId' };
type ReceiptId = string & { readonly __brand: 'ReceiptId' };

// Prevents accidental ID mixing
await lucid.passports.get(escrowId);  // TypeScript ERROR
```

### Zod Schemas Exported

```typescript
import { passportSchema } from '@lucid/passports/schemas';

const result = passportSchema.create.safeParse(userInput);
if (!result.success) {
  console.log(result.error.issues);
}
```

---

## Error Handling

### Result Type (Never Throws)

```typescript
type LucidResult<T> = { data: T; error: null } | { data: null; error: LucidError };
```

Every SDK method returns `LucidResult<T>`.

### Error Structure

```typescript
interface LucidError {
  code: LucidErrorCode;      // 'INVALID_PARAMS' | 'CHAIN_ERROR' | 'UNAUTHORIZED' | ...
  message: string;           // Human-readable, actionable message
  requestId: string;         // For support tickets
  // Optional chain context
  chain?: string;
  txHash?: string;
  explorerUrl?: string;
  // Optional metadata
  details?: Record<string, unknown>;
  docsUrl?: string;
  retryAfter?: number;       // ms, for rate limits
}
```

### Error Codes

```typescript
type LucidErrorCode =
  | 'INVALID_PARAMS'        // Bad input — details has field-level errors
  | 'UNAUTHORIZED'          // Bad or missing API key
  | 'FORBIDDEN'             // Valid key but insufficient permissions
  | 'NOT_FOUND'             // Resource doesn't exist
  | 'CHAIN_ERROR'           // On-chain transaction failed
  | 'INSUFFICIENT_BALANCE'  // Not enough LUCID/ETH
  | 'RATE_LIMITED'          // Too many requests
  | 'TIMEOUT'               // Request or transaction timed out
  | 'NETWORK_ERROR'         // Can't reach API or RPC
  | 'SIGNER_REQUIRED'       // Operation needs a signer but none configured
  | 'CHAIN_REQUIRED'        // Operation needs a chain but none configured
  | 'UNSUPPORTED_CHAIN';    // Operation not available on this chain (e.g. paymaster on Solana)
```

### Error Message Quality

Every error message answers three questions: What happened? Why? What to do?

```
LucidError [SIGNER_REQUIRED]: Cannot create escrow without a signer.
Configure a signer: createLucid({ apiKey: '...', chain: 'base', signer: walletClient })

Docs: https://docs.lucid.foundation/errors/SIGNER_REQUIRED
```

```
LucidError [CHAIN_ERROR]: Escrow creation failed — transaction reverted with
"Insufficient allowance". Approve the escrow contract to spend your LUCID tokens first.

Chain:    base-sepolia
TxHash:   0xabc123...
Explorer: https://sepolia.basescan.org/tx/0xabc123...
Docs:     https://docs.lucid.foundation/errors/CHAIN_ERROR
```

---

## React Hooks

### Provider

```tsx
import { LucidProvider } from '@lucid/react';

function App() {
  return (
    <LucidProvider
      apiKey="lk_live_..."
      chain="base"
      signer={walletClient}  // optional
    >
      <MyApp />
    </LucidProvider>
  );
}
```

### Hook Catalog

| Hook | Returns | Purpose |
|------|---------|---------|
| `useLucid()` | `LucidClient` | Raw client access |
| `usePassport(id)` | `{ data, error, isLoading }` | Fetch single passport |
| `usePassports(params?)` | `{ data, error, isLoading }` | List/search passports |
| `useCreatePassport()` | `{ create, isPending, error }` | Create passport mutation |
| `useEscrow(id)` | `{ data, error, isLoading }` | Fetch escrow with polling |
| `useCreateEscrow()` | `{ create, isPending, error }` | Create escrow mutation |
| `useReceipt(id)` | `{ data, error, isLoading }` | Fetch receipt |
| `useVerifyReceipt()` | `{ verify, isPending, data }` | Verify receipt mutation |
| `useChat(config)` | `{ messages, input, handleSubmit, ... }` | Full chat state management |
| `useAgent(id)` | `{ data, error, isLoading }` | Agent stats |
| `useAgentProof(params)` | `{ data, error, isLoading }` | Proof of contribution |
| `usePaymasterRate()` | `{ data, error, isLoading }` | Current LUCID/ETH rate |

### useChat — The Star Hook

```tsx
const {
  messages,           // Message[] — full chat history
  input,              // string — current input value
  handleInputChange,  // (e) => void — bind to input onChange
  handleSubmit,       // (e) => void — bind to form onSubmit
  isStreaming,         // boolean — is response streaming
  error,              // LucidError | null
  stop,               // () => void — abort current stream
  reload,             // () => void — retry last message
  append,             // (message) => void — add message programmatically
  setMessages,        // (messages) => void — replace history
  receipt,            // Receipt | null — latest receipt from inference
  cost,               // { tokensIn, tokensOut, lucidCost } | null
} = useChat({
  model: 'deepseek-v3',
  system: 'You are a helpful assistant.',
  policy: { allowRegions: ['us-east-1'] },
  onReceipt: (receipt) => { ... },
  onError: (error) => { ... },
  onFinish: (message) => { ... },
});
```

---

## Streaming

### Server-side (Node.js)

```typescript
const stream = await lucid.inference.chat({
  model: 'deepseek-v3',
  messages: [...],
  stream: true,
});

// Async iterator
for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}

// Get final result
const { text, usage, receipt } = await stream.finalResult();
```

### API Route (Next.js)

```typescript
export async function POST(req: Request) {
  const { messages } = await req.json();
  const stream = await lucid.inference.chat({ model: 'deepseek-v3', messages, stream: true });
  return stream.toResponse();  // Standard Response with SSE
}
```

### Vercel AI SDK Interop

```typescript
import { lucid } from '@lucid/ai';
import { streamText } from 'ai';

const result = streamText({ model: lucid('deepseek-v3'), messages: [...] });
return result.toDataStreamResponse();
```

---

## Developer Onboarding Flow

### 5-Minute Full Stack

1. `npm install @lucid/core @lucid/inference` — 10 seconds
2. Create client, call `lucid.inference.chat()` — 20 seconds
3. `npm install @lucid/receipts`, verify receipt — 30 seconds
4. `npm install @lucid/escrow`, create escrow with signer — 2 minutes
5. `npm install @lucid/react`, build chat UI with `useChat` — 3 minutes

### Documentation Structure

```
docs.lucid.foundation/
  getting-started/        — 5-minute quickstart
  products/
    passports/            — Full passport API reference
    escrow/               — Escrow lifecycle guide
    receipts/             — Receipt verification guide
    inference/            — Model routing + streaming
    memory/               — Agent memory + proofs
    paymaster/            — Gas abstraction guide
  guides/
    multi-chain/          — Chain config + switching
    react/                — Hooks reference + examples
    vercel-ai/            — AI SDK integration
    nextjs/               — Full-stack Next.js tutorial
  api-reference/          — Auto-generated from Zod schemas
  errors/                 — Every error code with solutions
```

---

## Competitive Advantage Summary

| Dimension | Competition | Lucid SDK |
|-----------|------------|-----------|
| Init time | 10+ lines config | 2 lines |
| Multi-chain | Separate SDKs | `chain: 'base'` config option |
| Verifiable AI | N/A | Every inference → cryptographic receipt |
| Escrow | Build your own | `lucid.escrow.create()` |
| Gas abstraction | N/A | `lucid.paymaster.sponsor()` |
| React hooks | Manual fetch | `useChat()` with receipts + cost |
| Streaming | Varies | Native async iterators + `.toResponse()` |
| Errors | HTTP status codes | Typed codes + explorer links + docs |
| Types | Generated stubs | Declaration merging + branded IDs |
| Tree-shaking | All-or-nothing | Per-product packages |
| Agent memory | N/A | `lucid.memory.*` with MMR proofs |

**The moat:** No other SDK gives you verifiable AI inference with one function call. `lucid.inference.chat()` returns a cryptographic receipt provable on-chain. Stripe made payments trustless. Lucid makes AI trustless.

---

## Backend Mapping (offchain monorepo, updated 2026-03-02)

The backend was restructured into a feature-first monorepo (`refactor/monorepo-packages`, merged to master). The SDK packages map 1:1 to internal services:

### SDK ↔ Backend Service Mapping

| SDK Package | Backend Location | Internal Service |
|---|---|---|
| `@lucid/core` | `engine/chains/` | `IBlockchainAdapter`, `BlockchainAdapterFactory`, `CHAIN_CONFIGS` |
| `@lucid/passports` | `engine/passport/` | `PassportManager`, `PassportSyncService`, `PassportService` |
| `@lucid/escrow` | `engine/finance/` | `EscrowService`, `DisputeService`, `PayoutService` |
| `@lucid/receipts` | `engine/receipt/` | `ReceiptService`, `EpochService`, `AnchoringService`, `MmrService` |
| `@lucid/inference` | `gateway-lite/inference/` | `ExecutionGateway`, `ComputeClient`, `ContentService` |
| `@lucid/memory` | `engine/crypto/mmr.ts` + `engine/receipt/mmrService.ts` | MMR append/prove/verify |
| `@lucid/paymaster` | `engine/identity/paymasterService.ts` | `PaymasterService` (ERC-4337) |
| `@lucid/react` | N/A (new) | Wraps all product clients as React hooks |
| `@lucid/ai` | `sdk/raijin-labs-lucid-ai-typescript/src/ai.ts` | Existing `createLucidProvider()` |

### Chain Abstraction Reuse

The SDK's chain layer wraps the existing backend abstractions:

```
SDK @lucid/core/chains    →  engine/chains/configs.ts    (15+ chain configs with deployed addresses)
SDK @lucid/core/adapters  →  engine/chains/evm/adapter.ts (EVMAdapter, viem-based)
                          →  engine/chains/solana/adapter.ts (SolanaAdapter, web3.js-based)
                          →  engine/chains/factory.ts    (BlockchainAdapterFactory singleton)
                          →  engine/chains/adapter-interface.ts (IBlockchainAdapter)
```

### Feature-Owned Contract Code

Real on-chain interaction logic lives in feature directories (not in generic chain adapters):

| Feature | Code Location | Contracts/ABIs |
|---|---|---|
| ERC-8004 Identity Registry | `engine/identity/registries/evm-identity.ts` | `abis/IdentityRegistry.json` |
| ERC-8004 Validation Registry | `engine/identity/registries/evm-validation.ts` | `abis/ValidationRegistry.json` |
| ERC-8004 Reputation Registry | `engine/identity/registries/evm-reputation.ts` | `abis/ReputationRegistry.json` |
| ERC-6551 TBA | `engine/identity/tba/evm-registry-client.ts` | `abis/ERC6551Registry.json` |
| Solana Passport NFT | `engine/passport/nft/solana-token2022.ts` | SPL Token-2022 program |
| ERC-7579 Modules | `engine/identity/erc7579Service.ts` | Phase 3 contracts |
| Paymaster (ERC-4337) | `engine/identity/paymasterService.ts` | `contracts/src/LucidPaymaster.sol` |

### EVM Contract Addresses (Deployed)

**Ethereum Sepolia:**
- Lucid Token: `0x060f76F82325B98bC595954F6b8c88083B43b379`
- LucidValidator: `0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e`
- LucidEscrow: `0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088`
- LucidArbitration: `0x3D29D5dDAe2da5E571C015EfAbdfCab9A1B0F9BA`
- LucidPaymaster: `0xafDcb7f7D75784076eC1f62DB13F7651A73789A2`
- ZkMLVerifier: `0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98`
- Modules: Policy `0x1be6...`, Payout `0xAec0...`, Receipt `0x7695...`

**Base Sepolia:**
- Lucid Token: `0x17F583fc59b745E24C5078b9C8e4577b866cD7fc`
- LucidValidator: `0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc`
- LucidEscrow: `0x060f76F82325B98bC595954F6b8c88083B43b379`
- LucidArbitration: `0xc93b3E60503cAD1FEc11209F374A67D2886c6BA5`
- LucidPaymaster: `0xd2671c81a7169E66Aa9B0db5D0bF865Cfd6868bD`
- ZkMLVerifier: `0xAA663967159E18A3Da2A8277FDDa35C0389e1462`
- Modules: Policy `0xe026...`, Payout `0x5164...`, Receipt `0x00b8...`

### Passport API Updates (from monorepo branch)

New endpoints added during restructuring (not yet in `openapi.yaml`):

```typescript
// New passport operations to include in @lucid/passports:
await lucid.passports.updatePricing('passport_abc', { perToken: '0.001', currency: 'LUCID' });
await lucid.passports.updateEndpoints('passport_abc', [{ url: 'https://...', type: 'inference' }]);
```

### Receipt Proof Wire Format Update

The receipt proof response field was renamed in the restructuring:
- **Before:** `{ siblings: string[], root: string, directions: number[] }`
- **After:** `{ proof: string[], root: string, leaf: string, directions: number[] }`

The SDK must use the new field names (`proof` not `siblings`, new `leaf` field).
