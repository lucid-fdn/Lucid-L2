# Solana Multi-Registry Identity Integration

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Metaplex `mpl-agent-registry` + QuantuLabs `8004-solana` — registry-agnostic identity layer for AI agents on Solana

## Problem

Solana's agent identity landscape has multiple competing registries. Lucid currently has:

- **Metaplex Core** — NFT minting only (`MetaplexCoreProvider`), no `registerIdentityV1` call
- **QuantuLabs** — reputation sync only (`Solana8004Syncer`), no identity registration
- **Lucid `lucid_passports`** — canonical passport registry, always the source of truth

Missing: an abstraction that lets Lucid register agent identity on external Solana registries and project passport data to them for discoverability.

## Design Decisions

1. **Separate interfaces, shared internals (Approach B)** — `ISolanaIdentityRegistry` for identity registration, `IReputationSyncer` for reputation sync. Implementations for the same registry share an SDK connection internally.

2. **Registry-per-module (Approach 1)** — Each registry (Metaplex, QuantuLabs) gets its own directory containing identity provider, reputation syncer, and shared connection. Co-located for clarity.

3. **Two registries only** — Metaplex + QuantuLabs. SATI/SAID stubs stay in `reputation/syncers/` unchanged — they're reputation-only placeholders with no identity registration capability.

4. **External registries are projections** — `lucid_passports` is always canonical. External registration is fire-and-forget; failure never blocks passport creation.

## Type Imports

- `AssetType` — imported from `reputation/types` (consistent with `IReputationSyncer`). Both `PassportType` in `identity/stores/passportStore.ts` and `AssetType` in `reputation/types.ts` are structurally identical (`'model' | 'compute' | 'tool' | 'agent' | 'dataset'`). We import from reputation to stay consistent with the syncer pattern. If this becomes a problem, extract to `shared/types/` later.
- `Passport` — imported from `identity/stores/passportStore.ts`.
- `TxReceipt` — imported from `reputation/types`.
- `ERC8004AgentMetadata` — imported from `identity/registries/types.ts`.

## Interface

```typescript
interface ISolanaIdentityRegistry {
  readonly registryName: string;              // 'metaplex' | 'quantulabs'
  readonly supportedAssetTypes: AssetType[];  // both: ['agent'] today

  register(passport: Passport, options?: RegistrationOptions): Promise<RegistrationResult | null>;
  resolve(agentId: string): Promise<ExternalIdentity | null>;
  update(agentId: string, metadata: Partial<RegistrationMetadata>): Promise<TxReceipt | null>;
  deregister(agentId: string): Promise<TxReceipt | null>;
  isAvailable(): Promise<boolean>;
}

interface RegistrationOptions {
  skipIfExists?: boolean;
  registrationDocUri?: string;
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

// Extends ERC8004AgentMetadata with structured services (matching the Metaplex registration doc format)
interface ERC8004RegistrationDoc extends ERC8004AgentMetadata {
  type: string;  // "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
  services?: Array<{ name: string; endpoint: string; version?: string; skills?: string[]; domains?: string[] }>;
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: string[];
  active?: boolean;
}

interface RegistrationMetadata {
  name: string;
  description: string;
  services?: Array<{ name: string; endpoint: string; version?: string; skills?: string[] }>;
  supportedTrust?: string[];
  image?: string;
}
```

**Note on `register()` return type:** Returns `RegistrationResult | null`. `null` when the registry doesn't support identity registration (e.g., QuantuLabs SDK is reputation-only). Callers must check `isAvailable()` or null-guard the result.

## Metaplex Implementation

### MetaplexConnection

Shared lazy-loaded Umi instance with `mplCore()` + `mplAgentIdentity()` plugins. Reads `SOLANA_RPC_URL`, `LUCID_ORCHESTRATOR_SECRET_KEY`, `METAPLEX_COLLECTION_ADDRESS` from env.

New dependency: `@metaplex-foundation/mpl-agent-registry`

### MetaplexIdentityRegistry

**`register(passport)`:**

Requires `passport.nft_mint` to be set (the Metaplex Core asset must already exist). If `nft_mint` is null, logs a warning and returns `null` — the NFT mint must complete before identity registration.

1. Build `ERC8004RegistrationDoc` from passport metadata:
   - `type`: `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`
   - `name`: `passport.name ?? passport.metadata?.name ?? passport.passport_id`
   - `description`: `passport.description ?? passport.metadata?.description ?? ''`
   - Map `passport.type` → capabilities (`agent` → `["autonomous"]`, `model` → `["inference"]`, `tool` → `["integration"]`)
   - Map `passport.metadata.endpoints` → services array. Endpoints live in `passport.metadata.endpoints` (a `Record<string, any>` set via `PassportManager.updateEndpoints()`). Keys are endpoint names, values contain `url`, `type` (mcp/a2a/web/rest). If no endpoints, `services` is empty array.
   - Add `registrations: [{ agentId: passport.nft_mint, agentRegistry: "solana:101:metaplex" }]`
   - Add `supportedTrust: ["reputation"]` (Lucid backs it)
   - `active: passport.status === 'active'`
