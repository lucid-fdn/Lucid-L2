# Lucid-L2 SDK Architecture Design

**Date:** 2026-03-10
**Status:** Approved
**Authors:** Kevin Wayne, Claude (architect)

---

## 1. Problem Statement

Lucid-L2 has ~90% production-ready code across 6 Solana programs, 9 EVM contracts, and a full offchain engine. But it's not shippable as an SDK because:

1. The public API surface is a mess — `engine/src/index.ts` exports only crypto+config (19 lines). Everything else requires undocumented deep imports.
2. No separation between production-ready and preview code — stubs (`throw "not implemented"`) live alongside real implementations.
3. Security blockers exist — agent-wallet escrow has 3 access control bugs, escrow state is in-memory.
4. Three competing SDK artifacts confuse developers.
5. No single entry point — developers must discover the API by reading source code.

## 2. Design Principles

### 2.1 Off-Chain First, On-Chain Async

The SDK preserves the fast off-chain hot path. Receipts are created, signed, and stored instantly. On-chain anchoring happens asynchronously via epoch finalization. The SDK is "hybrid by design" — not "blockchain-first."

```
Request -> Receipt (instant, off-chain) -> MMR append (in-memory)
                                              -> Epoch finalize (async, batched)
                                                  -> Anchor to Solana + EVM (async)
```

Developers never wait for a blockchain transaction in the hot path.

### 2.2 Passport is the Universal Wrapper

Every AI asset flows through a passport: models, agents, tools, compute, datasets. The passport carries identity (NFT on Solana/EVM), payment gates, schema validation, and chain anchoring. `lucid.passport` is the most important namespace.

### 2.3 Multi-Chain Native

Lucid is chain-agnostic by design. The constructor accepts multiple chains. Solana is the default execution and settlement rail, but EVM chains participate equally in epoch anchoring, passport registration, and payment gating.

### 2.4 Zero Stubs in Shipped Surface

No `throw "not implemented"` reaches developers. Chain features that aren't ready return typed `ChainFeatureUnavailable` errors. Preview features live behind `lucid.preview.*` — clearly labeled, opt-in.

### 2.5 Nothing Gets Deleted

All existing code stays in the repository. Experimental features compile, have tests, and have a clear promotion path to stable. The engine's internal structure does not change.

## 3. Package Architecture

### 3.1 Three Packages

| Package | Published to npm | Purpose |
|---------|:---:|---------|
| `@lucid-l2/sdk` | Yes | Main developer SDK — `new Lucid()` entry point, embeddable in any Node.js process |
| `@lucid-l2/gateway-lite` | Yes | Express server — run as a standalone process on port 3001 |
| `@lucid-l2/engine` | No (workspace-only) | Internal truth library — shared by SDK and gateway-lite |

### 3.2 Dependency Rules (ESLint-enforced)

```
sdk -> engine             OK (SDK is a facade over engine)
gateway-lite -> engine    OK (server uses engine)
engine -> sdk             FORBIDDEN
engine -> gateway-lite    FORBIDDEN (already enforced)
sdk -> gateway-lite       FORBIDDEN (SDK is HTTP-agnostic)
```

### 3.3 Existing HTTP Clients

| Package | Action |
|---------|--------|
| `raijin-labs-lucid-ai` (Speakeasy-generated) | Freeze. No new work. Deprecate when `@lucid-l2/sdk` ships. |
| `@lucidlayer/sdk` (manual) | Freeze. No new work. Deprecate when `@lucid-l2/sdk` ships. |
| `packages/sdk-py` (Python) | Keep. Update to match new API surface after TS SDK ships. |

Platform-core will ship its own HTTP client for the hosted gateway API. That is not this SDK's concern.

### 3.4 Three Modes of Use

```bash
# Mode 1: Embed (library — import into your Node.js app)
import { Lucid } from '@lucid-l2/sdk'
const lucid = new Lucid({ ... })

# Mode 2: Serve (run the gateway-lite Express server)
npx @lucid-l2/gateway-lite --config lucid.config.ts

# Mode 3: CLI (deploy agents, check status)
npx @lucid-l2/sdk deploy <passport_id> railway
```

## 4. SDK Interface Design

### 4.1 Constructor

