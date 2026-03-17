-- Migration: Persist validation and reputation data for Solana adapter
-- Previously stored in ephemeral Maps, now backed by PostgreSQL.

CREATE TABLE IF NOT EXISTS validations (
  validation_id TEXT PRIMARY KEY,
  agent_token_id TEXT NOT NULL,
  validator TEXT NOT NULL,
  valid BOOLEAN NOT NULL,
  receipt_hash TEXT,
  metadata TEXT,
  chain_id TEXT NOT NULL DEFAULT 'solana-devnet',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_validations_agent ON validations(agent_token_id);

CREATE TABLE IF NOT EXISTS reputation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_token_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 100),
  category TEXT,
  comment_hash TEXT,
  chain_id TEXT NOT NULL DEFAULT 'solana-devnet',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reputation_agent ON reputation_scores(agent_token_id);
