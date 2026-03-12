-- Migration: 20260312_epoch_retry_count
-- Description: Add retry_count column to epochs table for automatic retry tracking

BEGIN;

ALTER TABLE epochs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

COMMIT;
