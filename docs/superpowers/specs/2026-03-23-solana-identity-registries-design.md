# Solana Multi-Registry Identity Projection

**Date:** 2026-03-23
**Status:** Approved (v2 — revised after architectural review)
**Scope:** Metaplex `mpl-agent-registry` + QuantuLabs `8004-solana` — async projection layer for AI agent identity on Solana

## Problem

Solana's agent identity landscape has multiple competing registries. Lucid currently has:

- **Metaplex Core** — NFT minting only (`MetaplexCoreProvider`), no `registerIdentityV1` call
- **QuantuLabs** — reputation sync only (`Solana8004Syncer`), no identity registration
- **Lucid `lucid_passports`** — canonical passport registry, always the source of truth

Missing: an abstraction that lets Lucid project passport identity to external Solana registries asynchronously, without coupling passport creation to external registry availability.

## Design Decisions

1. **Separate interfaces, shared internals** — `ISolanaIdentityRegistry` for identity projection, `IReputationSyncer` for reputation sync. Implementations for the same registry share an SDK connection internally.

2. **Registry-per-module** — Each registry (Metaplex, QuantuLabs) gets its own directory containing connection + identity + reputation. Co-located for clarity.

3. **Two registries only** — Metaplex + QuantuLabs. SATI/SAID stubs stay in `reputation/syncers/` unchanged.

4. **External registries are projections** — `lucid_passports` is always canonical. External registration never blocks passport creation. Projections are async, retryable, observable.

5. **Async job-driven projection** — Passport creation writes canonical state synchronously. NFT minting + external registry projection happen in a background job. No user request depends on external registry availability.

6. **Single registration doc builder** — One centralized function builds `ERC8004RegistrationDoc` from `Passport`. Registry adapters only handle transport and registry-specific publishing. No drift between registries.

7. **Capability model** — Registries declare what they support via a `capabilities` object, not via returning `null` for unsupported methods.

## Type Imports

- `AssetType` — from `reputation/types` (consistent with `IReputationSyncer`). Structurally identical to `PassportType`.
- `Passport` — from `identity/stores/passportStore.ts`.
- `TxReceipt` — from `reputation/types`.
- `ERC8004AgentMetadata` — from `identity/registries/types.ts`.

## Interface

```typescript
interface RegistryCapabilities {
  register: boolean;
  resolve: boolean;
  sync: boolean;
  deregister: boolean;
}

interface ISolanaIdentityRegistry {
  readonly registryName: string;              // 'metaplex' | 'quantulabs'
  readonly supportedAssetTypes: AssetType[];  // both: ['agent'] today
  readonly capabilities: RegistryCapabilities;

  // Project a Lucid passport to this external registry
  register(passport: Passport, options?: RegistrationOptions): Promise<RegistrationResult>;

  // Resolve an agent's identity from this registry
  resolve(agentId: string): Promise<ExternalIdentity | null>;

  // Re-project current passport state to this registry (rebuild doc from canonical, push)
  sync(passport: Passport): Promise<TxReceipt | null>;

  // Remove from this registry (only if capabilities.deregister === true)
  deregister(agentId: string): Promise<TxReceipt | null>;

  // Health check
  isAvailable(): Promise<boolean>;
}
```

**Key change from v1:** `update(agentId, metadata)` replaced with `sync(passport)`. Projections are always rebuilt from canonical passport state. No partial external metadata — eliminates drift risk.

**Capability model:** Callers check `registry.capabilities.deregister` before calling `deregister()`. Calling a method when `capabilities.X === false` throws `RegistryCapabilityError`. No more null-return semantics for unsupported operations.

```typescript
interface RegistrationOptions {
  skipIfExists?: boolean;
  registrationDocUri?: string;  // pre-uploaded doc URI (skip DePIN upload)
}

interface RegistrationResult {
  registryName: string;
  externalId: string;       // Metaplex: asset pubkey, QL: agent ID
  txSignature: string;
  registrationDocUri?: string;
}

interface ExternalIdentity {
  registryName: string;
  externalId: string;
  owner: string;
  metadata: ERC8004RegistrationDoc;
  registrationDocUri?: string;
}
```