```typescript
import { Lucid } from '@lucid-l2/sdk'

const lucid = new Lucid({
  // Required
  orchestratorKey: process.env.LUCID_SECRET_KEY,

  // Chains (at least one required)
  chains: {
    solana: {
      rpc: 'https://api.devnet.solana.com',
      keypairPath: '~/.config/solana/id.json',  // or keypair: Uint8Array
    },
    evm: {
      rpc: 'https://base-sepolia.g.alchemy.com/...',
      privateKey: process.env.EVM_PRIVATE_KEY,
    },
  },

  // Anchoring (which chains get epoch roots)
  anchoringChains: ['solana-devnet', 'base'],

  // Storage
  db: process.env.DATABASE_URL,  // PostgreSQL

  // Optional
  nftProvider: 'metaplex-core',     // 'token2022' | 'metaplex-core' | 'evm-erc721' | 'mock'
  deployTarget: 'railway',          // 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana'
  depinStorage: 'arweave',          // 'arweave' | 'lighthouse' | 'mock'
  logger: console,                  // any object with info/warn/error methods
})
```

### 4.2 Namespaces (Hero Order)

The three hero namespaces express Lucid's core thesis and appear first in all docs:

```typescript
// 1. Passport — portable identity for AI assets
lucid.passport.create({ type: 'model', slug: 'gpt-4o-wrapper', meta: { ... } })
lucid.passport.get(passportId)
lucid.passport.update(passportId, { ... })
lucid.passport.list({ type: 'agent' })
lucid.passport.anchor(passportId, { chains: ['solana-devnet', 'base'] })
lucid.passport.setPaymentGate(passportId, { price: 1000, token: 'LUCID' })

// 2. Receipt — cryptographic proof of every AI interaction
lucid.receipt.create({ runId, modelPassportId, computePassportId, latencyMs, tokens: { in: 100, out: 50 } })
lucid.receipt.get(receiptId)
lucid.receipt.verify(receiptId)
lucid.receipt.prove(receiptId)  // MMR inclusion proof
lucid.receipt.list({ epochId })

// 3. Epoch — asynchronous batch anchoring to blockchain
lucid.epoch.current()
lucid.epoch.finalize(epochId)
lucid.epoch.anchor(epochId)     // fans out to all anchoringChains
lucid.epoch.verify(epochId, chain)
lucid.epoch.list()
```

Supporting namespaces:

```typescript
// Agent — deploy and manage AI agents
lucid.agent.deploy(passportId, 'railway', { env: { ... } })
lucid.agent.status(passportId)
lucid.agent.logs(passportId, { tail: 100 })
lucid.agent.terminate(passportId)
lucid.agent.wallet.create(passportId)
lucid.agent.wallet.balance(passportId)
lucid.agent.marketplace.list(passportId)

// Payment — x402 grants and revenue splits
lucid.payment.createGrant({ amount, recipient, expiry })
lucid.payment.verifyGrant(grantHeader)
lucid.payment.calculateSplit(receipt)
lucid.payment.settle(epochId)

// Deploy — image building and deployer access
lucid.deploy.build(passportId, artifact)
lucid.deploy.push(passportId, tag)
lucid.deploy.targets()

// Crypto — low-level primitives
lucid.crypto.hash(data)
lucid.crypto.sign(message)
lucid.crypto.verify(signature, publicKey, message)
lucid.crypto.canonicalJson(obj)
lucid.crypto.mmr.append(leaf)
lucid.crypto.mmr.root()
lucid.crypto.mmr.prove(index)

// Chain — adapter access and capability introspection
lucid.chain.capabilities('solana')
// Returns: { epoch: true, passport: true, escrow: true, verifyAnchor: false,
//            sessionKeys: true, zkml: false, paymaster: false }
lucid.chain.capabilities('evm')
// Returns: { epoch: true, passport: true, escrow: false, verifyAnchor: true,
//            sessionKeys: false, zkml: true, paymaster: true }
lucid.chain.health('solana')
lucid.chain.adapter('solana')  // escape hatch to raw adapter
```

### 4.3 Experimental Namespace

Features that exist in the codebase but are not production-ready. Clearly labeled, opt-in, may change without notice.

```typescript
// Experimental — not covered by semver guarantees
lucid.preview.reputation    // Providers, syncers, algorithms
lucid.preview.identity      // TBA, ERC-7579, cross-chain bridge, ERC-8004 registries
lucid.preview.zkml          // zkML verification
```

