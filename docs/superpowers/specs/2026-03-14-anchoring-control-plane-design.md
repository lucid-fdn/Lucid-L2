# Anchoring Control Plane — Unified DePIN Interface

**Date:** 2026-03-14
**Status:** Design
**Author:** Kevin Wayne
**Depends on:** IDepinStorage (existing), 4-Layer Architecture decision

## Core Principle

> Unify the interface, not the meaning. Every DePIN upload is an `AnchoredArtifact`. Epoch bundles, memory snapshots, passport metadata, deploy artifacts, and MMR checkpoints are distinct artifact families with different lifecycles, retention, priority, and verification semantics — but they share one dispatcher, one registry, and one query surface.

## Context

7 producers currently upload to DePIN independently:

| # | Producer | File | Artifact | Storage Tier | CID Tracked? |
|---|----------|------|----------|-------------|-------------|
| 1 | `epochArchiver` | `jobs/epochArchiver.ts` | Epoch bundle | Permanent (Arweave) | Yes — `epochs.archive_cid` |
| 2 | `anchoringService` | `receipt/anchoringService.ts` | Epoch proof (batch flow) | Permanent | No — fire-and-forget |
| 3 | `archivePipeline` | `memory/archivePipeline.ts` | Memory snapshot (LMF) | Evolving (Lighthouse) | Yes — `memory_snapshots.depin_cid` |
| 4 | `agentDeploymentService` | `agent/agentDeploymentService.ts` | Deploy artifact | Permanent | No — fire-and-forget |
| 5 | `passportSyncService` | `passport/passportSyncService.ts` | Passport metadata | Permanent | Yes — `depin_metadata_cid` column |
| 6 | `passportManager` | `passport/passportManager.ts` | NFT metadata URI | Permanent | No — used inline for minting |
| 7 | `mmrCheckpoint` | `jobs/mmrCheckpoint.ts` | MMR checkpoint | Evolving | Yes — `mmr_state.checkpoint_cid` |

**Problems:**
- No unified CID registry ("what has this agent anchored?")
- No cross-artifact references (memory snapshot → epoch, deploy → passport)
- 2 of 6 producers don't track CIDs at all
- Duplicate upload logic (each producer handles `DEPIN_UPLOAD_ENABLED`, provider selection, error handling independently)
- No unified verification ("is this CID still retrievable?")
- No unified query surface ("show me all anchored artifacts for agent X")

### What is NOT in scope

- Changing `IDepinStorage` interface — it stays as-is
- Changing storage providers (Arweave, Lighthouse, Mock) — they stay as-is
- Async job queues / priority lanes — future work (no users yet, synchronous dispatch is fine)
- On-chain commitment logic — `anchoringService` chain commits stay separate

---

## Section 1: Artifact Types

```typescript
export const ARTIFACT_TYPES = [
  'epoch_bundle',
  'epoch_proof',
  'memory_snapshot',
  'deploy_artifact',
  'passport_metadata',
  'nft_metadata',
  'mmr_checkpoint',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type StorageTier = 'permanent' | 'evolving';
```

Each artifact type has a default storage tier:

| Artifact Type | Default Tier | Provider | Reason |
|--------------|-------------|----------|--------|
| `epoch_bundle` | permanent | Arweave | Immutable proof bundle, must persist forever |
| `epoch_proof` | permanent | Arweave | Immutable commitment proof |
| `memory_snapshot` | evolving | Lighthouse | May be superseded by newer snapshots |
| `deploy_artifact` | permanent | Arweave | Deployment record, audit trail |
| `passport_metadata` | permanent | Arweave | Identity metadata, NFT-linked |
| `nft_metadata` | permanent | Arweave | NFT minting URI, immutable once minted |
| `mmr_checkpoint` | evolving | Lighthouse | Evolving state, superseded on next checkpoint |

### Artifact ID conventions (deterministic per type)

| Artifact Type | `artifact_id` format | Example |
|--------------|---------------------|---------|
| `epoch_bundle` | `{epoch_id}` | `ep_abc123` |
| `epoch_proof` | `{epoch_id}` | `ep_abc123` |
| `memory_snapshot` | `{snapshot_id}` | `snap_def456` |
| `deploy_artifact` | `{passport_id}:{deployment_target}` | `agent_xyz:railway` |
| `passport_metadata` | `{passport_id}` | `agent_xyz` |
| `nft_metadata` | `{passport_id}:nft` | `agent_xyz:nft` |
| `mmr_checkpoint` | `mmr:{root_hash_prefix_16}` | `mmr:a1b2c3d4e5f6g7h8` |

