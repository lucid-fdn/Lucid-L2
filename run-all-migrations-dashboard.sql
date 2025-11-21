-- ============================================
-- COMPLETE MIGRATION SCRIPT FOR SUPABASE DASHBOARD
-- Run this in Supabase SQL Editor to set up everything
-- ============================================

-- This will create all tables and then add production hardening
-- Run this entire file in one go in Supabase SQL Editor

-- ============================================
-- PART 1: Privy Wallets Schema (from 20250131)
-- ============================================

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

-- Indexes for Privy tables
CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_privy_user ON user_wallets(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_session_signers_wallet ON session_signers(wallet_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_user ON session_signers(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_expiry ON session_signers(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON signer_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_wallet ON signer_audit_log(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_signer ON signer_audit_log(signer_id, created_at DESC);

-- ============================================
-- PART 2: Nango OAuth Integration (from 20250210)
-- ============================================

-- OAuth state management (CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  privy_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- User OAuth connections linked to Privy users
CREATE TABLE IF NOT EXISTS user_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  
  -- Nango details
  nango_connection_id TEXT NOT NULL,
  nango_integration_id TEXT NOT NULL,
  
  -- Provider account info
  provider_account_id TEXT,
  provider_account_name TEXT,
  provider_account_email TEXT,
  scopes TEXT[],
  
  -- Lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  
  CONSTRAINT unique_user_provider UNIQUE (privy_user_id, provider)
);

-- OAuth API usage logging
CREATE TABLE IF NOT EXISTS oauth_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES user_oauth_connections(id) ON DELETE SET NULL,
  privy_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  
  -- Request details
  n8n_workflow_id TEXT,
  n8n_execution_id TEXT,
  endpoint_called TEXT,
  api_method TEXT CHECK (api_method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  
  -- Response
  status_code INTEGER,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  
  -- Performance
  created_at TIMESTAMP DEFAULT NOW(),
  response_time_ms INTEGER,
  
  -- Rate limiting
  rate_limit_window TIMESTAMP DEFAULT DATE_TRUNC('hour', NOW())
);

-- Indexes for OAuth tables
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at) WHERE expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user ON user_oauth_connections(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON user_oauth_connections(provider) 
  WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_oauth_connections_nango ON user_oauth_connections(nango_connection_id);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_user_time ON oauth_usage_log(privy_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_workflow ON oauth_usage_log(n8n_workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_rate_limit ON oauth_usage_log(privy_user_id, provider, rate_limit_window);

-- Cleanup function for OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states() RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Rate limiting helper function
CREATE OR REPLACE FUNCTION get_user_request_count(
  p_privy_user_id TEXT,
  p_provider TEXT,
  p_window_start TIMESTAMP
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM oauth_usage_log
    WHERE privy_user_id = p_privy_user_id
      AND provider = p_provider
      AND rate_limit_window = p_window_start
  );
END;
$$ LANGUAGE plpgsql;

-- High frequency detection
CREATE OR REPLACE FUNCTION get_high_frequency_oauth_users(
  p_threshold INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
) RETURNS TABLE(
  privy_user_id TEXT,
  provider TEXT,
  request_count BIGINT,
  window_start TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.privy_user_id,
    l.provider,
    COUNT(*) as request_count,
    l.rate_limit_window
  FROM oauth_usage_log l
  WHERE l.created_at >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
  GROUP BY l.privy_user_id, l.provider, l.rate_limit_window
  HAVING COUNT(*) > p_threshold
  ORDER BY request_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 3: Production Hardening (from 20250213)
-- ============================================

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_user_wallets_wallet_id ON user_wallets(wallet_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_created ON user_wallets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_signers_priv_id ON session_signers(privy_signer_id);
CREATE INDEX IF NOT EXISTS idx_session_signers_active ON session_signers(wallet_id, revoked_at, expires_at) 
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_expired ON session_signers(expires_at) 
  WHERE revoked_at IS NULL AND expires_at < NOW();

CREATE INDEX IF NOT EXISTS idx_audit_log_status ON signer_audit_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_workflow ON signer_audit_log(n8n_workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_recent ON signer_audit_log(created_at DESC) 
  WHERE created_at > NOW() - INTERVAL '7 days';

CREATE INDEX IF NOT EXISTS idx_oauth_conn_active ON user_oauth_connections(privy_user_id, provider, revoked_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_conn_expired ON user_oauth_connections(expires_at)
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
CREATE INDEX IF NOT EXISTS idx_oauth_conn_last_used ON user_oauth_connections(last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_oauth_usage_success ON oauth_usage_log(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_errors ON oauth_usage_log(privy_user_id, provider, success)
  WHERE success = false;
CREATE INDEX IF NOT EXISTS idx_oauth_usage_recent ON oauth_usage_log(created_at DESC)
  WHERE created_at > NOW() - INTERVAL '24 hours';

CREATE INDEX IF NOT EXISTS idx_oauth_states_cleanup ON oauth_states(expires_at)
  WHERE expires_at < NOW();

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON signer_audit_log(user_id, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_analytics ON oauth_usage_log(
  privy_user_id, provider, rate_limit_window, success
);
CREATE INDEX IF NOT EXISTS idx_signers_policy_check ON session_signers(
  wallet_id, revoked_at, expires_at, max_amount_lamports
) WHERE revoked_at IS NULL;

-- Materialized view for user statistics
DROP MATERIALIZED VIEW IF EXISTS user_wallet_stats;
CREATE MATERIALIZED VIEW user_wallet_stats AS
SELECT 
  uw.user_id,
  uw.privy_user_id,
  COUNT(DISTINCT uw.chain_type) as chain_count,
  COUNT(DISTINCT ss.id) as signer_count,
  COUNT(DISTINCT ss.id) FILTER (WHERE ss.revoked_at IS NULL) as active_signers,
  COUNT(sal.id) as total_transactions,
  COUNT(sal.id) FILTER (WHERE sal.status = 'success') as successful_transactions,
  COUNT(sal.id) FILTER (WHERE sal.status = 'denied') as denied_transactions,
  MAX(sal.created_at) as last_transaction_at,
  NOW() as updated_at
FROM user_wallets uw
LEFT JOIN session_signers ss ON uw.id = ss.wallet_id
LEFT JOIN signer_audit_log sal ON uw.id = sal.wallet_id
GROUP BY uw.user_id, uw.privy_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_stats_user ON user_wallet_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallet_stats_activity ON user_wallet_stats(last_transaction_at DESC NULLS LAST);

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_signers() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM session_signers
  WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')
     OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '30 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  ANALYZE session_signers;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM signer_audit_log WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  VACUUM ANALYZE signer_audit_log;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_user_wallet_stats() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_wallet_stats;
END;
$$ LANGUAGE plpgsql;

-- Monitoring views
CREATE OR REPLACE VIEW recent_failed_transactions AS
SELECT 
  sal.id,
  sal.user_id,
  uw.wallet_address,
  sal.chain_type,
  sal.status,
  sal.denial_reason,
  sal.error_message,
  sal.created_at,
  sal.n8n_workflow_id
FROM signer_audit_log sal
JOIN user_wallets uw ON sal.wallet_id = uw.id
WHERE sal.status IN ('denied', 'error')
  AND sal.created_at > NOW() - INTERVAL '24 hours'
ORDER BY sal.created_at DESC;

CREATE OR REPLACE VIEW oauth_connection_health AS
SELECT 
  uoc.privy_user_id,
  uoc.provider,
  uoc.created_at,
  uoc.last_used_at,
  uoc.expires_at,
  CASE 
    WHEN uoc.revoked_at IS NOT NULL THEN 'revoked'
    WHEN uoc.expires_at IS NOT NULL AND uoc.expires_at < NOW() THEN 'expired'
    WHEN uoc.last_used_at < NOW() - INTERVAL '30 days' THEN 'stale'
    ELSE 'active'
  END as status,
  COUNT(oul.id) as usage_count_24h,
  COUNT(oul.id) FILTER (WHERE oul.success = false) as error_count_24h
FROM user_oauth_connections uoc
LEFT JOIN oauth_usage_log oul ON 
  uoc.privy_user_id = oul.privy_user_id 
  AND uoc.provider = oul.provider
  AND oul.created_at > NOW() - INTERVAL '24 hours'
GROUP BY 
  uoc.privy_user_id, uoc.provider, uoc.created_at, 
  uoc.last_used_at, uoc.expires_at, uoc.revoked_at;

CREATE OR REPLACE VIEW system_health_summary AS
SELECT
  (SELECT COUNT(*) FROM user_wallets) as total_wallets,
  (SELECT COUNT(*) FROM session_signers WHERE revoked_at IS NULL) as active_signers,
  (SELECT COUNT(*) FROM session_signers 
   WHERE revoked_at IS NULL AND expires_at IS NOT NULL 
   AND expires_at < NOW() + INTERVAL '24 hours') as expiring_signers_24h,
  (SELECT COUNT(*) FROM user_oauth_connections WHERE revoked_at IS NULL) as active_oauth_connections,
  (SELECT COUNT(*) FROM signer_audit_log WHERE created_at > NOW() - INTERVAL '1 hour') as transactions_last_hour,
  (SELECT COUNT(*) FROM signer_audit_log 
   WHERE status IN ('denied', 'error') AND created_at > NOW() - INTERVAL '1 hour') as failed_transactions_last_hour,
  (SELECT COUNT(*) FROM oauth_usage_log WHERE created_at > NOW() - INTERVAL '1 hour') as oauth_calls_last_hour,
  (SELECT COUNT(*) FROM oauth_usage_log 
   WHERE success = false AND created_at > NOW() - INTERVAL '1 hour') as failed_oauth_calls_last_hour,
  NOW() as snapshot_time;

-- Trigger for auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_wallets_updated_at ON user_wallets;
CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update statistics
ANALYZE user_wallets;
ANALYZE session_signers;
ANALYZE signer_audit_log;
ANALYZE user_oauth_connections;
ANALYZE oauth_usage_log;
ANALYZE oauth_states;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Show created tables
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log',
                    'user_oauth_connections', 'oauth_usage_log', 'oauth_states')
ORDER BY tablename;

-- Show created indexes
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log',
                    'user_oauth_connections', 'oauth_usage_log', 'oauth_states')
ORDER BY tablename, indexname;

-- Show created views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('recent_failed_transactions', 'oauth_connection_health', 'system_health_summary');

-- Show created functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('cleanup_expired_signers', 'cleanup_old_audit_logs', 
                       'cleanup_expired_oauth_states', 'refresh_user_wallet_stats',
                       'get_user_request_count', 'get_high_frequency_oauth_users');

-- Test system health view
SELECT * FROM system_health_summary;
