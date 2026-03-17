-- Migration: 20260304_agent_system
-- Description: Agent identity tracking, per-agent epochs, persisted deployment state.
-- Shares passport_id with lucid-platform-core (no cross-reference columns).

BEGIN;

-- ─── 1. Passports: create table if not exists + add tenant linkage ────────────
CREATE TABLE IF NOT EXISTS passports (
  passport_id          TEXT        PRIMARY KEY,
  passport_type        TEXT        NOT NULL DEFAULT 'agent'
                       CHECK (passport_type IN ('model','compute','tool','agent','dataset')),
  display_name         TEXT,
  owner_id             TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE passports
  ADD COLUMN IF NOT EXISTS platform_tenant_id TEXT;

-- ─── 2. Receipts: agent identity + full audit fields ─────────────────────────
-- run_id already exists (from 20260302_receipts_and_epochs.sql)
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS agent_passport_id TEXT,
  ADD COLUMN IF NOT EXISTS call_type         TEXT DEFAULT 'llm'
    CHECK (call_type IN ('llm','tool','oracle')),
  ADD COLUMN IF NOT EXISTS latency_ms        INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_in         INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_out        INTEGER,
  ADD COLUMN IF NOT EXISTS model             TEXT,
  ADD COLUMN IF NOT EXISTS provider          TEXT,
  ADD COLUMN IF NOT EXISTS pricing_version   TEXT,
  ADD COLUMN IF NOT EXISTS cost_usd          NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'success'
    CHECK (status IN ('success','error','timeout'));

CREATE INDEX IF NOT EXISTS idx_receipts_agent
  ON receipts(agent_passport_id, created_at DESC)
  WHERE agent_passport_id IS NOT NULL;

-- ─── 3. Epochs: per-agent isolation ──────────────────────────────────────────
ALTER TABLE epochs
  ADD COLUMN IF NOT EXISTS agent_passport_id TEXT;

CREATE INDEX IF NOT EXISTS idx_epochs_agent
  ON epochs(agent_passport_id, status)
  WHERE agent_passport_id IS NOT NULL;

-- ─── 4. Agent deployment state (replaces in-memory Map — used in Phase 2) ────
CREATE TABLE IF NOT EXISTS agent_deployments (
  passport_id          TEXT        PRIMARY KEY REFERENCES passports(passport_id),
  tenant_id            TEXT        NOT NULL,
  deployment_id        TEXT,
  deployment_target    TEXT        NOT NULL,
  deployment_url       TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','degraded','suspended','terminated','failed')),
  runtime_adapter      TEXT,
  wallet_address       TEXT,
  a2a_endpoint         TEXT,
  health_status        TEXT        DEFAULT 'unknown',
  platform_core_key_id TEXT,
  config               JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_deployments_status
  ON agent_deployments(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_deployments_tenant
  ON agent_deployments(tenant_id, created_at DESC);

COMMIT;
