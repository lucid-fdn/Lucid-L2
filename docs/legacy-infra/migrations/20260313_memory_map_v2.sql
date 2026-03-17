-- Migration: 20260313_memory_map_v2.sql
-- MemoryMap v2: lanes, compaction watermark, provenance FK fix

BEGIN;

-- 1. Add compaction watermark to sessions
ALTER TABLE memory_sessions
  ADD COLUMN IF NOT EXISTS last_compacted_turn_index INTEGER NOT NULL DEFAULT -1;

-- 2. Change provenance FK to SET NULL on delete (required for cold compaction hard-prune)
ALTER TABLE memory_provenance
  DROP CONSTRAINT IF EXISTS memory_provenance_memory_id_fkey;
ALTER TABLE memory_provenance
  ALTER COLUMN memory_id DROP NOT NULL;
ALTER TABLE memory_provenance
  ADD CONSTRAINT memory_provenance_memory_id_fkey
    FOREIGN KEY (memory_id) REFERENCES memory_entries(memory_id) ON DELETE SET NULL;

-- 3. Preserve content_hash in provenance after hard delete
ALTER TABLE memory_provenance
  ADD COLUMN IF NOT EXISTS deleted_memory_hash TEXT;

-- 4. Memory lanes
ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS memory_lane TEXT NOT NULL DEFAULT 'self'
  CHECK (memory_lane IN ('self', 'user', 'shared', 'market'));

CREATE INDEX IF NOT EXISTS idx_memory_lane
  ON memory_entries(agent_passport_id, memory_lane, status);

-- 5. Add 'delete' to provenance operation check
-- Drop existing check and re-create with 'delete' included
ALTER TABLE memory_provenance
  DROP CONSTRAINT IF EXISTS memory_provenance_operation_check;
ALTER TABLE memory_provenance
  ADD CONSTRAINT memory_provenance_operation_check
    CHECK (operation IN ('create', 'update', 'supersede', 'archive', 'delete'));

COMMIT;
