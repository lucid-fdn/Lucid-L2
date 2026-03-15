# Anchoring Control Plane Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all 7 DePIN upload producers into one AnchorDispatcher + AnchorRegistry, giving every anchored artifact a single CID registry, cross-reference lineage, and unified query surface.

**Architecture:** Bottom-up: types → registry (InMemory + Postgres) → dispatcher → verifier → factory → refactor 7 producers → routes → migration → tests. Registry is a Layer 3 projection — rebuildable from L1+L2.

**Tech Stack:** TypeScript, Jest, Express, PostgreSQL, existing `IDepinStorage` abstraction.

**Spec:** `docs/superpowers/specs/2026-03-14-anchoring-control-plane-design.md`

**Baseline:** 20 memory test suites, 269 tests passing.

**Execution order:** Chunk 1 (types + registry + dispatcher + verifier + factory) → Chunk 2 (refactor 7 producers + fix broken tests) → Chunk 3 (routes + migration + new tests). Tests green at each chunk boundary.

**Hard rules:**
- Every `dispatch()` caller MUST null-guard the result (`result === null` when kill switch active).
- `canonicalJson()` top-level import, never runtime require.
- Artifact IDs follow deterministic conventions per type.
- Dedup via UNIQUE constraint on `(artifact_type, artifact_id, content_hash)`.

---

## File Structure

### Files to Create (7)
| File | Responsibility |
|------|---------------|
| `engine/src/anchoring/types.ts` | `ArtifactType`, `StorageTier`, `AnchorRecord`, `AnchorRequest`, `AnchorResult` |
| `engine/src/anchoring/registry.ts` | `IAnchorRegistry`, `InMemoryAnchorRegistry`, `PostgresAnchorRegistry` |
| `engine/src/anchoring/dispatcher.ts` | `AnchorDispatcher` — upload + registry write |
| `engine/src/anchoring/verifier.ts` | `AnchorVerifier` — CID existence check |
| `engine/src/anchoring/index.ts` | Factory singletons + barrel exports |
| `gateway-lite/src/routes/core/anchorRoutes.ts` | REST API for anchor queries |
| `infrastructure/migrations/20260315_anchor_registry.sql` | `anchor_records` table |

### Files to Modify (11)
| File | Changes |
|------|---------|
| `jobs/epochArchiver.ts` | Replace `getPermanentStorage().uploadJSON()` with `getAnchorDispatcher().dispatch()` |
| `receipt/anchoringService.ts` | Replace batch proof upload with dispatcher |
| `memory/archivePipeline.ts` | Remove `depinStorage` constructor param, use dispatcher |
| `agent/agentDeploymentService.ts` | Replace upload with dispatcher |
| `passport/passportSyncService.ts` | Replace upload with dispatcher |
| `passport/passportManager.ts` | Replace NFT metadata upload with dispatcher |
| `jobs/mmrCheckpoint.ts` | Replace upload with dispatcher |
| `gateway-lite/src/routes/core/lucidLayerRoutes.ts` | Mount anchorRoutes |
| `memory/__tests__/archivePipeline.test.ts` | Update constructor mock (remove depinStorage) |
| `memory/__tests__/snapshot-e2e.test.ts` | Update constructor mock (remove depinStorage) |
| `CLAUDE.md` | Add anchoring control plane docs |

### New Test Files (1)
| File | Expected Tests |
|------|---------------|
| `engine/src/anchoring/__tests__/anchoring.test.ts` | ~16 |

---

## Chunk 1: Core Anchoring Module

### Task 1: Types

**Files:**
- Create: `offchain/packages/engine/src/anchoring/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export const ARTIFACT_TYPES = [
  'epoch_bundle', 'epoch_proof', 'memory_snapshot',
  'deploy_artifact', 'passport_metadata', 'nft_metadata', 'mmr_checkpoint',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export type StorageTier = 'permanent' | 'evolving';

export interface AnchorRecord {
  anchor_id: string;
  artifact_type: ArtifactType;
  artifact_id: string;
  agent_passport_id: string | null;
  producer: string;
  provider: string;
  storage_tier: StorageTier;
  cid: string;
  content_hash: string | null;
  url: string;
  size_bytes: number;
  status: 'uploaded' | 'verified' | 'unreachable';
  parent_anchor_id: string | null;
  chain_tx: Record<string, string> | null;
  metadata: Record<string, unknown>;
  created_at: number;
  verified_at: number | null;
}

export interface AnchorRequest {
  artifact_type: ArtifactType;
  artifact_id: string;
  agent_passport_id?: string;
  producer: string;
  storage_tier: StorageTier;
  payload: Buffer | object;
  tags?: Record<string, string>;
  content_hash?: string;
  parent_anchor_id?: string;
  chain_tx?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AnchorResult {
  anchor_id: string;
  cid: string;
  url: string;
  provider: string;
  size_bytes: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/anchoring/types.ts
git commit -m "feat(anchoring): types — ArtifactType, AnchorRecord, AnchorRequest, AnchorResult"
```