## Registration Doc Builder (Centralized)

One function, used by all registries. No registry builds its own doc.

```typescript
// registration-doc/buildRegistrationDoc.ts

function buildRegistrationDocFromPassport(
  passport: Passport,
  options?: { agentRegistry?: string }
): ERC8004RegistrationDoc {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: passport.name ?? passport.metadata?.name ?? passport.passport_id,
    description: passport.description ?? passport.metadata?.description ?? '',
    capabilities: mapAssetTypeToCapabilities(passport.type),
    services: mapEndpointsToServices(passport.metadata?.endpoints),
    registrations: passport.nft_mint
      ? [{ agentId: passport.nft_mint, agentRegistry: options?.agentRegistry ?? 'solana:101:metaplex' }]
      : [],
    supportedTrust: ['reputation'],
    active: passport.status === 'active',
  };
}
```

**Mapping rules:**
- `passport.type` → capabilities: `agent` → `["autonomous"]`, `model` → `["inference"]`, `tool` → `["integration"]`, `compute` → `["execution"]`, `dataset` → `["data"]`
- `passport.metadata.endpoints` → services array. Endpoints are `Record<string, any>` set via `PassportManager.updateEndpoints()`. Keys are endpoint names, values contain `url`, `type` (mcp/a2a/web/rest). If no endpoints, `services` is `[]`.
- `supportedTrust` always includes `"reputation"` — Lucid backs it with traffic data.

```typescript
// registration-doc/types.ts

interface ERC8004RegistrationDoc extends ERC8004AgentMetadata {
  type: string;
  services?: Array<{ name: string; endpoint: string; version?: string; skills?: string[]; domains?: string[] }>;
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: string[];
  active?: boolean;
}
```

## Metaplex Implementation

### MetaplexConnection

Shared lazy-loaded Umi instance with `mplCore()` + `mplAgentIdentity()` plugins. Reads `SOLANA_RPC_URL`, `LUCID_ORCHESTRATOR_SECRET_KEY`, `METAPLEX_COLLECTION_ADDRESS` from env.

New dependency: `@metaplex-foundation/mpl-agent-registry`

```typescript
// metaplex/connection.ts — module-level singleton
let _conn: MetaplexConnection | null = null;
export function getMetaplexConnection(): MetaplexConnection {
  if (!_conn) _conn = new MetaplexConnection();
  return _conn;
}
export function resetMetaplexConnection(): void { _conn = null; }
```

### MetaplexIdentityRegistry

```typescript
capabilities: { register: true, resolve: true, sync: true, deregister: false }
```

**`register(passport)`:**

Requires `passport.nft_mint` to be set (the Core asset must already exist). Throws if `nft_mint` is null — callers (the projection job) ensure this precondition.

1. Build `ERC8004RegistrationDoc` via `buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:metaplex' })`
2. Upload registration doc to DePIN via `AnchorDispatcher.dispatch()` (artifact: `agent_registration`, permanent tier)
3. Call `registerIdentityV1(umi, { asset: passport.nft_mint, collection, agentRegistrationUri })`
4. One-time: `registerExecutiveV1()` for Lucid operator wallet (check PDA exists first, cache flag)
5. `delegateExecutionV1()` for this agent → Lucid's executive profile
6. Return `RegistrationResult`

**`resolve(agentId)`:** `findAgentIdentityV1Pda()` → fetch registration doc → parse as `ExternalIdentity`

**`sync(passport)`:** Rebuild doc via `buildRegistrationDocFromPassport()`, re-upload to DePIN, update Core asset URI via `updateV1()`. Always rebuilds from canonical passport — never accepts partial external metadata.

**`deregister(agentId)`:** Throws `RegistryCapabilityError` — Metaplex registration is permanent.

### MetaplexReputationSyncer (implements IReputationSyncer)

Reads/writes reputation via the Core asset's Attributes plugin:

- **`pullFeedback()`:** Read `reputation:*` attribute keys → map to `ExternalFeedback[]`
- **`pullSummary()`:** Read `reputation:avg_score`, `reputation:feedback_count`
- **`pushFeedback()`:** Call `syncReputationPlugin()` via shared connection (existing prep code, now wired)
- **`resolveExternalId(passportId)`:** Uses injected `mintLookup: (passportId: string) => Promise<string | null>` to resolve `passportId → nft_mint`. Factory injects `async (id) => (await getPassportStore().get(id))?.nft_mint ?? null`. Returns `null` if no NFT minted.

## QuantuLabs Implementation

### QuantuLabsConnection

Shared lazy-loaded `SolanaSDK` instance from `8004-solana` (already in package.json ^0.8.0).

```typescript
// quantulabs/connection.ts — module-level singleton
let _conn: QuantuLabsConnection | null = null;
export function getQuantuLabsConnection(): QuantuLabsConnection {
  if (!_conn) _conn = new QuantuLabsConnection();
  return _conn;
}
export function resetQuantuLabsConnection(): void { _conn = null; }
```

**Capability detection** happens in the connection layer, not via method-existence checks:

```typescript
class QuantuLabsConnection {
  readonly capabilities = {
    identityRegistration: false,  // set to true if SDK exposes register()
    reputation: true,
  };

  constructor() {
    const sdk = this.getSDK();
    this.capabilities.identityRegistration = typeof sdk?.register === 'function';
  }
}
```

### QuantuLabsIdentityRegistry

Capabilities derived from connection:

```typescript
get capabilities(): RegistryCapabilities {
  return {
    register: this.connection.capabilities.identityRegistration,
    resolve: this.connection.capabilities.identityRegistration,
    sync: this.connection.capabilities.identityRegistration,
    deregister: false,
  };
}
```

If `capabilities.register === false`, calling `register()` throws `RegistryCapabilityError`. The projection job checks capabilities before calling.

When registration IS supported:
- **`register(passport)`:** Build doc via `buildRegistrationDocFromPassport()` → `sdk.register(passportId, doc)`
- **`resolve(agentId)`:** `sdk.getAgent(agentId)`
- **`sync(passport)`:** Rebuild doc → `sdk.updateAgent(passportId, doc)`

### QuantuLabsReputationSyncer (replaces Solana8004Syncer)

Direct refactor of existing `Solana8004Syncer` — identical behavior, shared `QuantuLabsConnection`:

- `pullFeedback()` → `sdk.readAllFeedback(passportId)`
- `pullSummary()` → `sdk.getSummary(passportId)`
- `pushFeedback()` → `sdk.giveFeedback(passportId, score, category)`

## Async Projection Job

**Core architectural change from v1:** External identity registration is NOT part of `createPassport()`. It is an async background job.

```
createPassport()                          syncExternalIdentity job
─────────────────                         ──────────────────────────
1. Validate + store passport              Triggered by: passport creation event
2. Return immediately                     OR manual re-sync
                                          OR periodic reconciliation

                                          Steps:
                                          1. Mint NFT if missing (nft_mint === null)
                                          2. For each enabled registry:
                                             a. Check capabilities.register
                                             b. buildRegistrationDocFromPassport()
                                             c. registry.register() or registry.sync()
                                             d. Persist projection status
                                          3. On failure: log, increment attempt_count, schedule retry
```

### Job: `syncExternalIdentity`

Located in `engine/src/identity/projections/jobs/syncExternalIdentity.ts`.

**Triggers:**
- Passport creation (via existing event system or direct call from PassportManager after store write)
- Passport update (metadata change, status change, endpoint update)
- Manual re-sync (CLI or API)
- Periodic reconciliation (optional, env-controlled)

**Idempotency:** Uses `skipIfExists` for registration. For sync, always rebuilds from canonical. Safe to run multiple times.

**Retry:** On failure, logs error with passport_id + registry_name, increments `attempt_count` in projection status. Configurable retry with backoff (env: `IDENTITY_PROJECTION_MAX_RETRIES`, default: 3).