### Dedup strategy

The registry uses a **UNIQUE constraint** on `(artifact_type, artifact_id, content_hash)`. If the same payload is uploaded twice for the same artifact, the second insert is a no-op (ON CONFLICT DO NOTHING). Different payloads for the same artifact (re-upload with updated data) create separate records — the latest is found via `getLatestByArtifact()`.

---

## Section 2: AnchorRecord (Registry Schema)

**File:** `engine/src/anchoring/types.ts`

```typescript
export interface AnchorRecord {
  anchor_id: string;               // UUID
  artifact_type: ArtifactType;
  artifact_id: string;             // epoch_id, snapshot_id, passport_id, etc.
  agent_passport_id: string | null; // null for global artifacts (e.g., non-agent epochs)
  producer: string;                // 'epochArchiver' | 'archivePipeline' | etc.
  provider: string;                // 'arweave' | 'lighthouse' | 'mock'
  storage_tier: StorageTier;
  cid: string;
  content_hash: string;             // SHA-256 of canonical JSON payload (always populated by dispatcher)
  url: string;
  size_bytes: number;
  status: 'uploaded' | 'verified' | 'unreachable';
  parent_anchor_id: string | null; // lineage (e.g., snapshot supersedes prior)
  chain_tx: Record<string, string> | null; // on-chain commitment refs
  metadata: Record<string, unknown>;       // artifact-specific context
  created_at: number;              // Unix ms (PostgresAnchorRegistry converts TIMESTAMPTZ → .getTime())
  verified_at: number | null;     // Unix ms (same conversion)
}
```

**SQL (Supabase migration):**

```sql
CREATE TABLE IF NOT EXISTS anchor_records (
  anchor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'epoch_bundle', 'epoch_proof', 'memory_snapshot',
    'deploy_artifact', 'passport_metadata', 'nft_metadata', 'mmr_checkpoint'
  )),
  artifact_id TEXT NOT NULL,
  agent_passport_id TEXT,
  producer TEXT NOT NULL,
  provider TEXT NOT NULL,
  storage_tier TEXT NOT NULL CHECK (storage_tier IN ('permanent', 'evolving')),
  cid TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'verified', 'unreachable')),
  parent_anchor_id UUID REFERENCES anchor_records(anchor_id),
  chain_tx JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

-- Primary queries
CREATE INDEX idx_anchor_artifact ON anchor_records(artifact_type, artifact_id);
CREATE INDEX idx_anchor_agent ON anchor_records(agent_passport_id, created_at DESC);
CREATE INDEX idx_anchor_cid ON anchor_records(cid);
CREATE INDEX idx_anchor_parent ON anchor_records(parent_anchor_id) WHERE parent_anchor_id IS NOT NULL;
CREATE INDEX idx_anchor_status ON anchor_records(status) WHERE status != 'uploaded';
CREATE UNIQUE INDEX idx_anchor_dedup ON anchor_records(artifact_type, artifact_id, content_hash);
```

---

## Section 3: AnchorDispatcher

**File:** `engine/src/anchoring/dispatcher.ts`

The single entry point for all DePIN uploads. Handles: provider selection → upload → registry write → return result.

