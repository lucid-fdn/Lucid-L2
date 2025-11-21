-- ============================================
-- Production Hardening Migration
-- Date: 2025-02-13
-- Version: 1.0
-- Description: Adds missing indexes and performance optimizations
-- ============================================

-- ============================================
-- MISSING INDEXES FROM PRODUCTION REVIEW
-- ============================================

-- User Wallets Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_wallets_wallet_id ON user_wallets(wallet_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_created ON user_wallets(created_at DESC);

-- Session Signers Performance Indexes
CREATE INDEX IF NOT EXISTS idx_session_signers_privy_id ON session_signers(privy_signer_id);
CREATE INDEX IF NOT EXISTS idx_session_signers_active ON session_signers(wallet_id, revoked_at, expires_at) 
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_signers_expired ON session_signers(expires_at) 
  WHERE revoked_at IS NULL AND expires_at < NOW();

-- Audit Log Performance Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON signer_audit_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_workflow ON signer_audit_log(n8n_workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_recent ON signer_audit_log(created_at DESC) 
  WHERE created_at > NOW() - INTERVAL '7 days';

-- OAuth Connections Performance Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_conn_active ON user_oauth_connections(privy_user_id, provider, revoked_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_conn_expired ON user_oauth_connections(expires_at)
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
CREATE INDEX IF NOT EXISTS idx_oauth_conn_last_used ON user_oauth_connections(last_used_at DESC);

-- OAuth Usage Log Performance Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_usage_success ON oauth_usage_log(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_errors ON oauth_usage_log(privy_user_id, provider, success)
  WHERE success = false;
CREATE INDEX IF NOT EXISTS idx_oauth_usage_recent ON oauth_usage_log(created_at DESC)
  WHERE created_at > NOW() - INTERVAL '24 hours';

-- OAuth States Cleanup Index
CREATE INDEX IF NOT EXISTS idx_oauth_states_cleanup ON oauth_states(expires_at)
  WHERE expires_at < NOW();

-- ============================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================

-- Transaction audit queries by user and date range
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON signer_audit_log(user_id, created_at DESC, status);

-- OAuth usage by user, provider, and time window
CREATE INDEX IF NOT EXISTS idx_oauth_usage_analytics ON oauth_usage_log(
  privy_user_id, 
  provider, 
  rate_limit_window, 
  success
);

-- Active session signers with policy checks
CREATE INDEX IF NOT EXISTS idx_signers_policy_check ON session_signers(
  wallet_id,
  revoked_at,
  expires_at,
  max_amount_lamports
) WHERE revoked_at IS NULL;

-- ============================================
-- MATERIALIZED VIEW FOR ANALYTICS (Optional)
-- ============================================

-- User wallet statistics view
CREATE MATERIALIZED VIEW IF NOT EXISTS user_wallet_stats AS
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

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_stats_user ON user_wallet_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallet_stats_activity ON user_wallet_stats(last_transaction_at DESC NULLS LAST);

-- Refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_user_wallet_stats() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_wallet_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PARTITIONING FOR LARGE TABLES (Future-proof)
-- ============================================

-- Audit log partitioning by month (if data volume grows)
-- Uncomment when audit log exceeds 1M rows
/*
CREATE TABLE IF NOT EXISTS signer_audit_log_2025_02 PARTITION OF signer_audit_log
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS signer_audit_log_2025_03 PARTITION OF signer_audit_log
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
*/

-- ============================================
-- PERFORMANCE TUNING SETTINGS
-- ============================================

-- Update statistics for query planner
ANALYZE user_wallets;
ANALYZE session_signers;
ANALYZE signer_audit_log;
ANALYZE user_oauth_connections;
ANALYZE oauth_usage_log;
ANALYZE oauth_states;

-- ============================================
-- AUTOMATED MAINTENANCE FUNCTIONS
-- ============================================

-- Vacuum and analyze expired session signers
CREATE OR REPLACE FUNCTION cleanup_expired_signers() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM session_signers
  WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')
     OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '30 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Update statistics after cleanup
  ANALYZE session_signers;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old audit logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM signer_audit_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Vacuum and analyze after large delete
  VACUUM ANALYZE signer_audit_log;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MONITORING VIEWS
-- ============================================

-- Recent failed transactions view
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

-- OAuth connection health view
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
  uoc.privy_user_id, 
  uoc.provider, 
  uoc.created_at, 
  uoc.last_used_at, 
  uoc.expires_at,
  uoc.revoked_at;

-- System health summary
CREATE OR REPLACE VIEW system_health_summary AS
SELECT
  (SELECT COUNT(*) FROM user_wallets) as total_wallets,
  (SELECT COUNT(*) FROM session_signers WHERE revoked_at IS NULL) as active_signers,
  (SELECT COUNT(*) FROM session_signers 
   WHERE revoked_at IS NULL 
   AND expires_at IS NOT NULL 
   AND expires_at < NOW() + INTERVAL '24 hours') as expiring_signers_24h,
  (SELECT COUNT(*) FROM user_oauth_connections WHERE revoked_at IS NULL) as active_oauth_connections,
  (SELECT COUNT(*) FROM signer_audit_log WHERE created_at > NOW() - INTERVAL '1 hour') as transactions_last_hour,
  (SELECT COUNT(*) FROM signer_audit_log 
   WHERE status IN ('denied', 'error') 
   AND created_at > NOW() - INTERVAL '1 hour') as failed_transactions_last_hour,
  (SELECT COUNT(*) FROM oauth_usage_log WHERE created_at > NOW() - INTERVAL '1 hour') as oauth_calls_last_hour,
  (SELECT COUNT(*) FROM oauth_usage_log 
   WHERE success = false 
   AND created_at > NOW() - INTERVAL '1 hour') as failed_oauth_calls_last_hour,
  NOW() as snapshot_time;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON INDEX idx_user_wallets_wallet_id IS 'Fast lookup by Privy wallet ID';
COMMENT ON INDEX idx_session_signers_active IS 'Optimizes active signer queries with policy checks';
COMMENT ON INDEX idx_oauth_usage_analytics IS 'Composite index for rate limiting and analytics queries';
COMMENT ON FUNCTION cleanup_expired_signers IS 'Removes session signers older than 30 days (run daily)';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Archives audit logs older than 90 days (run weekly)';
COMMENT ON VIEW system_health_summary IS 'Real-time system health metrics for monitoring dashboard';

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log', 
                    'user_oauth_connections', 'oauth_usage_log', 'oauth_states')
ORDER BY tablename, indexname;

-- Show table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log',
                    'user_oauth_connections', 'oauth_usage_log', 'oauth_states')
ORDER BY size_bytes DESC;
