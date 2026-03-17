-- User wallets table
CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  privy_user_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  wallet_id TEXT NOT NULL UNIQUE,  -- Privy wallet ID
  chain_type TEXT NOT NULL CHECK (chain_type IN ('solana', 'ethereum', 'base', 'polygon')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_chain UNIQUE (user_id, chain_type)
);

-- Session signers table
CREATE TABLE IF NOT EXISTS session_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES user_wallets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Privy signer details
  privy_signer_id TEXT NOT NULL,
  authorization_key_private TEXT NOT NULL,  -- Encrypted
  authorization_key_public TEXT NOT NULL,
  
  -- Policy configuration
  policy_id TEXT,
  ttl_seconds INTEGER,
  max_amount_lamports BIGINT,
  max_amount_wei TEXT,
  allowed_programs TEXT[],  -- Solana Program IDs
  allowed_contracts TEXT[], -- EVM contract addresses
  daily_limit_lamports BIGINT,
  daily_limit_wei TEXT,
  requires_quorum BOOLEAN DEFAULT false,
  
  -- Usage tracking
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  daily_usage_lamports BIGINT DEFAULT 0,
  daily_usage_wei TEXT DEFAULT '0',
  daily_usage_reset_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  
  CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Transaction audit log
CREATE TABLE IF NOT EXISTS signer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signer_id UUID REFERENCES session_signers(id),
  wallet_id UUID REFERENCES user_wallets(id),
  user_id TEXT NOT NULL,
  
  -- Transaction details
  transaction_type TEXT NOT NULL,
  chain_type TEXT NOT NULL,
  amount_lamports BIGINT,
  amount_wei TEXT,
  program_id TEXT,
  contract_address TEXT,
  transaction_signature TEXT,
  transaction_hash TEXT,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('success', 'denied', 'error')),
  denial_reason TEXT,
  error_message TEXT,
  
  -- Metadata
  n8n_workflow_id TEXT,
  n8n_execution_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_privy_user ON user_wallets(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_session_signers_wallet ON session_signers(wallet_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_user ON session_signers(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_expiry ON session_signers(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON signer_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_wallet ON signer_audit_log(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_signer ON signer_audit_log(signer_id, created_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for user_wallets
DROP TRIGGER IF EXISTS update_user_wallets_updated_at ON user_wallets;
CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