```typescript
import { createHash } from 'crypto';
import { canonicalJson } from '../crypto/canonicalJson';
import type { IDepinStorage, UploadResult } from '../storage/depin/IDepinStorage';
import type { AnchorRecord, ArtifactType, StorageTier } from './types';

export interface AnchorRequest {
  artifact_type: ArtifactType;
  artifact_id: string;
  agent_passport_id?: string;
  producer: string;
  storage_tier: StorageTier;
  payload: Buffer | object;         // JSON object or raw bytes
  tags?: Record<string, string>;
  content_hash?: string;            // pre-computed, or dispatcher computes it
  parent_anchor_id?: string;        // lineage
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

export class AnchorDispatcher {
  constructor(
    private permanentStorage: IDepinStorage,
    private evolvingStorage: IDepinStorage,
    private registry: AnchorRegistry,
  ) {}

  async dispatch(request: AnchorRequest): Promise<AnchorResult | null> {
    // 1. Resolve storage provider by tier
    const storage = request.storage_tier === 'permanent'
      ? this.permanentStorage
      : this.evolvingStorage;

    // 2. Compute content hash if not provided (canonical JSON for deterministic hashing)
    const payloadBuf = Buffer.isBuffer(request.payload)
      ? request.payload
      : Buffer.from(canonicalJson(request.payload));
    const contentHash = request.content_hash
      || createHash('sha256').update(payloadBuf).digest('hex');

    // 3. Check kill switch — return null (matches existing producer behavior of silent skip)
    if (process.env.DEPIN_UPLOAD_ENABLED === 'false') {
      return null;
    }

    // 4. Upload
    let upload: UploadResult;
    if (Buffer.isBuffer(request.payload)) {
      upload = await storage.uploadBytes(request.payload, { tags: request.tags });
    } else {
      upload = await storage.uploadJSON(request.payload, { tags: request.tags });
    }

    // 5. Write registry record
    const record = await this.registry.create({
      artifact_type: request.artifact_type,
      artifact_id: request.artifact_id,
      agent_passport_id: request.agent_passport_id || null,
      producer: request.producer,
      provider: upload.provider,
      storage_tier: request.storage_tier,
      cid: upload.cid,
      content_hash: contentHash,
      url: upload.url,
      size_bytes: upload.sizeBytes,
      parent_anchor_id: request.parent_anchor_id || null,
      chain_tx: request.chain_tx || null,
      metadata: request.metadata || {},
    });

    return {
      anchor_id: record.anchor_id,
      cid: upload.cid,
      url: upload.url,
      provider: upload.provider,
      size_bytes: upload.sizeBytes,
    };
  }
}

// No AnchorDisabledError — kill switch returns null to match existing producer behavior (silent skip)
```

---

## Section 4: AnchorRegistry

**File:** `engine/src/anchoring/registry.ts`

CRUD for `anchor_records` table. Two implementations: Postgres (production) and InMemory (tests).

```typescript
export interface IAnchorRegistry {
  create(record: Omit<AnchorRecord, 'anchor_id' | 'status' | 'created_at' | 'verified_at'>): Promise<AnchorRecord>;
  getById(anchor_id: string): Promise<AnchorRecord | null>;
  getByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord[]>;
  getLatestByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord | null>;
  getByCID(cid: string): Promise<AnchorRecord | null>;
  getByAgent(agent_passport_id: string, options?: { artifact_type?: ArtifactType; limit?: number }): Promise<AnchorRecord[]>;
  getLineage(anchor_id: string): Promise<AnchorRecord[]>;  // walk parent_anchor_id chain
  updateStatus(anchor_id: string, status: 'verified' | 'unreachable'): Promise<void>;
  count(filters?: { artifact_type?: ArtifactType; agent_passport_id?: string; status?: string }): Promise<number>;
}
```

**PostgresAnchorRegistry** — uses `pool` from `db/pool.ts`. Standard parameterized queries.

**InMemoryAnchorRegistry** — `Map<string, AnchorRecord>` for tests.

---

## Section 5: AnchorVerifier

**File:** `engine/src/anchoring/verifier.ts`

Verifies CID existence on the actual storage provider. Updates registry status.

```typescript
export class AnchorVerifier {
  constructor(
    private permanentStorage: IDepinStorage,
    private evolvingStorage: IDepinStorage,
    private registry: IAnchorRegistry,
  ) {}

  async verify(anchor_id: string): Promise<{ valid: boolean; checked_at: number }> {
    const record = await this.registry.getById(anchor_id);
    if (!record) throw new Error(`Anchor ${anchor_id} not found`);

    const storage = record.storage_tier === 'permanent'
      ? this.permanentStorage
      : this.evolvingStorage;

    const exists = await storage.exists(record.cid);
    const now = Date.now();

    await this.registry.updateStatus(
      anchor_id,
      exists ? 'verified' : 'unreachable',
    );

    return { valid: exists, checked_at: now };
  }

  async verifyBatch(anchor_ids: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const id of anchor_ids) {
      try {
        const { valid } = await this.verify(id);
        results.set(id, valid);
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }
}
```

---

## Section 6: Factory + Boot

**File:** `engine/src/anchoring/index.ts`

