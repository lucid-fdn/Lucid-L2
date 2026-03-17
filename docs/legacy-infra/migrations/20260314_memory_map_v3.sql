-- Migration: 20260314_memory_map_v3.sql
-- MemoryMap v3: embedding lifecycle, outbox table, embedding_status

BEGIN;

-- 1. Embedding lifecycle columns on memory_entries
ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending'
  CHECK (embedding_status IN ('pending', 'ready', 'failed', 'skipped'));

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding_attempts INTEGER DEFAULT 0;

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding_requested_at TIMESTAMPTZ;

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding_last_error TEXT;

-- Index for embedding worker queries
CREATE INDEX IF NOT EXISTS idx_memory_embedding_status
  ON memory_entries(embedding_status, created_at)
  WHERE embedding_status = 'pending';

-- 2. Outbox table for reliable projection
CREATE TABLE IF NOT EXISTS memory_outbox (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  memory_id UUID,
  agent_passport_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Partial index for pending events (projection worker queries this)
CREATE INDEX IF NOT EXISTS idx_memory_outbox_pending
  ON memory_outbox(created_at)
  WHERE processed_at IS NULL;

-- 3. Backfill existing entries with embedding_status = 'skipped'
-- (entries created before v3 don't need embedding)
UPDATE memory_entries
  SET embedding_status = 'skipped'
  WHERE embedding_status IS NULL OR embedding_status = 'pending';

COMMIT;
