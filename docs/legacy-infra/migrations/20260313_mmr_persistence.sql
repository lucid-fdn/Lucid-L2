-- Migration: 20260313_mmr_persistence
-- Description: Persist MMR state + tiered storage references.
-- Phase 2: DB durability for the receipt anchoring pipeline.
-- Phase 3: Archive references for finalized epochs (DePIN CIDs).

BEGIN;

-- =============================================================================
-- 1. mmr_state — Singleton row tracking global receipt MMR metadata
-- =============================================================================
CREATE TABLE IF NOT EXISTS mmr_state (
  id              TEXT        PRIMARY KEY DEFAULT 'receipt_mmr',
  mmr_size        INTEGER     NOT NULL DEFAULT 0,
  leaf_count      INTEGER     NOT NULL DEFAULT 0,
  leaf_positions  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  root_hash       TEXT        NOT NULL DEFAULT '',
  checkpoint_cid  TEXT,                              -- Latest DePIN evolving checkpoint (bucket 3)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row
INSERT INTO mmr_state (id) VALUES ('receipt_mmr') ON CONFLICT DO NOTHING;

-- =============================================================================
-- 2. mmr_nodes — All MMR nodes (position → hash), append-only
-- =============================================================================
CREATE TABLE IF NOT EXISTS mmr_nodes (
  position    INTEGER     PRIMARY KEY,
  hash        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. Add leaf_index to receipts for proof reconstruction on reload
-- =============================================================================
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS leaf_index INTEGER;

-- =============================================================================
-- 4. Add archive_cid to epochs (bucket 3 — DePIN reference for finalized data)
-- =============================================================================
ALTER TABLE epochs ADD COLUMN IF NOT EXISTS archive_cid TEXT;

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_mmr_nodes_position ON mmr_nodes(position);
CREATE INDEX IF NOT EXISTS idx_receipts_leaf_index ON receipts(leaf_index);
CREATE INDEX IF NOT EXISTS idx_epochs_archive_cid ON epochs(archive_cid) WHERE archive_cid IS NOT NULL;

COMMIT;