```typescript
import { getPermanentStorage, getEvolvingStorage } from '../storage/depin';
import { AnchorDispatcher } from './dispatcher';
import { PostgresAnchorRegistry, InMemoryAnchorRegistry, IAnchorRegistry } from './registry';
import { AnchorVerifier } from './verifier';

let dispatcher: AnchorDispatcher | null = null;
let registry: IAnchorRegistry | null = null;
let verifier: AnchorVerifier | null = null;

export function getAnchorRegistry(): IAnchorRegistry {
  if (!registry) {
    const usePostgres = process.env.ANCHOR_REGISTRY_STORE !== 'memory';
    registry = usePostgres
      ? new PostgresAnchorRegistry()
      : new InMemoryAnchorRegistry();
  }
  return registry;
}

export function getAnchorDispatcher(): AnchorDispatcher {
  if (!dispatcher) {
    dispatcher = new AnchorDispatcher(
      getPermanentStorage(),
      getEvolvingStorage(),
      getAnchorRegistry(),
    );
  }
  return dispatcher;
}

export function getAnchorVerifier(): AnchorVerifier {
  if (!verifier) {
    verifier = new AnchorVerifier(
      getPermanentStorage(),
      getEvolvingStorage(),
      getAnchorRegistry(),
    );
  }
  return verifier;
}

export function resetAnchoring(): void {
  dispatcher = null;
  registry = null;
  verifier = null;
}
```

---

## Section 7: Refactor All 7 Producers

Each producer switches from direct `IDepinStorage.uploadJSON()` to `AnchorDispatcher.dispatch()`.

### 7.1 epochArchiver.ts

**Before:**
```typescript
const upload = await getPermanentStorage().uploadJSON(bundle, { tags: { type: 'epoch-archive', epoch: epoch_id, version: '1.0' } });
await pool.query('UPDATE epochs SET archive_cid = $1 WHERE epoch_id = $2', [upload.cid, epoch_id]);
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
const result = await getAnchorDispatcher().dispatch({
  artifact_type: 'epoch_bundle',
  artifact_id: epoch_id,
  agent_passport_id: row.agent_passport_id || null,  // NOTE: must add agent_passport_id to SELECT query
  producer: 'epochArchiver',
  storage_tier: 'permanent',
  payload: bundle,
  tags: { type: 'epoch-archive', epoch: epoch_id, version: '1.0' },
  chain_tx: chainTx,
  metadata: { epoch_index: row.epoch_index, leaf_count: row.leaf_count },
});
if (result) {
  await pool.query('UPDATE epochs SET archive_cid = $1 WHERE epoch_id = $2', [result.cid, epoch_id]);
}
```

**Null-safety rule:** Every caller MUST guard `dispatch()` result. `result === null` means DePIN uploads are disabled — the operation should continue without the CID. All "After" blocks in this section must follow this pattern.

### 7.2 anchoringService.ts (batch epoch proof)

**Before:**
```typescript
const upload = await getPermanentStorage().uploadJSON(proof, { tags: { type: 'epoch-proof', epoch: epoch.epoch_id } });
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
await getAnchorDispatcher().dispatch({
  artifact_type: 'epoch_proof',
  artifact_id: epoch.epoch_id,
  producer: 'anchoringService',
  storage_tier: 'permanent',
  payload: proof,
  tags: { type: 'epoch-proof', epoch: epoch.epoch_id },
  chain_tx: { [config.network]: txSignature },
});
```

### 7.3 archivePipeline.ts (memory snapshot)

**Before:**
```typescript
const { cid } = await this.depinStorage.uploadJSON(lmf, { tags: { type: 'lucid-memory-file', agent: agent_passport_id, snapshot_type } });
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
const result = await getAnchorDispatcher().dispatch({
  artifact_type: 'memory_snapshot',
  artifact_id: snapshot_id,
  agent_passport_id,
  producer: 'archivePipeline',
  storage_tier: 'evolving',
  payload: lmf,
  tags: { type: 'lucid-memory-file', agent: agent_passport_id, snapshot_type },
  parent_anchor_id: previousSnapshotAnchorId,  // lineage
  metadata: { entry_count: lmf.entry_count, chain_head_hash: lmf.chain_head_hash },
});
```

Note: `archivePipeline` constructor no longer needs `depinStorage` parameter. It gets the dispatcher from the factory. **Breaking change:** existing tests (`archivePipeline.test.ts`, `snapshot-e2e.test.ts`) pass a mock `depinStorage` — these must be updated to mock the dispatcher instead.

### 7.4 agentDeploymentService.ts

**Before:**
```typescript
await storage.uploadJSON({ passport_id, deployment_target, ... }, { tags: { type: 'agent-deployment', passport_id } });
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
await getAnchorDispatcher().dispatch({
  artifact_type: 'deploy_artifact',
  artifact_id: passportId,
  agent_passport_id: passportId,
  producer: 'agentDeploymentService',
  storage_tier: 'permanent',
  payload: { passport_id: passportId, deployment_target, deployment_url, adapter, deployed_at },
  tags: { type: 'agent-deployment', passport_id: passportId },
});
```

