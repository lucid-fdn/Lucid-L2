-- Migration: 20260302_receipts_and_epochs
-- Description: DB persistence for receipts and epochs (write-through from in-memory stores)

BEGIN;

-- =============================================================================
-- 1. receipts
-- =============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_hash      TEXT        UNIQUE NOT NULL,
  signature         TEXT        NOT NULL,
  signer_pubkey     TEXT        NOT NULL,
  signer_type       TEXT        NOT NULL DEFAULT 'orchestrator',
  body              JSONB       NOT NULL,
  run_id            TEXT        NOT NULL,
  anchor_chain      TEXT,
  anchor_tx         TEXT,
  anchor_root       TEXT,
  anchor_epoch_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. epochs
-- =============================================================================
CREATE TABLE IF NOT EXISTS epochs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id          TEXT        UNIQUE NOT NULL,
  epoch_index       INTEGER     NOT NULL,
  project_id        TEXT,
  status            TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'anchoring', 'anchored', 'failed')),
  mmr_root          TEXT        NOT NULL,
  leaf_count        INTEGER     NOT NULL DEFAULT 0,
  start_leaf_index  INTEGER     NOT NULL DEFAULT 0,
  end_leaf_index    INTEGER,
  chain_tx          TEXT,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at      TIMESTAMPTZ
);

-- =============================================================================
-- 3. epoch_receipts (junction table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS epoch_receipts (
  epoch_id      TEXT        NOT NULL REFERENCES epochs(epoch_id) ON DELETE CASCADE,
  receipt_hash  TEXT        NOT NULL REFERENCES receipts(receipt_hash) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (epoch_id, receipt_hash)
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX idx_receipts_run_id        ON receipts(run_id);
CREATE INDEX idx_receipts_created_at    ON receipts(created_at);
CREATE INDEX idx_epochs_status          ON epochs(status);
CREATE INDEX idx_epochs_project_id      ON epochs(project_id);
CREATE INDEX idx_epochs_created_at      ON epochs(created_at);
CREATE INDEX idx_epoch_receipts_receipt_hash ON epoch_receipts(receipt_hash);

COMMIT;
