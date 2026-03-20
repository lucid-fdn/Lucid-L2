<!-- generated: commit c7113a7, 2026-03-20T11:04:15.770Z -->
# anchoring — Interface Reference

## Interfaces

### AnchorRecord
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `anchor_id` | `string` | no |  |
| `artifact_id` | `string` | no |  |
| `artifact_type` | `"epoch_bundle" | "epoch_proof" | "memory_snapshot" | "deploy_artifact" | "passport_metadata" | "nft_metadata" | "mmr_checkpoint"` | no |  |
| `chain_tx` | `Record<string, string>` | no |  |
| `cid` | `string` | no |  |
| `content_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `metadata` | `Record<string, unknown>` | no |  |
| `parent_anchor_id` | `string` | no |  |
| `producer` | `string` | no |  |
| `provider` | `string` | no |  |
| `size_bytes` | `number` | no |  |
| `status` | `"uploaded" | "verified" | "unreachable"` | no |  |
| `storage_tier` | `StorageTier` | no |  |
| `url` | `string` | no |  |
| `verified_at` | `number` | no |  |

**Extends:** —

### AnchorRequest
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | yes |  |
| `artifact_id` | `string` | no |  |
| `artifact_type` | `"epoch_bundle" | "epoch_proof" | "memory_snapshot" | "deploy_artifact" | "passport_metadata" | "nft_metadata" | "mmr_checkpoint"` | no |  |
| `chain_tx` | `Record<string, string>` | yes |  |
| `content_hash` | `string` | yes |  |
| `metadata` | `Record<string, unknown>` | yes |  |
| `parent_anchor_id` | `string` | yes |  |
| `payload` | `object | Buffer` | no |  |
| `producer` | `string` | no |  |
| `storage_tier` | `StorageTier` | no |  |
| `tags` | `Record<string, string>` | yes |  |

**Extends:** —

### AnchorResult
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `anchor_id` | `string` | no |  |
| `cid` | `string` | no |  |
| `provider` | `string` | no |  |
| `size_bytes` | `number` | no |  |
| `url` | `string` | no |  |

**Extends:** —

### IAnchorRegistry
> `registry.ts`

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `count` | `filters`?: `{ artifact_type?: ArtifactType; agent_passport_id?: string; status?: string; }` | `Promise<number>` |  |
| `create` | `record`: `CreateInput` | `Promise<AnchorRecord>` |  |
| `getByAgent` | `agent_passport_id`: `string`, `options`?: `{ artifact_type?: ArtifactType; limit?: number; }` | `Promise<AnchorRecord[]>` |  |
| `getByArtifact` | `artifact_type`: `"epoch_bundle" | "epoch_proof" | "memory_snapshot" | "deploy_artifact" | "passport_metadata" | "nft_metadata" | "mmr_checkpoint"`, `artifact_id`: `string` | `Promise<AnchorRecord[]>` |  |
| `getByCID` | `cid`: `string` | `Promise<AnchorRecord>` |  |
| `getById` | `anchor_id`: `string` | `Promise<AnchorRecord>` |  |
| `getLatestByArtifact` | `artifact_type`: `"epoch_bundle" | "epoch_proof" | "memory_snapshot" | "deploy_artifact" | "passport_metadata" | "nft_metadata" | "mmr_checkpoint"`, `artifact_id`: `string` | `Promise<AnchorRecord>` |  |
| `getLineage` | `anchor_id`: `string` | `Promise<AnchorRecord[]>` |  |
| `updateStatus` | `anchor_id`: `string`, `status`: `"verified" | "unreachable"` | `Promise<void>` |  |

**Extends:** —

## Functions

### getAnchorDispatcher
> `index.ts`

**Returns:** `AnchorDispatcher`

**Async:** no

### getAnchorRegistry
> `index.ts`

**Returns:** `IAnchorRegistry`

**Async:** no

### getAnchorVerifier
> `index.ts`

**Returns:** `AnchorVerifier`

**Async:** no

### resetAnchoring
> `index.ts`

**Returns:** `void`

**Async:** no

## Types

### ArtifactType
> `types.ts`

```ts
type ArtifactType = "epoch_bundle" | "epoch_proof" | "memory_snapshot" | "deploy_artifact" | "passport_metadata" | "nft_metadata" | "mmr_checkpoint"
```

### StorageTier
> `types.ts`

```ts
type StorageTier = "permanent" | "evolving"
```