### Job: `syncExternalReputation`

Located in `engine/src/identity/projections/jobs/syncExternalReputation.ts`.

Pushes reputation updates to external registries. Triggered by reputation changes (new feedback, score recalculation). Uses the existing `IReputationSyncer.pushFeedback()` mechanism.

## Projection Status Persistence

### V1: Summary cache on Passport (now)

Add an optional field to `Passport` — this is a **read cache/summary**, not the operational ledger:

```typescript
// In passportStore.ts
external_registrations?: Record<string, {
  externalId: string;
  txSignature: string;
  registrationDocUri?: string;
  registeredAt: number;
  lastSyncedAt: number;
  status: 'synced' | 'failed' | 'pending';
}>;
// Key is registryName (e.g., 'metaplex', 'quantulabs')
```

Useful for fast reads ("is this passport on Metaplex?") and for `resolve()` to use `externalId` without hitting the chain.

### V2: Dedicated projection table (later)

When retries, version drift, and multi-attempt tracking become important:

```sql
CREATE TABLE passport_external_projections (
  id UUID PRIMARY KEY,
  passport_id TEXT NOT NULL,
  registry_name TEXT NOT NULL,
  external_id TEXT,
  tx_signature TEXT,
  registration_doc_uri TEXT,
  status TEXT NOT NULL,  -- 'pending' | 'synced' | 'failed'
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  attempt_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (passport_id, registry_name)
);
```

V1 summary field becomes a materialized view of this table. Not in scope for this implementation — flagged for when operational needs arise.

## Factory & Wiring

### Identity Registry Factory

```typescript
// factory.ts
// env: IDENTITY_REGISTRIES=metaplex,quantulabs (default: empty — opt-in)

let _registries: ISolanaIdentityRegistry[] | null = null;

function getIdentityRegistries(): ISolanaIdentityRegistry[] {
  if (_registries) return _registries;
  _registries = [];

  const names = (process.env.IDENTITY_REGISTRIES || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  for (const name of names) {
    switch (name) {
      case 'metaplex': {
        const conn = getMetaplexConnection();
        _registries.push(new MetaplexIdentityRegistry(conn));
        break;
      }
      case 'quantulabs': {
        const conn = getQuantuLabsConnection();
        _registries.push(new QuantuLabsIdentityRegistry(conn));
        break;
      }
    }
  }
  return _registries;
}

function resetIdentityRegistryFactory(): void {
  _registries = null;
}
```

**Connection sharing:** Each registry module exports `get<Name>Connection()` singleton. Both identity and reputation code call the same function — one SDK connection per registry.

### Reputation Factory Changes

- New case `'metaplex'` → `new MetaplexReputationSyncer(getMetaplexConnection(), mintLookup)`
- Case `'8004'` → `new QuantuLabsReputationSyncer(getQuantuLabsConnection())` (backward-compatible)

### PassportManager Integration

**No changes to `createPassport()` hot path.** Passport creation stays synchronous (store write only). The projection job is triggered after:

```typescript
// In passportManager.ts — after successful store write
const passport = await this.store.create(input);

// Trigger async projection (non-blocking)
this.triggerIdentityProjection(passport);

return { ok: true, data: passport };
```

`triggerIdentityProjection()` enqueues the `syncExternalIdentity` job. In V1 this can be a simple `setImmediate()` / `process.nextTick()` call. When the job infra matures, it becomes a proper queue entry.

Similarly, `updatePassport()` and `updateEndpoints()` trigger re-projection via `sync()`.

## File Structure

### New Files