2. Upload registration doc to DePIN via `AnchorDispatcher.dispatch()` (artifact type: `agent_registration`, permanent tier)
3. Call `registerIdentityV1(umi, { asset: passport.nft_mint, collection, agentRegistrationUri })`
4. One-time: `registerExecutiveV1()` for Lucid operator wallet (check PDA exists first, cache flag)
5. `delegateExecutionV1()` for this agent → Lucid's executive profile
6. Store result on passport (see "Persisting Registration Results" section below)
7. Return `RegistrationResult`

**`resolve(agentId)`:** `findAgentIdentityV1Pda()` → fetch registration doc → parse as `ExternalIdentity`

**`update(agentId, metadata)`:** Re-upload registration doc, update Core asset URI via `updateV1()`

**`deregister(agentId)`:** Not supported by `mpl-agent-registry` (one-time registration). Returns `null`.

### MetaplexReputationSyncer (implements IReputationSyncer)

Reads/writes reputation via the Core asset's Attributes plugin:

- **`pullFeedback()`:** Read `reputation:*` attribute keys → map to `ExternalFeedback[]`
- **`pullSummary()`:** Read `reputation:avg_score`, `reputation:feedback_count`
- **`pushFeedback()`:** Call `syncReputationPlugin()` via shared connection (existing prep code, now wired)
- **`resolveExternalId(passportId)`:** Looks up `nft_mint` via `getPassportStore().get(passportId)`. Returns `passport.nft_mint` or `null` if no NFT minted. Constructor takes a `mintLookup: (passportId: string) => Promise<string | null>` function to avoid a direct `PassportStore` dependency — the factory injects `async (id) => (await getPassportStore().get(id))?.nft_mint ?? null`.

## QuantuLabs Implementation

### QuantuLabsConnection

Shared lazy-loaded `SolanaSDK` instance from `8004-solana` (already in package.json ^0.8.0).

### QuantuLabsIdentityRegistry

Uses SDK registration methods if available (`sdk.register()`, `sdk.getAgent()`, `sdk.updateAgent()`). If SDK is reputation-only:

- `register()` returns `null` (return type is `RegistrationResult | null`)
- `resolve()` returns `null`
- `isAvailable()` returns `false` for identity, `true` for reputation (the connection is still useful for the syncer)
- A `hasIdentitySupport` readonly boolean on the class indicates whether the SDK supports registration, detected at construction time by checking for `sdk.register` method existence

### QuantuLabsReputationSyncer (replaces Solana8004Syncer)

Direct refactor of existing `Solana8004Syncer` — identical behavior, shared `QuantuLabsConnection`:

- `pullFeedback()` → `sdk.readAllFeedback(passportId)`
- `pullSummary()` → `sdk.getSummary(passportId)`
- `pushFeedback()` → `sdk.giveFeedback(passportId, score, category)`

## Factory & Wiring

### Identity Registry Factory

```typescript
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
        const conn = getMetaplexConnection(); // module-level singleton
        _registries.push(new MetaplexIdentityRegistry(conn));
        break;
      }
      case 'quantulabs': {
        const conn = getQuantuLabsConnection(); // module-level singleton
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

**Connection sharing mechanism:** Each registry module exports a `get<Name>Connection()` singleton function (e.g., `getMetaplexConnection()` from `metaplex/MetaplexConnection.ts`). Both the identity registry and reputation syncer call the same function, ensuring one SDK connection per registry regardless of which factory initializes first.

### Reputation Factory Changes

- New case `'metaplex'` → `new MetaplexReputationSyncer(getMetaplexConnection(), mintLookup)`
- Case `'8004'` → `new QuantuLabsReputationSyncer(getQuantuLabsConnection())` (backward-compatible)
- Connection sharing: both factories call the same `get<Name>Connection()` singletons — no dedup logic needed, the module-level singletons handle it

### PassportManager Integration

The NFT mint in `createPassport()` is currently fire-and-forget (`.catch()`). Identity registration requires `nft_mint` to be set (at least for Metaplex). Two options:

**Chosen: await the NFT mint, then register.** Change the NFT mint from fire-and-forget to awaited. If NFT mint fails, passport is still created (existing behavior), but identity registration is skipped. If NFT mint succeeds, identity registration runs as a follow-up fire-and-forget:

```typescript
// Step 1: NFT mint (now awaited instead of fire-and-forget)
if (NFT_MINT_ON_CREATE) {
  await this.attemptNFTMint(passport, chain);  // sets passport.nft_mint on success
}