### 7.5 passportSyncService.ts / passportManager.ts

**Before:**
```typescript
const result = await getPermanentStorage().uploadJSON(passport.metadata, { tags: { ... } });
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
const result = await getAnchorDispatcher().dispatch({
  artifact_type: 'passport_metadata',
  artifact_id: passport.passport_id,
  agent_passport_id: passport.type === 'agent' ? passport.passport_id : null,
  producer: 'passportSyncService',
  storage_tier: 'permanent',
  payload: passport.metadata,
  tags: { 'lucid-passport-id': passport.passport_id, 'lucid-type': passport.type },
});
```

### 7.6 passportManager.ts (NFT metadata upload)

**Before:**
```typescript
const uploadResult = await getPermanentStorage().uploadJSON(metadataJson, {
  tags: { 'Content-Type': 'application/json', 'lucid-nft': 'true' },
});
metadataUri = uploadResult.url;
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
const anchorResult = await getAnchorDispatcher().dispatch({
  artifact_type: 'nft_metadata',
  artifact_id: `${passportId}-nft`,
  agent_passport_id: passport.type === 'agent' ? passportId : null,
  producer: 'passportManager',
  storage_tier: 'permanent',
  payload: metadataJson,
  tags: { 'Content-Type': 'application/json', 'lucid-nft': 'true' },
});
metadataUri = anchorResult.url;
```

Note: This is a distinct artifact type `nft_metadata` (not `passport_metadata`) — different purpose (NFT minting URI vs passport sync metadata), different tags, different lifecycle.

### 7.7 mmrCheckpoint.ts

**Before:**
```typescript
const upload = await getEvolvingStorage().uploadJSON(checkpoint, { tags: { type: 'mmr-checkpoint', root: checkpoint.root_hash } });
```

**After:**
```typescript
const { getAnchorDispatcher } = await import('../anchoring');
const result = await getAnchorDispatcher().dispatch({
  artifact_type: 'mmr_checkpoint',
  artifact_id: `mmr-${checkpoint.root_hash.slice(0, 16)}`,
  producer: 'mmrCheckpoint',
  storage_tier: 'evolving',
  payload: checkpoint,
  tags: { type: 'mmr-checkpoint', root: checkpoint.root_hash },
  metadata: { mmr_size: checkpoint.mmr_size, leaf_count: checkpoint.leaf_count },
});
```

---

## Section 8: API Route

**File:** `gateway-lite/src/routes/core/anchorRoutes.ts`

```typescript
// GET /v1/anchors?agent_passport_id=X&artifact_type=Y&limit=N
anchorRouter.get('/v1/anchors', async (req, res) => {
  const records = await getAnchorRegistry().getByAgent(
    req.query.agent_passport_id as string,
    {
      artifact_type: req.query.artifact_type as ArtifactType,
      limit: parseInt(req.query.limit as string || '50', 10),
    },
  );
  return res.json({ success: true, data: records });
});

// GET /v1/anchors/:anchor_id
anchorRouter.get('/v1/anchors/:anchor_id', async (req, res) => {
  const record = await getAnchorRegistry().getById(req.params.anchor_id);
  if (!record) return res.status(404).json({ success: false, error: 'Anchor not found' });
  return res.json({ success: true, data: record });
});

// GET /v1/anchors/:anchor_id/lineage
anchorRouter.get('/v1/anchors/:anchor_id/lineage', async (req, res) => {
  const lineage = await getAnchorRegistry().getLineage(req.params.anchor_id);
  return res.json({ success: true, data: lineage });
});

// POST /v1/anchors/:anchor_id/verify
anchorRouter.post('/v1/anchors/:anchor_id/verify', async (req, res) => {
  const result = await getAnchorVerifier().verify(req.params.anchor_id);
  return res.json({ success: true, data: result });
});

// GET /v1/anchors/cid/:cid
anchorRouter.get('/v1/anchors/cid/:cid', async (req, res) => {
  const record = await getAnchorRegistry().getByCID(req.params.cid);
  if (!record) return res.status(404).json({ success: false, error: 'CID not found in registry' });
  return res.json({ success: true, data: record });
});
```

---

## Section 9: File Structure