---

### Task 2: AnchorRegistry (InMemory + Postgres)

**Files:**
- Create: `offchain/packages/engine/src/anchoring/registry.ts`

- [ ] **Step 1: Create registry.ts**

Implement `IAnchorRegistry` interface, `InMemoryAnchorRegistry` class (Map-based, for tests), and `PostgresAnchorRegistry` class (uses `pool` from `../../db/pool`).

Interface methods:
- `create(record)` — UUID generation, default status='uploaded', created_at=Date.now()
- `getById(anchor_id)` — lookup by primary key
- `getByArtifact(artifact_type, artifact_id)` — returns array (supports re-anchoring)
- `getLatestByArtifact(artifact_type, artifact_id)` — latest by created_at DESC
- `getByCID(cid)` — lookup by CID
- `getByAgent(agent_passport_id, options?)` — filter by agent, optional artifact_type, limit
- `getLineage(anchor_id)` — walk parent_anchor_id chain recursively
- `updateStatus(anchor_id, status)` — set status + verified_at
- `count(filters?)` — count with optional filters

PostgresAnchorRegistry must convert TIMESTAMPTZ to Unix ms via `.getTime()`. Use parameterized queries throughout. Dedup: `ON CONFLICT (artifact_type, artifact_id, content_hash) DO NOTHING` in create().

InMemoryAnchorRegistry: use `crypto.randomUUID()` for anchor_id, store in `Map<string, AnchorRecord>`.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/anchoring/registry.ts
git commit -m "feat(anchoring): AnchorRegistry — IAnchorRegistry, InMemory + Postgres implementations"
```

---

### Task 3: AnchorDispatcher

**Files:**
- Create: `offchain/packages/engine/src/anchoring/dispatcher.ts`

- [ ] **Step 1: Create dispatcher.ts**

Per spec Section 3. Top-level imports (no runtime require). `dispatch()` returns `AnchorResult | null` (null when kill switch active).

Key: use `canonicalJson()` from `../../crypto/canonicalJson` for deterministic content hashing. `IDepinStorage` passed via constructor (permanent + evolving). Registry passed via constructor.

Upload: `uploadJSON` for objects, `uploadBytes` for Buffer. Then write registry record via `registry.create()`.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/anchoring/dispatcher.ts
git commit -m "feat(anchoring): AnchorDispatcher — unified upload + registry write"
```

---

### Task 4: AnchorVerifier

**Files:**
- Create: `offchain/packages/engine/src/anchoring/verifier.ts`

- [ ] **Step 1: Create verifier.ts**

Per spec Section 5. `verify(anchor_id)` checks CID existence via `storage.exists()`, updates registry status. `verifyBatch(anchor_ids)` sequential for now (concurrent is future optimization).

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/anchoring/verifier.ts
git commit -m "feat(anchoring): AnchorVerifier — CID existence verification"
```

---

### Task 5: Factory + Barrel Exports

**Files:**
- Create: `offchain/packages/engine/src/anchoring/index.ts`

- [ ] **Step 1: Create index.ts**

Per spec Section 6. Singleton factory functions: `getAnchorRegistry()`, `getAnchorDispatcher()`, `getAnchorVerifier()`, `resetAnchoring()`.

`ANCHOR_REGISTRY_STORE=memory` for tests, default postgres.

Re-export all types and classes.

- [ ] **Step 2: Run type-check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'`
Expected: No new errors from anchoring module.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/anchoring/index.ts
git commit -m "feat(anchoring): factory singletons + barrel exports"
```

---

## Chunk 2: Refactor 7 Producers

### Task 6: Refactor epochArchiver.ts

**Files:**
- Modify: `offchain/packages/engine/src/jobs/epochArchiver.ts`

- [ ] **Step 1: Replace upload with dispatcher**

Per spec Section 7.1. Add `agent_passport_id` to the SELECT query. Replace `getPermanentStorage().uploadJSON(bundle, ...)` with `getAnchorDispatcher().dispatch(...)`. Null-guard: `if (result) { await pool.query('UPDATE epochs SET archive_cid = ...'); }`. Remove `import('../storage/depin')` — no longer needed.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/jobs/epochArchiver.ts
git commit -m "refactor(anchoring): epochArchiver → AnchorDispatcher"
```

---

### Task 7: Refactor anchoringService.ts (batch proof)

**Files:**
- Modify: `offchain/packages/engine/src/receipt/anchoringService.ts`