// Step 2: External identity registration (fire-and-forget, requires nft_mint)
const registries = getIdentityRegistries();
for (const registry of registries) {
  if (registry.supportedAssetTypes.includes(passport.type)) {
    try {
      const result = await registry.register(passport, { skipIfExists: true });
      if (result) {
        // Persist the registration (see section below)
        await this.storeExternalRegistration(passport.passport_id, result);
      }
    } catch (err) {
      logger.warn(`[Identity] ${registry.registryName} registration failed: ${err}`);
    }
  }
}
```

Never blocks passport creation — passport is saved to store before this code runs. The NFT mint await only affects the identity registration step.

## Persisting Registration Results

After `register()` returns a `RegistrationResult`, persist it on the passport. Add an optional field to `Passport`:

```typescript
// In passportStore.ts — new optional field
external_registrations?: Record<string, {
  externalId: string;
  txSignature: string;
  registrationDocUri?: string;
  registeredAt: number;
}>;
// Key is registryName (e.g., 'metaplex', 'quantulabs')
```

`PassportManager.storeExternalRegistration()` calls `store.update(passportId, { external_registrations: merged })`. This allows:
- Tracking which registries a passport is published to
- `resolve()` can use the stored `externalId` instead of hitting the chain every time
- `update()` knows where to push changes

## File Structure

### New Files

```
engine/src/identity/registries/solana/
  ISolanaIdentityRegistry.ts
  factory.ts
  index.ts
  metaplex/
    MetaplexConnection.ts
    MetaplexIdentityRegistry.ts
    MetaplexReputationSyncer.ts
    index.ts
  quantulabs/
    QuantuLabsConnection.ts
    QuantuLabsIdentityRegistry.ts
    QuantuLabsReputationSyncer.ts
    index.ts
  __tests__/
    MetaplexIdentityRegistry.test.ts
    MetaplexReputationSyncer.test.ts
    QuantuLabsIdentityRegistry.test.ts
    QuantuLabsReputationSyncer.test.ts
    factory.test.ts
```

### Modified Files

| File | Change |
|---|---|
| `engine/src/identity/index.ts` | Re-export from `registries/solana/` |
| `engine/src/identity/stores/passportStore.ts` | Add `external_registrations` field to `Passport` interface |
| `engine/src/identity/passport/passportManager.ts` | Await NFT mint, add registry loop, add `storeExternalRegistration()` |
| `engine/src/reputation/index.ts` | Add `metaplex` case, redirect `8004` to new module |
| `engine/package.json` | Add `@metaplex-foundation/mpl-agent-registry` |

### Deleted Files

| File | Reason |
|---|---|
| `engine/src/reputation/syncers/Solana8004Syncer.ts` | Replaced by `quantulabs/QuantuLabsReputationSyncer.ts` |

### Migrated Tests

`Solana8004Syncer.test.ts` → `QuantuLabsReputationSyncer.test.ts` (same test cases, new import paths)

## Environment Variables

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `IDENTITY_REGISTRIES` | `metaplex,quantulabs` | (empty) | Which registries to publish to |
| `METAPLEX_COLLECTION_ADDRESS` | pubkey | (existing) | Metaplex Core collection |
| `REPUTATION_SYNCERS` | `8004,metaplex,evm,...` | (existing) | `8004` routes to QuantuLabs module |

## Backward Compatibility

- `REPUTATION_SYNCERS=8004` keeps working (maps to QuantuLabs module)
- `NFT_PROVIDER=metaplex-core` keeps working (`MetaplexCoreProvider` untouched)
- No API endpoint changes
- External registration is opt-in (`IDENTITY_REGISTRIES` defaults to empty)

## Strategic Position

```
lucid_passports (canonical, always)
  ├── Metaplex mpl-agent-registry (projection for discoverability)
  ├── QuantuLabs 8004-solana (projection for discoverability)
  └── Future registries (add a directory, implement interface)

Reputation flows:
  Lucid gateway traffic → lucid_reputation (canonical)
    ├── → Metaplex Core Attributes plugin (push)
    ├── → QuantuLabs 8004-solana feedback (push)
    ├── ← Metaplex plugin reads (pull)
    └── ← QuantuLabs feedback reads (pull)
```

Identity: Metaplex/QuantuLabs (where agents are discovered).
Reputation: Lucid (backed by real traffic data — the moat).
Validation: Lucid (receipts + MMR proofs + on-chain anchoring).
Rich passport: Lucid (attestations, x402, versioning, licensing — no one else does this).