```
engine/src/anchoring/
  types.ts          # ArtifactType, StorageTier, AnchorRecord
  dispatcher.ts     # AnchorDispatcher (upload + registry write)
  registry.ts       # IAnchorRegistry, PostgresAnchorRegistry, InMemoryAnchorRegistry
  verifier.ts       # AnchorVerifier (CID existence check)
  index.ts          # Factory singletons + barrel exports

gateway-lite/src/routes/core/
  anchorRoutes.ts   # REST API for anchor queries

infrastructure/migrations/
  20260314_anchor_registry.sql  # anchor_records table
```

### Modified files

| File | Changes |
|------|---------|
| `jobs/epochArchiver.ts` | Replace `getPermanentStorage().uploadJSON()` with `getAnchorDispatcher().dispatch()` |
| `receipt/anchoringService.ts` | Replace batch proof upload with dispatcher |
| `memory/archivePipeline.ts` | Replace `depinStorage.uploadJSON()` with dispatcher. Remove `depinStorage` constructor param. |
| `agent/agentDeploymentService.ts` | Replace upload with dispatcher |
| `passport/passportSyncService.ts` | Replace upload with dispatcher |
| `passport/passportManager.ts` | Replace NFT metadata upload with dispatcher |
| `jobs/mmrCheckpoint.ts` | Replace upload with dispatcher |
| `gateway-lite/src/routes/core/lucidLayerRoutes.ts` | Mount anchorRoutes |
| `gateway-lite/src/index.ts` | Import anchorRoutes |
| `memory/__tests__/archivePipeline.test.ts` | Update constructor (remove depinStorage param) |
| `memory/__tests__/snapshot-e2e.test.ts` | Update constructor (remove depinStorage param) |

---

## Section 10: Test Plan

### Unit tests (`__tests__/anchoring.test.ts`)

| Test | Description |
|------|-------------|
| Dispatcher uploads to correct tier | permanent → permanentStorage, evolving → evolvingStorage |
| Dispatcher writes registry record | After upload, record exists in registry |
| Dispatcher computes content hash | SHA-256 of payload matches record |
| Dispatcher respects kill switch | DEPIN_UPLOAD_ENABLED=false → returns null |
| Registry CRUD | create, getById, getByArtifact, getByCID, getByAgent |
| Registry lineage | parent_anchor_id chain walkable via getLineage |
| Registry count with filters | artifact_type, agent, status filters |
| Verifier — CID exists | storage.exists returns true → status='verified' |
| Verifier — CID missing | storage.exists returns false → status='unreachable' |
| Verifier — batch | Multiple anchors verified in one call |
| Factory singletons | getAnchorDispatcher returns same instance |
| Reset clears singletons | resetAnchoring → fresh instances |

Expected: ~12 tests.

### Integration tests (`__tests__/anchoring-integration.test.ts`)

| Test | Description |
|------|-------------|
| epochArchiver → anchor record | Archive epoch, verify anchor_records entry |
| archivePipeline → anchor record | Create snapshot, verify anchor_records entry |
| Cross-reference lineage | Snapshot A superseded by B, lineage returns [B, A] |
| getByAgent returns all artifact types | Agent with epoch + snapshot + deploy → 3 records |

Expected: ~4 tests.

**Total: ~16 new tests.**

---

## Section 11: Env Configuration

```bash
# Existing (unchanged)
DEPIN_PERMANENT_PROVIDER=arweave|mock     # default: mock
DEPIN_EVOLVING_PROVIDER=lighthouse|mock   # default: mock
DEPIN_UPLOAD_ENABLED=true|false           # default: true (kill switch)

# New
ANCHOR_REGISTRY_STORE=postgres|memory     # default: postgres (memory for tests)
```

---

## Section 12: Rebuildability

The anchor registry is a Layer 3 projection. It MUST be rebuildable from L1 (chain) + L2 (DePIN).

**Rebuild procedure:**
1. Scan `epochs.archive_cid` → create `epoch_bundle` anchor records
2. Scan `memory_snapshots.depin_cid` → create `memory_snapshot` anchor records
3. Scan `passports.depin_metadata_cid` → create `passport_metadata` anchor records
4. Scan `mmr_state.checkpoint_cid` → create `mmr_checkpoint` anchor records
5. For each CID, call `storage.exists()` to set initial status

**Non-recoverable from DB columns:** `epoch_proof`, `deploy_artifact`, and `nft_metadata` had no CID tracking before this refactoring. After migration, they exist in `anchor_records` but cannot be rebuilt from other tables. They can be rebuilt by scanning DePIN storage directly with tag-based queries (e.g., Arweave GraphQL tags `type: 'epoch-proof'`).

This can be a one-time migration script or a periodic reconciliation job. The registry is never the source of truth — it's always derivable from L1 + L2.