```
engine/src/identity/projections/
  ISolanaIdentityRegistry.ts          # Interface + RegistryCapabilities + types
  factory.ts                          # getIdentityRegistries() singleton
  index.ts                            # Barrel export
  registration-doc/
    buildRegistrationDoc.ts           # Centralized doc builder
    types.ts                          # ERC8004RegistrationDoc
  metaplex/
    connection.ts                     # getMetaplexConnection() singleton
    identity.ts                       # MetaplexIdentityRegistry
    reputation.ts                     # MetaplexReputationSyncer
    index.ts
  quantulabs/
    connection.ts                     # getQuantuLabsConnection() singleton
    identity.ts                       # QuantuLabsIdentityRegistry
    reputation.ts                     # QuantuLabsReputationSyncer
    index.ts
  jobs/
    syncExternalIdentity.ts           # Async projection job (mint + register/sync)
    syncExternalReputation.ts         # Async reputation push job
  __tests__/
    buildRegistrationDoc.test.ts
    MetaplexIdentityRegistry.test.ts
    MetaplexReputationSyncer.test.ts
    QuantuLabsIdentityRegistry.test.ts
    QuantuLabsReputationSyncer.test.ts
    syncExternalIdentity.test.ts
    factory.test.ts
```

### Modified Files

| File | Change |
|---|---|
| `engine/src/identity/index.ts` | Re-export from `projections/` |
| `engine/src/identity/stores/passportStore.ts` | Add `external_registrations` summary cache field |
| `engine/src/identity/passport/passportManager.ts` | Add `triggerIdentityProjection()` after store writes (non-blocking) |
| `engine/src/reputation/index.ts` | Add `metaplex` case, redirect `8004` to new module |
| `engine/package.json` | Add `@metaplex-foundation/mpl-agent-registry` |

### Deleted Files

| File | Reason |
|---|---|
| `engine/src/reputation/syncers/Solana8004Syncer.ts` | Replaced by `quantulabs/reputation.ts` |

### Migrated Tests

`Solana8004Syncer.test.ts` → `QuantuLabsReputationSyncer.test.ts` (same cases, new imports)

## Environment Variables

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `IDENTITY_REGISTRIES` | `metaplex,quantulabs` | (empty) | Which registries to project to |
| `METAPLEX_COLLECTION_ADDRESS` | pubkey | (existing) | Metaplex Core collection |
| `REPUTATION_SYNCERS` | `8004,metaplex,evm,...` | (existing) | `8004` routes to QuantuLabs module |
| `IDENTITY_PROJECTION_MAX_RETRIES` | number | `3` | Max retry attempts per projection |

## Backward Compatibility

- `REPUTATION_SYNCERS=8004` keeps working (maps to QuantuLabs module)
- `NFT_PROVIDER=metaplex-core` keeps working (`MetaplexCoreProvider` untouched)
- No API endpoint changes
- No changes to `createPassport()` latency — projection is async
- External registration is opt-in (`IDENTITY_REGISTRIES` defaults to empty)

## Strategic Position

```
lucid_passports (canonical, always, synchronous)
  │
  ├── Projection Layer (async, retryable, observable)
  │   ├── Metaplex mpl-agent-registry
  │   ├── QuantuLabs 8004-solana
  │   └── Future registries (add a directory, implement interface)
  │
  └── Reputation Layer (bidirectional)
      ├── → Metaplex Core Attributes plugin (push)
      ├── → QuantuLabs 8004-solana feedback (push)
      ├── ← Metaplex plugin reads (pull)
      └── ← QuantuLabs feedback reads (pull)
```

Identity: Metaplex/QuantuLabs (where agents are discovered).
Reputation: Lucid (backed by real traffic data — the moat).
Validation: Lucid (receipts + MMR proofs + on-chain anchoring).
Rich passport: Lucid (attestations, x402, versioning, licensing — no one else does this).

## Architectural Principles (from review)

1. **Canonical domain first** — `passportStore` is truth. No third-party registry owns state.
2. **Projection is async** — External publishing is a background job. Retryable, observable, isolated.
3. **One doc builder** — `buildRegistrationDocFromPassport()` is the single source of derived state. Registries never build their own docs.
4. **Capability-driven adapters** — Registries declare what they support. No null-return semantics.
5. **Summary cache, not ledger** — `external_registrations` on passport is a fast-read cache. Operational tracking (retries, errors, attempts) belongs in a dedicated table (V2).
6. **No user request depends on external registry** — Passport CRUD is always fast. Projection health is a background concern.
