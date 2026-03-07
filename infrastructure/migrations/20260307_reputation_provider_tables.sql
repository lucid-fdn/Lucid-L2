-- Migration: Reputation provider tables for IReputationProvider layer
-- Replaces the old validations/reputation_scores tables with passport-centric schema
-- supporting all 5 asset types (model, compute, tool, agent, dataset).

CREATE TABLE IF NOT EXISTS reputation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  from_address TEXT NOT NULL DEFAULT 'local',
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 100),
  category TEXT NOT NULL DEFAULT 'general',
  receipt_hash TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'model',
  metadata TEXT DEFAULT '',
  revoked BOOLEAN DEFAULT false,
  feedback_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_rep_feedback_asset_type
    CHECK (asset_type IN ('model', 'compute', 'tool', 'agent', 'dataset'))
);

CREATE INDEX IF NOT EXISTS idx_rep_feedback_passport ON reputation_feedback(passport_id);
CREATE INDEX IF NOT EXISTS idx_rep_feedback_receipt ON reputation_feedback(receipt_hash);
CREATE INDEX IF NOT EXISTS idx_rep_feedback_asset ON reputation_feedback(asset_type);

CREATE TABLE IF NOT EXISTS reputation_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  validator TEXT NOT NULL DEFAULT 'local',
  valid BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'model',
  metadata TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_rep_val_asset_type
    CHECK (asset_type IN ('model', 'compute', 'tool', 'agent', 'dataset')),
  CONSTRAINT uq_rep_validation_receipt UNIQUE (passport_id, receipt_hash)
);

CREATE INDEX IF NOT EXISTS idx_rep_validation_passport ON reputation_validations(passport_id);