- [ ] **Step 1: Replace batch proof upload**

Per spec Section 7.2. Find the batch flow section (~line 700-712) where `getPermanentStorage().uploadJSON(proof, ...)` is called. Replace with `getAnchorDispatcher().dispatch(...)`. This is a non-blocking best-effort upload — wrap in try/catch as before.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/receipt/anchoringService.ts
git commit -m "refactor(anchoring): anchoringService batch proof → AnchorDispatcher"
```

---

### Task 8: Refactor archivePipeline.ts

**Files:**
- Modify: `offchain/packages/engine/src/memory/archivePipeline.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/archivePipeline.test.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/snapshot-e2e.test.ts`
- Modify: `offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts` (update getArchivePipelineForAgent)

- [ ] **Step 1: Update archivePipeline constructor**

Remove `depinStorage` parameter. Constructor becomes: `constructor(private store: IMemoryStore, private getPassportPubkey: ...)`. Inside `createSnapshot()`, use `const { getAnchorDispatcher } = await import('../anchoring')` and call `dispatcher.dispatch()`. Handle null result (skip CID storage if disabled). Return `{ cid: result?.cid || 'disabled', snapshot_id }`.

- [ ] **Step 2: Update archivePipeline tests**

In `archivePipeline.test.ts` and `snapshot-e2e.test.ts`: remove `mockStorage` from constructor call. Mock the anchoring module instead:

```typescript
jest.mock('../anchoring', () => ({
  getAnchorDispatcher: () => ({
    dispatch: jest.fn().mockResolvedValue({ anchor_id: 'a1', cid: 'bafymock', url: 'http://mock/bafymock', provider: 'mock', size_bytes: 100 }),
  }),
}));
```

Update assertions to match new mock pattern.

- [ ] **Step 3: Update memoryRoutes.ts getArchivePipelineForAgent**

Remove `storage` from the ArchivePipeline constructor call in `getArchivePipelineForAgent()`. The pipeline no longer needs `depinStorage` injected — it gets the dispatcher internally.

- [ ] **Step 4: Run memory tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/ --no-coverage`
Expected: All 20 suites pass (269 tests).

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/archivePipeline.ts offchain/packages/engine/src/memory/__tests__/archivePipeline.test.ts offchain/packages/engine/src/memory/__tests__/snapshot-e2e.test.ts offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts
git commit -m "refactor(anchoring): archivePipeline → AnchorDispatcher + fix tests"
```

---

### Task 9: Refactor agentDeploymentService.ts

**Files:**
- Modify: `offchain/packages/engine/src/agent/agentDeploymentService.ts`

- [ ] **Step 1: Replace upload with dispatcher**

Per spec Section 7.4. Find the DePIN upload block (~line 249-264). Replace with `getAnchorDispatcher().dispatch(...)`. Null-guard the result. Remove the `import('../storage/depin')` and `getPermanentStorage()` calls.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/agent/agentDeploymentService.ts
git commit -m "refactor(anchoring): agentDeploymentService → AnchorDispatcher"
```

---

### Task 10: Refactor passportSyncService.ts

**Files:**
- Modify: `offchain/packages/engine/src/passport/passportSyncService.ts`

- [ ] **Step 1: Replace upload with dispatcher**

Per spec Section 7.5. Find the DePIN upload block (~line 315-330). Replace `getPermanentStorage().uploadJSON(passport.metadata, ...)` with `getAnchorDispatcher().dispatch(...)`. Null-guard: only set `depin_metadata_cid` if result is not null.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/passport/passportSyncService.ts
git commit -m "refactor(anchoring): passportSyncService → AnchorDispatcher"
```

---

### Task 11: Refactor passportManager.ts (NFT metadata)

**Files:**
- Modify: `offchain/packages/engine/src/passport/passportManager.ts`

- [ ] **Step 1: Replace NFT metadata upload with dispatcher**

Per spec Section 7.6. Find the upload block (~line 424-430). Replace `getPermanentStorage().uploadJSON(metadataJson, ...)` with `getAnchorDispatcher().dispatch(...)`. Set `metadataUri = anchorResult?.url || ''`. Null-guard.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/passport/passportManager.ts
git commit -m "refactor(anchoring): passportManager NFT metadata → AnchorDispatcher"
```

---

### Task 12: Refactor mmrCheckpoint.ts

**Files:**
- Modify: `offchain/packages/engine/src/jobs/mmrCheckpoint.ts`

- [ ] **Step 1: Replace upload with dispatcher**

