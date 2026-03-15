// offchain/packages/engine/src/anchoring/types.ts
// Core types for the Anchoring Control Plane

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
  content_hash: string;             // SHA-256 of canonical JSON (always populated)
  url: string;
  size_bytes: number;
  status: 'uploaded' | 'verified' | 'unreachable';
  parent_anchor_id: string | null;
  chain_tx: Record<string, string> | null;
  metadata: Record<string, unknown>;
  created_at: number;              // Unix ms
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
