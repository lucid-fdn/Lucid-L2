-- Migration: 20260313_memory_map.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. memory_entries — All memory types, discriminated by type column
CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN (
    'episodic', 'semantic', 'procedural',
    'entity', 'trust_weighted', 'temporal'
  )),
  namespace           TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded', 'archived', 'expired')
  ),
  content             TEXT        NOT NULL,
  structured_content  JSONB,
  embedding           vector(1536),
  embedding_model     TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance (every entry is hashed)
  content_hash        TEXT        NOT NULL,
  prev_hash           TEXT,
  receipt_hash        TEXT,
  receipt_run_id      TEXT,

  -- Episodic-specific
  session_id          TEXT,
  role                TEXT CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  turn_index          INTEGER,
  tokens              INTEGER,
  tool_calls          JSONB,

  -- Semantic + Procedural shared
  source_memory_ids   TEXT[],        -- Episodic entries this was derived from

  -- Semantic-specific
  fact                TEXT,
  confidence          REAL,
  supersedes          TEXT[],

  -- Procedural-specific
  rule                TEXT,
  trigger             TEXT,
  priority            INTEGER,

  -- Temporal-specific (STAGED)
  valid_from          TIMESTAMPTZ,
  valid_to            TIMESTAMPTZ,
  recorded_at         TIMESTAMPTZ,
  superseded_by       TEXT,

  -- Entity-specific (STAGED)
  entity_name         TEXT,
  entity_type         TEXT,
  attributes          JSONB,
  relationships       JSONB,

  -- Trust-weighted-specific (STAGED)
  source_agent_passport_id TEXT,
  trust_score         REAL,
  decay_factor        REAL,
  weighted_relevance  REAL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. memory_provenance — Append-only audit log
CREATE TABLE IF NOT EXISTS memory_provenance (
  record_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  namespace           TEXT        NOT NULL,
  memory_id           UUID        NOT NULL REFERENCES memory_entries(memory_id),
  operation           TEXT        NOT NULL CHECK (
    operation IN ('create', 'update', 'supersede', 'archive')
  ),
  content_hash        TEXT        NOT NULL,
  prev_hash           TEXT,
  receipt_hash        TEXT,
  receipt_run_id      TEXT,
  anchor_epoch_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. memory_sessions — Session lifecycle
CREATE TABLE IF NOT EXISTS memory_sessions (
  session_id          TEXT        PRIMARY KEY,
  agent_passport_id   TEXT        NOT NULL,
  namespace           TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'closed', 'archived')
  ),
  turn_count          INTEGER     NOT NULL DEFAULT 0,
  total_tokens        INTEGER     NOT NULL DEFAULT 0,
  last_receipted_turn_index INTEGER NOT NULL DEFAULT -1,
  summary             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ
);

-- 4. memory_snapshots — DePIN checkpoint references
CREATE TABLE IF NOT EXISTS memory_snapshots (
  snapshot_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  depin_cid           TEXT        NOT NULL,
  entry_count         INTEGER     NOT NULL,
  chain_head_hash     TEXT        NOT NULL,
  snapshot_type       TEXT        NOT NULL CHECK (
    snapshot_type IN ('checkpoint', 'migration', 'archive')
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_agent_ns_type ON memory_entries(agent_passport_id, namespace, type, status);
CREATE INDEX idx_memory_session ON memory_entries(session_id, turn_index) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX idx_memory_session_turn ON memory_entries(session_id, turn_index) WHERE type = 'episodic';
CREATE INDEX idx_memory_content_hash ON memory_entries(content_hash);
CREATE INDEX idx_memory_created ON memory_entries(created_at DESC);
CREATE INDEX idx_memory_receipt ON memory_entries(receipt_hash) WHERE receipt_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_memory_agent_ns_hash ON memory_entries(agent_passport_id, namespace, content_hash) WHERE status = 'active';
CREATE INDEX idx_provenance_agent_ns ON memory_provenance(agent_passport_id, namespace, created_at DESC);
CREATE INDEX idx_provenance_memory ON memory_provenance(memory_id);
CREATE INDEX idx_sessions_agent ON memory_sessions(agent_passport_id, status);
CREATE INDEX idx_snapshots_agent ON memory_snapshots(agent_passport_id, created_at DESC);

-- Prerequisite: CREATE EXTENSION IF NOT EXISTS vector;
-- The embedding column uses vector(1536) for text-embedding-3-small.
-- To change dimensions, update the column type AND the MEMORY_EMBEDDING_MODEL env var.
-- Vector similarity index (create after initial data load for optimal IVFFlat training):
-- CREATE INDEX idx_memory_embedding ON memory_entries
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
--   WHERE embedding IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_updated_at
  BEFORE UPDATE ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_memory_updated_at();

COMMIT;
