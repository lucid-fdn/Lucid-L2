# Lucid SDK — Speakeasy-First Design

**Date:** 2026-03-02
**Status:** Approved
**Goal:** Ship `@lucid/sdk` + `@lucid/react` + `@lucid/ai` with minimal custom code by leveraging Speakeasy auto-generation.

---

## Strategy

1. **Update `openapi.yaml`** — add missing public endpoints (v2 routes, passport pricing/endpoints)
2. **Regenerate Speakeasy SDK as `@lucid/sdk`** — rename from `raijin-labs-lucid-ai`, add default chain at init
3. **Handwrite `@lucid/react`** — React hooks wrapping `@lucid/sdk`
4. **Repackage `@lucid/ai`** — Vercel AI provider (already exists as `ai.ts`)

## Architecture

```
openapi.yaml (source of truth)
    ↓ Speakeasy generates
@lucid/sdk (auto-generated TypeScript client)
    ├── sdk.passports.create({ chain: 'base' })
    ├── sdk.escrow.create({ ... })
    ├── sdk.inference.chatCompletions({ stream: true })
    ├── sdk.receipts.verify(id)
    └── Custom: default chain at init, ai.ts provider
    ↓ wraps
@lucid/react (handwritten)
    ├── <LucidProvider>
    ├── useChat()
    ├── usePassport()
    └── useEscrow()
    ↓ re-exports
@lucid/ai (tiny wrapper)
    └── createLucidProvider() for Vercel AI SDK
```

## Default Chain at Init

```typescript
import { LucidSDK } from '@lucid/sdk';

// Default chain — don't have to specify per call
const sdk = new LucidSDK({
  apiKey: 'lk_live_...',
  chain: 'base'  // custom option, merged into every request
});

await sdk.passports.create({ name: 'GPT-4', type: 'model' }); // → base
await sdk.passports.create({ name: 'GPT-4', type: 'model', chain: 'solana-devnet' }); // override
```

Implemented as custom Speakeasy hook that injects `chain` into request bodies.

## openapi.yaml Updates Required

### Must Add (public developer API):

**Passport sub-routes:**
- `PATCH /v1/passports/{passport_id}/pricing` — update pricing fields
- `PATCH /v1/passports/{passport_id}/endpoints` — update endpoint URLs

**v2 Escrow + Finance:**
- `POST /v2/escrow` — create escrow
- `GET /v2/escrow/{escrowId}` — get escrow
- `POST /v2/escrow/{escrowId}/release` — release escrow
- `POST /v2/escrow/{escrowId}/dispute` — dispute escrow
- `POST /v2/escrow/{escrowId}/claim-timeout` — claim after timeout

**v2 Disputes:**
- `GET /v2/disputes/{disputeId}` — get dispute details
- `POST /v2/disputes/{disputeId}/evidence` — submit evidence
- `POST /v2/disputes/{disputeId}/resolve` — resolve dispute
- `POST /v2/disputes/{disputeId}/appeal` — appeal decision

**v2 Paymaster (EVM gas abstraction):**
- `POST /v2/paymaster/sponsor` — sponsor UserOp with $LUCID
- `GET /v2/paymaster/rate` — get LUCID/ETH exchange rate
- `GET /v2/paymaster/deposit` — get deposit info

**v2 Identity (cross-chain):**
- `POST /v2/identity/register` — register cross-chain identity
- `GET /v2/identity/{identifier}` — resolve identity
- `POST /v2/identity/link` — link addresses cross-chain

**v2 TBA (Token Bound Accounts):**
- `POST /v2/tba/create` — create TBA for passport NFT
- `GET /v2/tba/{tokenId}` — get TBA address

**v2 ERC-7579 Modules:**
- `POST /v2/modules/install` — install module on TBA
- `GET /v2/modules/{tbaAddress}` — list installed modules
- `POST /v2/modules/execute` — execute module action

**v2 zkML:**
- `POST /v2/zkml/verify` — submit zkML proof for verification
- `GET /v2/zkml/circuit/{circuitId}` — get circuit info

**Streaming:**
- Add SSE response definition on `POST /v1/chat/completions` (Speakeasy's `inferSSEOverload: true` already supports this — just need the OpenAPI spec to define it)

### Don't Add (internal/admin only):
- `/api/wallets/*` — internal wallet management
- `/api/rewards/*` — internal gamification
- `/api/oauth/*` — internal OAuth plumbing
- `/api/passports/sync-*` — HF sync admin
- `/api/solana/*` — internal DeFi
- `/api/hyperliquid/*` — internal trading
- `/api/flow/*` — internal n8n admin
- `/api/system/*` — internal monitoring

## Speakeasy Config Changes

In `sdk/raijin-labs-lucid-ai-typescript/.speakeasy/gen.yaml`:

```yaml
generation:
  sdkClassName: LucidSDK  # was: RaijinLabsLucidAi

typescript:
  packageName: '@lucid/sdk'  # was: raijin-labs-lucid-ai
  envVarPrefix: LUCID  # was: RAIJINLABSLUCIDAI
  baseErrorName: LucidError  # was: RaijinLabsLucidAiError
  defaultErrorName: LucidDefaultError  # was: RaijinLabsLucidAiDefaultError
```

Keep `ai.ts` as custom code inside the generated SDK.

## @lucid/react Package

Handwritten, ~200 lines. Wraps `@lucid/sdk`.

```tsx
// LucidProvider — context
<LucidProvider apiKey="lk_live_..." chain="base">
  <App />
</LucidProvider>

// useChat — streaming chat with receipts
const { messages, input, handleInputChange, handleSubmit, isStreaming } = useChat({
  model: 'deepseek-v3',
});

// usePassport — data fetching
const { data, error, isLoading } = usePassport('passport_abc');

// useEscrow — escrow status with polling
const { data, isLoading } = useEscrow('escrow_xyz', { refetchInterval: 5000 });
```

## @lucid/ai Package

Tiny — re-exports existing `ai.ts` as `@lucid/ai`:

```typescript
import { createLucidProvider } from '@lucid/ai';
import { streamText } from 'ai';

const result = streamText({
  model: createLucidProvider()('deepseek-v3'),
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Deployed Contract Addresses

Embedded in `@lucid/sdk` chain config (referenced from `engine/chains/configs.ts`):

**Ethereum Sepolia:** Lucid `0x060f...`, Escrow `0x3Aff...`, Arbitration `0x3D29...`, Paymaster `0xafDc...`
**Base Sepolia:** Lucid `0x17F5...`, Escrow `0x060f...`, Arbitration `0xc93b...`, Paymaster `0xd267...`

## What This Gives Developers

```typescript
import { LucidSDK } from '@lucid/sdk';

const sdk = new LucidSDK({ apiKey: 'lk_live_...', chain: 'base' });

// Inference
const chat = await sdk.inference.chatCompletions({
  model: 'deepseek-v3',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Verify receipt
const verified = await sdk.receipts.verify(chat.receiptId);

// Create escrow
const escrow = await sdk.escrow.create({
  beneficiary: '0x...', amount: '100', duration: 3600
});

// Switch chain per call
const passport = await sdk.passports.create({
  name: 'My Model', type: 'model', chain: 'solana-devnet'
});
```
