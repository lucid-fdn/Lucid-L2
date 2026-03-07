-- Epoch Anchored Events Outbox
-- Reverse signaling: Lucid-L2 → platform-core
-- Platform-core consumer polls this table to know when agent epochs are anchored on-chain.

CREATE TABLE IF NOT EXISTS epoch_anchored_events (
  id            BIGSERIAL PRIMARY KEY,
  epoch_id      TEXT NOT NULL UNIQUE,
  agent_passport_id TEXT NOT NULL,
  mmr_root      TEXT NOT NULL,
  chain_tx      TEXT NOT NULL,
  anchored_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_epoch_anchored_unprocessed
  ON epoch_anchored_events (processed, id)
  WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_epoch_anchored_agent
  ON epoch_anchored_events (agent_passport_id);
