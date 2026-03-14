import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 3;

// ─── Full V3 Schema ────────────────────────────────────────────────

function getSchemaV3Full(dimensions: number): string {
  return `
-- ─── Memory Entries ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id               TEXT PRIMARY KEY,
  agent_passport_id       TEXT NOT NULL,
  type                    TEXT NOT NULL CHECK(type IN ('episodic','semantic','procedural','entity','trust_weighted','temporal')),
  namespace               TEXT NOT NULL,
  memory_lane             TEXT NOT NULL DEFAULT 'self' CHECK(memory_lane IN ('self','user','shared','market')),
  content                 TEXT NOT NULL,
  structured_content      TEXT,

  -- Embedding lifecycle
  embedding_status        TEXT NOT NULL DEFAULT 'pending' CHECK(embedding_status IN ('pending','ready','failed','skipped')),
  embedding_attempts      INTEGER NOT NULL DEFAULT 0,
  embedding_requested_at  INTEGER,
  embedding_updated_at    INTEGER,
  embedding_last_error    TEXT,
  embedding_model         TEXT,

  -- Status + timestamps
  status                  TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived','expired')),
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,

  -- Metadata + hash chain
  metadata                TEXT NOT NULL DEFAULT '{}',
  content_hash            TEXT NOT NULL,
  prev_hash               TEXT,
  receipt_hash            TEXT,
  receipt_run_id          TEXT,

  -- Episodic fields
  session_id              TEXT,
  role                    TEXT,
  turn_index              INTEGER,
  tokens                  INTEGER,
  tool_calls              TEXT,

  -- Semantic fields
  fact                    TEXT,
  confidence              REAL,
  source_memory_ids       TEXT,
  supersedes              TEXT,

  -- Procedural fields
  rule                    TEXT,
  "trigger"               TEXT,
  priority                INTEGER,

  -- Entity fields
  entity_name             TEXT,
  entity_type             TEXT,
  entity_id               TEXT,
  attributes              TEXT,
  relationships           TEXT,

  -- Trust-weighted fields
  source_agent_passport_id TEXT,
  trust_score             REAL,
  decay_factor            REAL,
  weighted_relevance      REAL,

  -- Temporal fields
  valid_from              INTEGER,
  valid_to                INTEGER,
  recorded_at             INTEGER,
  superseded_by           TEXT
);

-- ─── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entries_agent_ns
  ON memory_entries(agent_passport_id, namespace);

CREATE INDEX IF NOT EXISTS idx_entries_session
  ON memory_entries(session_id);

CREATE INDEX IF NOT EXISTS idx_entries_type
  ON memory_entries(type);

CREATE INDEX IF NOT EXISTS idx_entries_status
  ON memory_entries(status);

CREATE INDEX IF NOT EXISTS idx_entries_lane
  ON memory_entries(memory_lane);

CREATE INDEX IF NOT EXISTS idx_entries_created
  ON memory_entries(created_at);

CREATE INDEX IF NOT EXISTS idx_entries_embedding_status
  ON memory_entries(embedding_status);

CREATE INDEX IF NOT EXISTS idx_entries_hash
  ON memory_entries(content_hash);

-- ─── Vector Table (sqlite-vec) ──────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
  memory_id TEXT PRIMARY KEY,
  embedding FLOAT[${dimensions}]
);

-- ─── Sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_sessions (
  session_id                  TEXT PRIMARY KEY,
  agent_passport_id           TEXT NOT NULL,
  namespace                   TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','archived')),
  turn_count                  INTEGER NOT NULL DEFAULT 0,
  total_tokens                INTEGER NOT NULL DEFAULT 0,
  last_receipted_turn_index   INTEGER NOT NULL DEFAULT -1,
  last_compacted_turn_index   INTEGER NOT NULL DEFAULT -1,
  summary                     TEXT,
  created_at                  INTEGER NOT NULL,
  last_activity               INTEGER NOT NULL,
  closed_at                   INTEGER
);

-- ─── Provenance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_provenance (
  record_id           TEXT PRIMARY KEY,
  agent_passport_id   TEXT NOT NULL,
  namespace           TEXT NOT NULL,
  memory_id           TEXT REFERENCES memory_entries(memory_id) ON DELETE SET NULL,
  operation           TEXT NOT NULL CHECK(operation IN ('create','update','supersede','archive','delete')),
  content_hash        TEXT NOT NULL,
  prev_hash           TEXT,
  receipt_hash        TEXT,
  receipt_run_id      TEXT,
  anchor_epoch_id     TEXT,
  deleted_memory_hash TEXT,
  created_at          INTEGER NOT NULL
);

-- ─── Snapshots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_snapshots (
  snapshot_id         TEXT PRIMARY KEY,
  agent_passport_id   TEXT NOT NULL,
  depin_cid           TEXT NOT NULL,
  entry_count         INTEGER NOT NULL,
  chain_head_hash     TEXT NOT NULL,
  snapshot_type       TEXT NOT NULL CHECK(snapshot_type IN ('checkpoint','migration','archive')),
  created_at          INTEGER NOT NULL
);

-- ─── Outbox ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_outbox (
  event_id            TEXT PRIMARY KEY,
  event_type          TEXT NOT NULL,
  memory_id           TEXT,
  agent_passport_id   TEXT NOT NULL,
  namespace           TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  processed_at        INTEGER,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON memory_outbox(processed_at) WHERE processed_at IS NULL;
`;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Initialize a fresh database (user_version = 0) with the full V3 schema.
 * Sets user_version to CURRENT_SCHEMA_VERSION when done.
 */
export function initSchema(db: Database.Database, dimensions: number = 1536): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion !== 0) return; // already initialized

  const sql = getSchemaV3Full(dimensions);
  db.exec(sql);
  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}

/**
 * Run any needed migrations from older schema versions.
 * Currently a no-op since fresh databases start at V3.
 * Future migrations from V1/V2 would go here.
 */
export function migrateIfNeeded(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  // Already at current version — nothing to do
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  // Future: handle V1 -> V2 -> V3 migrations here
  // For now, only fresh DBs (V0) are supported via initSchema()
}