Accessing `lucid.preview` logs a one-time warning:
```
[lucid] Warning: preview features are not covered by semver stability guarantees.
```

### 4.4 Subpath Exports (Power Users)

For tree-shaking and direct module access:

```typescript
// Subpath imports (advanced, for power users)
import { createPassport } from '@lucid-l2/sdk/passports'
import { createReceipt, verifyReceipt } from '@lucid-l2/sdk/receipts'
import { anchorEpoch } from '@lucid-l2/sdk/epochs'
import { getDeployer } from '@lucid-l2/sdk/deploy'
import { LucidError, ChainFeatureUnavailable } from '@lucid-l2/sdk/errors'
import type { Passport, Receipt, Epoch } from '@lucid-l2/sdk/types'
```

package.json exports field:

```json
{
  "name": "@lucid-l2/sdk",
  "version": "0.1.0",
  "exports": {
    ".":              { "import": "./dist/esm/index.js", "require": "./dist/cjs/index.js", "types": "./dist/types/index.d.ts" },
    "./passports":    { "import": "./dist/esm/passports.js", "types": "./dist/types/passports.d.ts" },
    "./receipts":     { "import": "./dist/esm/receipts.js", "types": "./dist/types/receipts.d.ts" },
    "./epochs":       { "import": "./dist/esm/epochs.js", "types": "./dist/types/epochs.d.ts" },
    "./agents":       { "import": "./dist/esm/agents.js", "types": "./dist/types/agents.d.ts" },
    "./payments":     { "import": "./dist/esm/payments.js", "types": "./dist/types/payments.d.ts" },
    "./deploy":       { "import": "./dist/esm/deploy.js", "types": "./dist/types/deploy.d.ts" },
    "./crypto":       { "import": "./dist/esm/crypto.js", "types": "./dist/types/crypto.d.ts" },
    "./chains":       { "import": "./dist/esm/chains.js", "types": "./dist/types/chains.d.ts" },
    "./errors":       { "import": "./dist/esm/errors.js", "types": "./dist/types/errors.d.ts" },
    "./types":        { "types": "./dist/types/types.d.ts" },
    "./preview": { "import": "./dist/esm/preview/index.js", "types": "./dist/types/preview/index.d.ts" }
  }
}
```

## 5. Error Hierarchy

```typescript
export class LucidError extends Error {
  code: string
  cause?: Error
}

// Chain errors
export class ChainError extends LucidError { chain: string }
export class SolanaError extends ChainError { txSignature?: string }
export class EVMError extends ChainError { txHash?: string }
export class ChainFeatureUnavailable extends ChainError {
  feature: string
  // "escrow is not yet available on evm"
}

// Domain errors
export class ValidationError extends LucidError { field: string; expected: string }
export class AuthError extends LucidError {}
export class DeployError extends LucidError { target: string; deploymentId?: string }

// Infrastructure errors
export class NetworkError extends LucidError { url: string; statusCode?: number }
export class TimeoutError extends LucidError { operationMs: number; limitMs: number }
export class RateLimitError extends LucidError { retryAfterMs?: number }
```

## 6. Ship vs Experimental Boundary

### 6.1 What Ships (Stable)

| Namespace | Engine Module | Status | Notes |
|-----------|--------------|--------|-------|
| `lucid.passport` | engine/passport + engine/storage | Production-ready | All 5 asset types, both chains |
| `lucid.receipt` | engine/receipt | Production-ready | Create, sign, verify, prove |
| `lucid.epoch` | engine/receipt (epoch + anchoring) | Production-ready | Multi-chain anchoring |
| `lucid.agent` | engine/agent + engine/deploy | Production-ready | 6 deployers, wallets, marketplace |
| `lucid.payment` | engine/finance | Production-ready | 402 grants, splits, settlement |
| `lucid.deploy` | engine/deploy | Production-ready | ImageBuilder + 6 deployers |
| `lucid.crypto` | engine/crypto | Production-ready | Hash, sign, MMR, canonicalJson |
| `lucid.chain` | engine/chains | Production-ready | Capabilities, health, adapters |

### 6.2 What Goes to Experimental

