-- infrastructure/migrations/20260306_payment_events.sql
-- Payment events + grant budgets for async settlement and replay protection

-- Grant spend tracking (replay-safe limits)
CREATE TABLE IF NOT EXISTS grant_budgets (
  grant_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  signer_pubkey TEXT,
  max_calls INTEGER NOT NULL,
  max_usd NUMERIC(18,6) NOT NULL,
  calls_used INTEGER NOT NULL DEFAULT 0,
  usd_used NUMERIC(18,6) NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_budgets_tenant ON grant_budgets(tenant_id);

-- Atomic budget consume: returns TRUE if budget available, FALSE if exceeded
CREATE OR REPLACE FUNCTION consume_grant_budget(
  p_grant_id TEXT, p_delta_usd NUMERIC, p_delta_calls INTEGER
) RETURNS BOOLEAN AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  UPDATE grant_budgets
  SET calls_used = calls_used + p_delta_calls,
      usd_used = usd_used + p_delta_usd
  WHERE grant_id = p_grant_id
    AND calls_used + p_delta_calls <= max_calls
    AND usd_used + p_delta_usd <= max_usd
    AND expires_at > NOW()
  RETURNING TRUE INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Ensure a grant budget row exists (called on first use of a grant)
CREATE OR REPLACE FUNCTION ensure_grant_budget(
  p_grant_id TEXT, p_tenant_id TEXT, p_signer_pubkey TEXT,
  p_max_calls INTEGER, p_max_usd NUMERIC, p_expires_at TIMESTAMPTZ
) RETURNS VOID AS $$
BEGIN
  INSERT INTO grant_budgets (grant_id, tenant_id, signer_pubkey, max_calls, max_usd, expires_at)
  VALUES (p_grant_id, p_tenant_id, p_signer_pubkey, p_max_calls, p_max_usd, p_expires_at)
  ON CONFLICT (grant_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  agent_passport_id TEXT,
  payer_address TEXT NOT NULL,
  payee_address TEXT NOT NULL,
  token TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  amount_usd NUMERIC(18,6),
  payment_method TEXT NOT NULL,
  grant_id TEXT,
  access_receipt_tx TEXT,
  receipt_epoch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_run ON payment_events(run_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payer ON payment_events(payer_address);
CREATE INDEX IF NOT EXISTS idx_payment_events_epoch ON payment_events(receipt_epoch_id);

CREATE TABLE IF NOT EXISTS payment_epochs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  receipt_epoch_refs TEXT[],
  settlement_root TEXT,
  chain_tx JSONB,
  total_settled_usd NUMERIC(18,6) DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_epochs_status ON payment_epochs(status);
