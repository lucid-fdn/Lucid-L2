-- Escrow state tracking (off-chain mirror of on-chain state)
CREATE TABLE IF NOT EXISTS escrow_records (
  escrow_id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL DEFAULT 'solana-devnet',
  depositor TEXT NOT NULL,
  beneficiary TEXT NOT NULL,
  token TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  expected_receipt_hash TEXT NOT NULL DEFAULT '',
  status SMALLINT NOT NULL DEFAULT 0,
  tx_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrows_depositor ON escrow_records (depositor);
CREATE INDEX idx_escrows_beneficiary ON escrow_records (beneficiary);
CREATE INDEX idx_escrows_status ON escrow_records (status);
