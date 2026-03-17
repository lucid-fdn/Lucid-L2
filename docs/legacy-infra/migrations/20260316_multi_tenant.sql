-- Migration: 20260316_multi_tenant
-- Adds tenant_id to all L2 tables for multi-tenant cloud deployments.
-- Self-hosted: tenant_id defaults to 'default', no RLS needed.
-- Cloud: enable RLS via separate policy migration.

BEGIN;

-- Receipt & Epoch
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE epochs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE epoch_receipts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE epoch_anchored_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- MMR
ALTER TABLE mmr_state ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE mmr_nodes ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Identity & Anchoring
ALTER TABLE passports ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE anchor_records ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Deployment
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Memory
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memory_provenance ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memory_sessions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memory_snapshots ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memory_outbox ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Escrow & Reputation
ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE reputation_feedback ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE reputation_validations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Payment
ALTER TABLE asset_pricing ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE asset_revenue ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE payout_splits ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE payout_executions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE x402_spent_proofs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE grant_budgets ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE payment_epochs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- System
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE receipt_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_epochs_tenant ON epochs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_epoch_receipts_tenant ON epoch_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_epoch_anchored_events_tenant ON epoch_anchored_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mmr_state_tenant ON mmr_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mmr_nodes_tenant ON mmr_nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_passports_tenant ON passports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anchor_records_tenant ON anchor_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deployment_events_tenant ON deployment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_tenant ON memory_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_provenance_tenant ON memory_provenance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_tenant ON memory_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_snapshots_tenant ON memory_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_outbox_tenant ON memory_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_escrow_records_tenant ON escrow_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reputation_feedback_tenant ON reputation_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reputation_validations_tenant ON reputation_validations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_pricing_tenant ON asset_pricing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_revenue_tenant ON asset_revenue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_splits_tenant ON payout_splits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_executions_tenant ON payout_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_x402_spent_proofs_tenant ON x402_spent_proofs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_grant_budgets_tenant ON grant_budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_epochs_tenant ON payment_epochs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_tenant ON admin_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipt_events_tenant ON receipt_events(tenant_id);

COMMIT;
