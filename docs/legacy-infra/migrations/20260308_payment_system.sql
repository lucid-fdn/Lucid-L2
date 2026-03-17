-- x402 Universal Payment System tables
BEGIN;

-- Asset pricing configuration
CREATE TABLE IF NOT EXISTS asset_pricing (
  passport_id TEXT PRIMARY KEY,
  price_per_call BIGINT,
  price_per_token BIGINT,
  price_subscription_hour BIGINT,
  accepted_tokens TEXT[] DEFAULT ARRAY['USDC'],
  accepted_chains TEXT[] DEFAULT ARRAY['base'],
  payout_address TEXT NOT NULL,
  custom_split_bps JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Revenue tracking per asset per run
CREATE TABLE IF NOT EXISTS asset_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT NOT NULL DEFAULT 'base',
  role TEXT NOT NULL CHECK (role IN ('compute', 'model', 'protocol', 'orchestrator')),
  tx_hash TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_revenue_passport ON asset_revenue(passport_id);
CREATE INDEX IF NOT EXISTS idx_asset_revenue_status ON asset_revenue(passport_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_revenue_run ON asset_revenue(run_id);

-- Payout splits (replaces in-memory payoutStore)
CREATE TABLE IF NOT EXISTS payout_splits (
  run_id TEXT PRIMARY KEY,
  total_amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT NOT NULL DEFAULT 'base',
  split_config JSONB NOT NULL,
  recipients JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payout execution tracking (replaces in-memory executionStore)
CREATE TABLE IF NOT EXISTS payout_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_exec_run ON payout_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_payout_exec_status ON payout_executions(status);

-- x402 spent proofs (backup for Redis)
CREATE TABLE IF NOT EXISTS x402_spent_proofs (
  tx_hash TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  amount BIGINT NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_spent_proofs_expires ON x402_spent_proofs(expires_at);

COMMIT;
