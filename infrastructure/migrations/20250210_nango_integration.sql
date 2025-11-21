-- ============================================
-- Nango + n8n Credential Management Migration
-- Date: 2025-02-10
-- Version: 1.0
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at) WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_oauth_connections_user ON user_oauth_connections(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON user_oauth_connections(provider) 
  WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_oauth_connections_nango ON user_oauth_connections(nango_connection_id);

CREATE INDEX IF NOT EXISTS idx_oauth_usage_user_time ON oauth_usage_log(privy_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_workflow ON oauth_usage_log(n8n_workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_usage_rate_limit ON oauth_usage_log(privy_user_id, provider, rate_limit_window);

-- Cleanup old states (auto)
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

-- Comments for documentation
COMMENT ON TABLE oauth_states IS 'Temporary OAuth state tokens for CSRF protection during OAuth flows';
COMMENT ON TABLE user_oauth_connections IS 'User OAuth connections managed by Nango, linked to Privy user IDs';
COMMENT ON TABLE oauth_usage_log IS 'Audit log of all OAuth API calls made through n8n workflows';

COMMENT ON COLUMN user_oauth_connections.privy_user_id IS 'Privy user ID from JWT authentication';
COMMENT ON COLUMN user_oauth_connections.nango_connection_id IS 'Nango internal connection ID';
COMMENT ON COLUMN user_oauth_connections.provider IS 'OAuth provider name (twitter, discord, binance, etc.)';

COMMENT ON COLUMN oauth_usage_log.n8n_workflow_id IS 'n8n workflow that made the API call';
COMMENT ON COLUMN oauth_usage_log.n8n_execution_id IS 'Specific execution ID for tracing';
COMMENT ON COLUMN oauth_usage_log.rate_limit_window IS 'Hourly window for rate limiting calculations';