| Namespace | Engine Module | Why Deferred | Promotion Criteria |
|-----------|-------------|-------------|-------------------|
| `preview.reputation` | engine/reputation | Partner-dependent (Metaplex MIP #52, 8004, SATI, SAID) | Partners ship their standards |
| `preview.identity` | engine/identity | ERC-7579 not wired, TBA partially tested | Full integration test suite passes |
| `preview.zkml` | engine zkml refs | Solana lacks alt_bn128 precompiles; on-chain program accepts any proof | Real Groth16 verification works |

### 6.3 Internal to Engine (Never in SDK)

| Module | Reason |
|--------|--------|
| engine/db | Database pool — SDK exposes config, not raw pool |
| engine/jobs | Background daemons — gateway-lite starts these, not SDK users |
| engine/runtime | 7 runtime adapters — used internally by agent deployment |
| engine/config | Internal config — SDK exposes constructor options |

## 7. Engine Changes (Minimal, Non-Breaking)

The engine's internal directory structure does NOT change. The only changes:

### 7.1 Expand engine/src/index.ts

Currently exports only crypto + config (19 lines). Expand to export all public modules so the SDK can import them cleanly:

```typescript
// Crypto
export * from './crypto/hash'
export * from './crypto/signing'
export * from './crypto/canonicalJson'
export { MerkleTree } from './crypto/merkleTree'
export { AgentMMR } from './crypto/mmr'
export * from './crypto/schemaValidator'

// Receipt & Epoch
export * from './receipt'

// Passport
export * from './passport'

// Chains
export * from './chains'

// Finance
export * from './finance'

// Deploy
export * from './deploy'

// Agent
export * from './agent'

// Assets
export * from './assets/nft'
export * from './assets/shares'

// Storage
export * from './storage'

// Config
export * from './config/config'
export * from './config/paths'

// Types
export * from './types'
```

### 7.2 Add Capability Methods to Chain Adapters

Each adapter gets a `capabilities()` method that returns a typed object instead of letting methods throw:

```typescript
interface ChainCapabilities {
  epoch: boolean
  passport: boolean
  escrow: boolean
  verifyAnchor: boolean
  sessionKeys: boolean
  zkml: boolean
  paymaster: boolean
}
```

### 7.3 Wrap Raw Throws

Methods that currently `throw "not implemented"` get wrapped to throw typed errors:

```typescript
// Before (in adapter)
throw new Error('Escrow not yet implemented on EVM')

// After
throw new ChainFeatureUnavailable('escrow', 'evm')
```

## 8. SDK Package Structure

```
offchain/packages/sdk/
  package.json
  tsconfig.json
  tsup.config.ts          # Build: CJS + ESM + DTS
  src/
    index.ts              # new Lucid() constructor + namespace wiring
    lucid.ts              # Lucid class definition
    passports.ts          # Wraps engine/passport
    receipts.ts           # Wraps engine/receipt
    epochs.ts             # Wraps engine/receipt (epoch/anchoring)
    agents.ts             # Wraps engine/agent + engine/deploy
    payments.ts           # Wraps engine/finance
    deploy.ts             # Wraps engine/deploy
    crypto.ts             # Re-exports engine/crypto (already clean)
    chains.ts             # Wraps engine/chains + capabilities
    errors.ts             # Error hierarchy
    types.ts              # Curated public types (Passport, Receipt, Epoch, etc.)
    preview/
      index.ts            # { reputation, identity, zkml }
      reputation.ts       # Wraps engine/reputation
      identity.ts         # Wraps engine/identity
      zkml.ts             # Wraps engine zkml refs
  __tests__/
    lucid.test.ts
    passports.test.ts
    receipts.test.ts
    epochs.test.ts
    ...
```

## 9. P0 Fixes (Gate SDK Release)

These must be completed before `@lucid-l2/sdk` v0.1.0 ships:

| # | Fix | Location | Effort |
|---|-----|----------|--------|
| 1 | Escrow access control: validate signer is depositor or wallet owner in release_escrow, claim_timeout, dispute_escrow | `programs/lucid-agent-wallet/src/lib.rs` | 1 day |
| 2 | Escrow state: replace in-memory `Map()` with DB table | `engine/src/finance/escrowService.ts` | 1 day |
| 3 | Passport overflow: replace `.unwrap()` with `.ok_or(ErrorCode::Overflow)?` | `programs/lucid-passports/src/lib.rs` | 1 hour |
| 4 | EVM escrow adapter: wire to LucidEscrow.sol contract | `engine/src/chains/evm/adapter.ts` | 1 day |
| 5 | Solana verifyAnchor: implement PDA read | `engine/src/chains/solana/adapter.ts` | 1 day |
| 6 | gas-utils: remove mint_and_distribute stub or implement | `programs/gas-utils/src/lib.rs` | 2 hours |
| 7 | Engine index.ts: expand exports | `engine/src/index.ts` | 1 day |
| 8 | Replace all raw `throw "not implemented"` with typed errors | engine/src/chains/ | 1 day |
| 9 | SDK package scaffold + Lucid class + all namespaces | `packages/sdk/` | 3 days |
| 10 | Tests for agent-wallet, gas-utils programs | `tests/` | 2 days |

**Total estimated effort: ~12 days**

## 10. P1 Fixes (Ship Week)

| # | Fix | Effort |
|---|-----|--------|
| 11 | SDK documentation + quickstart guide | 2 days |
| 12 | CI pipeline: type-check + test + build on PR | 1 day |
| 13 | npm publish pipeline (@lucid-l2/sdk) | 1 day |

## 11. P2 Fixes (Fast Follow)

| # | Fix | Effort |
|---|-----|--------|
| 14 | Python SDK update to match new API surface | 3 days |
| 15 | Deprecation notices on old HTTP SDKs | 1 day |
| 16 | OpenTelemetry pass-through in Lucid constructor | 1 day |
| 17 | typedoc generation from SDK source | 1 day |

## 12. What We Explicitly Do NOT Build

| Item | Why Not |
|------|---------|
| Plugin system (`lucid.use()`) | Premature. Factory pattern in engine is sufficient. Revisit when third-party demand exists. |
| API versioning (`apiVersion: "2026-01-01"`) | Wrong pattern for an in-process library. Semver in package.json handles this. |
| Streaming API | Inference streaming belongs in platform-core (TrustGate). L2 SDK is orchestration/settlement. |
| 13 separate npm packages | Maintenance hell at current team size. One SDK package with subpath exports. |
| Formal observability config | Logger pass-through is sufficient for MVP. Full OpenTelemetry integration is P2. |

## 13. Chain Parity at SDK Ship

### Full Parity (both chains work identically via SDK)

| Feature | Solana | EVM |
|---------|--------|-----|
| Epoch anchoring | thought_epoch PDA | EpochRegistry.sol |
| Passport registration + payment gates | lucid_passports | LucidPassportRegistry.sol |
| Agent wallet creation | PDA wallets | ERC-6551 TBA |
| Revenue splits | gas_utils CPI | ERC-7579 PayoutModule |
| NFT minting | Token-2022 / Metaplex Core | ERC-721 + auto-TBA |
| `lucid.chain.capabilities()` | Returns accurate map | Returns accurate map |

### Known Gaps (Documented via capabilities API)

| Feature | Solana | EVM | Returned by capabilities() |
|---------|--------|-----|---------------------------|
| Escrow | YES | P0 fix (#4) | `escrow: true/false` |
| Verify anchor | P0 fix (#5) | YES | `verifyAnchor: true/false` |
| Session keys | YES | NOT YET | `sessionKeys: true/false` |
| zkML on-chain | OFF-CHAIN ONLY | YES | `zkml: true/false` |
| ERC-4337 paymaster | N/A | YES | `paymaster: true/false` |

Developers discover gaps via `lucid.chain.capabilities(chain)` and get typed `ChainFeatureUnavailable` errors if they call an unsupported method.

## 14. Success Criteria

The SDK is ready to ship when:

1. All P0 fixes are merged and tested
2. `new Lucid()` constructor works with Solana-only, EVM-only, and dual-chain configs
3. All hero flows work end-to-end: passport create -> receipt create -> epoch finalize -> anchor
4. `lucid.chain.capabilities()` returns accurate data for both chains
5. Zero `throw "not implemented"` in stable namespaces
6. All preview features accessible only via `lucid.preview.*`
7. npm package builds (CJS + ESM + types) without errors
8. Quickstart example runs in under 5 minutes
