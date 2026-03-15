-- Migration: 20260315_anchor_registry.sql
-- Anchoring Control Plane: unified CID registry for all DePIN artifacts

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_anchor_artifact ON anchor_records(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_anchor_agent ON anchor_records(agent_passport_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anchor_cid ON anchor_records(cid);
CREATE INDEX IF NOT EXISTS idx_anchor_parent ON anchor_records(parent_anchor_id) WHERE parent_anchor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anchor_status ON anchor_records(status) WHERE status != 'uploaded';
CREATE UNIQUE INDEX IF NOT EXISTS idx_anchor_dedup ON anchor_records(artifact_type, artifact_id, content_hash);

COMMIT;