Per spec Section 7.7. Find the upload block (~line 58-64). Replace `getEvolvingStorage().uploadJSON(checkpoint, ...)` with `getAnchorDispatcher().dispatch(...)`. Null-guard: only update `checkpoint_cid` if result is not null.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/jobs/mmrCheckpoint.ts
git commit -m "refactor(anchoring): mmrCheckpoint → AnchorDispatcher"
```

---

## Chunk 3: Routes + Migration + Tests

### Task 13: Anchor Routes

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/core/anchorRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/routes/core/lucidLayerRoutes.ts`

- [ ] **Step 1: Create anchorRoutes.ts**

Per spec Section 8. 5 routes:
- `GET /v1/anchors` — query by agent_passport_id, artifact_type, limit
- `GET /v1/anchors/:anchor_id` — single record
- `GET /v1/anchors/:anchor_id/lineage` — parent chain
- `POST /v1/anchors/:anchor_id/verify` — trigger CID verification
- `GET /v1/anchors/cid/:cid` — lookup by CID

All routes wrapped in try/catch with `res.status(500).json(...)` error handling.

- [ ] **Step 2: Mount in lucidLayerRoutes.ts**

Add: `import { anchorRouter } from './anchorRoutes';` and `lucidLayerRouter.use('/', anchorRouter);`

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/gateway-lite/src/routes/core/anchorRoutes.ts offchain/packages/gateway-lite/src/routes/core/lucidLayerRoutes.ts
git commit -m "feat(anchoring): REST routes — GET/POST /v1/anchors"
```

---

### Task 14: Migration SQL

**Files:**
- Create: `infrastructure/migrations/20260315_anchor_registry.sql`

- [ ] **Step 1: Create migration**

Full `anchor_records` table per spec Section 2 SQL. Include all indexes and the dedup UNIQUE constraint.

- [ ] **Step 2: Commit**

```bash
git add infrastructure/migrations/20260315_anchor_registry.sql
git commit -m "feat(anchoring): Postgres migration — anchor_records table"
```

---

### Task 15: Anchoring Tests

**Files:**
- Create: `offchain/packages/engine/src/anchoring/__tests__/anchoring.test.ts`

- [ ] **Step 1: Write test suite (~16 tests)**

Use `InMemoryAnchorRegistry` + mock `IDepinStorage`. Factory functions for mock storage that returns deterministic CIDs.

**Dispatcher tests (4):**
- uploads to permanent storage for permanent tier
- uploads to evolving storage for evolving tier
- writes registry record after upload (verify record exists)
- returns null when DEPIN_UPLOAD_ENABLED=false

**Registry tests (5):**
- create + getById round-trip
- getByArtifact returns array
- getLatestByArtifact returns most recent
- getByCID lookup
- getByAgent with artifact_type filter

**Lineage tests (2):**
- getLineage walks parent chain
- getLineage returns single record for no-parent

**Verifier tests (2):**
- verify sets status='verified' when CID exists
- verify sets status='unreachable' when CID missing

**Factory tests (2):**
- getAnchorDispatcher returns singleton
- resetAnchoring clears all singletons

**Content hash test (1):**
- dispatcher computes SHA-256 of canonical JSON payload

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/anchoring/__tests__/ --no-coverage`
Expected: ~16 tests passing.

- [ ] **Step 3: Run full suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All suites pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/anchoring/__tests__/anchoring.test.ts
git commit -m "test(anchoring): 16 tests — dispatcher, registry, verifier, lineage, factory"
```

---

### Task 16: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add anchoring section**

After the DePIN Storage Layer section, add:

```
### Anchoring Control Plane (Unified DePIN Interface)
All DePIN uploads go through `AnchorDispatcher.dispatch()` → `IDepinStorage` → `AnchorRegistry`.
7 artifact types: epoch_bundle, epoch_proof, memory_snapshot, deploy_artifact, passport_metadata, nft_metadata, mmr_checkpoint.
One CID registry (`anchor_records` table), cross-reference lineage via `parent_anchor_id`, unified query surface.
Routes: `GET /v1/anchors`, `GET /v1/anchors/:id`, `GET /v1/anchors/:id/lineage`, `POST /v1/anchors/:id/verify`, `GET /v1/anchors/cid/:cid`.
Env: `ANCHOR_REGISTRY_STORE=postgres|memory` (default: postgres).
Files: `engine/src/anchoring/` (types, dispatcher, registry, verifier, index).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add anchoring control plane to CLAUDE.md"
```

---

## Verification Checklist

After all 16 tasks:

- [ ] `cd offchain && npx jest --no-coverage 2>&1 | tail -5` — all suites pass
- [ ] `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'` — no new errors
- [ ] All 7 producers use `getAnchorDispatcher().dispatch()` instead of direct `IDepinStorage` calls
- [ ] `anchor_records` migration SQL ready to apply
- [ ] Routes mounted and accessible
