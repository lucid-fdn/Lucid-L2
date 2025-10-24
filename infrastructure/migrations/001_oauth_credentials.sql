-- =============================================================================
-- Lucid OAuth Infrastructure - Database Migration
-- =============================================================================
-- Migration: 001_oauth_credentials.sql
-- Description: Create tables for OAuth credential management
-- Author: Lucid Team
-- Date: 2025-01-23
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CREDENTIALS TABLE
-- =============================================================================
-- Stores OAuth credentials linked to Privy user accounts
-- Integrates with Nango for OAuth token management

CREATE TABLE IF NOT EXISTS credentials (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User reference (Privy user ID format: did:privy:...)
    user_id TEXT NOT NULL,
    
    -- Service identification
    service TEXT NOT NULL,
    name TEXT NOT NULL,
    
    -- Authentication type
    auth_type TEXT NOT NULL DEFAULT 'oauth',
    CONSTRAINT credentials_auth_type_check CHECK (auth_type IN ('oauth', 'api_key', 'manual')),
    
    -- Nango connection reference (for OAuth)
    nango_connection_id TEXT,
    
    -- Additional metadata (email, username, scopes, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- For manual/API key credentials (encrypted)
    encrypted_data TEXT,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT credentials_user_service_unique UNIQUE (user_id, service, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service);
CREATE INDEX IF NOT EXISTS idx_credentials_nango_connection ON credentials(nango_connection_id);
CREATE INDEX IF NOT EXISTS idx_credentials_auth_type ON credentials(auth_type);
CREATE INDEX IF NOT EXISTS idx_credentials_active ON credentials(is_active) WHERE is_active = true;

-- Add comments
COMMENT ON TABLE credentials IS 'Stores OAuth and API credentials for users';
COMMENT ON COLUMN credentials.user_id IS 'Privy user identifier (format: did:privy:...)';
COMMENT ON COLUMN credentials.service IS 'Service identifier (google, slack, github, etc.)';
COMMENT ON COLUMN credentials.auth_type IS 'Type of authentication: oauth, api_key, or manual';
COMMENT ON COLUMN credentials.nango_connection_id IS 'Reference to Nango connection for OAuth';
COMMENT ON COLUMN credentials.metadata IS 'Additional data (email, username, scopes)';
COMMENT ON COLUMN credentials.encrypted_data IS 'Encrypted credential data for non-OAuth auth';

-- =============================================================================
-- CREDENTIAL USAGE TABLE
-- =============================================================================
-- Tracks when and how credentials are used

CREATE TABLE IF NOT EXISTS credential_usage (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Credential reference
    credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    
    -- Usage context
    workflow_id TEXT,
    workflow_name TEXT,
    execution_id TEXT,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    
    -- Timestamp
    used_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_credential_usage_credential ON credential_usage(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_usage_workflow ON credential_usage(workflow_id);
CREATE INDEX IF NOT EXISTS idx_credential_usage_used_at ON credential_usage(used_at DESC);
CREATE INDEX IF NOT EXISTS idx_credential_usage_success ON credential_usage(success);

-- Add comments
COMMENT ON TABLE credential_usage IS 'Tracks credential usage for analytics and debugging';
COMMENT ON COLUMN credential_usage.credential_id IS 'Reference to the credential used';
COMMENT ON COLUMN credential_usage.workflow_id IS 'Workflow or automation that used the credential';
COMMENT ON COLUMN credential_usage.success IS 'Whether the credential usage was successful';

-- =============================================================================
-- OAUTH PROVIDERS TABLE
-- =============================================================================
-- Stores OAuth provider configurations

CREATE TABLE IF NOT EXISTS oauth_providers (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Provider details
    provider_key TEXT NOT NULL UNIQUE,
    provider_name TEXT NOT NULL,
    
    -- Integration details
    integration_id TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'oauth',
    
    -- Configuration
    default_scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    icon_url TEXT,
    description TEXT,
    
    -- Status
    is_enabled BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_oauth_providers_enabled ON oauth_providers(is_enabled) WHERE is_enabled = true;

-- Add comments
COMMENT ON TABLE oauth_providers IS 'OAuth provider configurations';
COMMENT ON COLUMN oauth_providers.provider_key IS 'Unique provider identifier (google, slack, etc.)';
COMMENT ON COLUMN oauth_providers.integration_id IS 'Nango integration ID';

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for credentials table
CREATE TRIGGER update_credentials_updated_at
    BEFORE UPDATE ON credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for oauth_providers table
CREATE TRIGGER update_oauth_providers_updated_at
    BEFORE UPDATE ON oauth_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_used_at when credential is used
CREATE OR REPLACE FUNCTION update_credential_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE credentials
    SET last_used_at = NEW.used_at
    WHERE id = NEW.credential_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_used_at
CREATE TRIGGER update_credential_usage_timestamp
    AFTER INSERT ON credential_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_credential_last_used();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on credentials table
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own credentials
CREATE POLICY credentials_user_isolation ON credentials
    FOR ALL
    USING (user_id = current_setting('app.user_id', true));

-- Policy: Service role can access all credentials
CREATE POLICY credentials_service_access ON credentials
    FOR ALL
    TO service_role
    USING (true);

-- Enable RLS on credential_usage table
ALTER TABLE credential_usage ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see usage of their credentials
CREATE POLICY credential_usage_user_isolation ON credential_usage
    FOR SELECT
    USING (
        credential_id IN (
            SELECT id FROM credentials
            WHERE user_id = current_setting('app.user_id', true)
        )
    );

-- Policy: Service role can access all usage records
CREATE POLICY credential_usage_service_access ON credential_usage
    FOR ALL
    TO service_role
    USING (true);

-- OAuth providers table is public readable
ALTER TABLE oauth_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_providers_public_read ON oauth_providers
    FOR SELECT
    USING (is_enabled = true);

CREATE POLICY oauth_providers_service_write ON oauth_providers
    FOR ALL
    TO service_role
    USING (true);

-- =============================================================================
-- SEED DATA - Popular OAuth Providers
-- =============================================================================

INSERT INTO oauth_providers (provider_key, provider_name, integration_id, auth_type, default_scopes, description) VALUES
    ('google', 'Google', 'google', 'oauth', ARRAY['email', 'profile', 'https://www.googleapis.com/auth/gmail.send'], 'Connect your Google account for Gmail, Drive, and Calendar access'),
    ('slack', 'Slack', 'slack', 'oauth', ARRAY['chat:write', 'users:read', 'channels:read'], 'Send messages and manage Slack channels'),
    ('github', 'GitHub', 'github', 'oauth', ARRAY['repo', 'user', 'workflow'], 'Access repositories and manage workflows'),
    ('microsoft', 'Microsoft', 'microsoft', 'oauth', ARRAY['User.Read', 'Mail.Send', 'Calendars.ReadWrite'], 'Access Microsoft 365 services'),
    ('linear', 'Linear', 'linear', 'oauth', ARRAY['read', 'write'], 'Create and manage Linear issues'),
    ('notion', 'Notion', 'notion', 'oauth', ARRAY['read_content', 'update_content', 'insert_content'], 'Read and write Notion pages')
ON CONFLICT (provider_key) DO NOTHING;

-- Insert API key providers (manual entry)
INSERT INTO oauth_providers (provider_key, provider_name, integration_id, auth_type, description) VALUES
    ('openai', 'OpenAI', 'openai', 'api_key', 'Use OpenAI GPT models and APIs'),
    ('stripe', 'Stripe', 'stripe', 'api_key', 'Process payments and manage subscriptions'),
    ('sendgrid', 'SendGrid', 'sendgrid', 'api_key', 'Send transactional emails'),
    ('airtable', 'Airtable', 'airtable', 'api_key', 'Read and write Airtable bases')
ON CONFLICT (provider_key) DO NOTHING;

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View for active credentials with usage stats
CREATE OR REPLACE VIEW credentials_with_stats AS
SELECT 
    c.*,
    COUNT(cu.id) as total_uses,
    COUNT(cu.id) FILTER (WHERE cu.success = true) as successful_uses,
    COUNT(cu.id) FILTER (WHERE cu.success = false) as failed_uses,
    MAX(cu.used_at) as last_usage_at
FROM credentials c
LEFT JOIN credential_usage cu ON c.id = cu.credential_id
WHERE c.is_active = true
GROUP BY c.id;

COMMENT ON VIEW credentials_with_stats IS 'Credentials with aggregated usage statistics';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 001_oauth_credentials.sql completed successfully';
    RAISE NOTICE '📊 Created tables: credentials, credential_usage, oauth_providers';
    RAISE NOTICE '🔐 Enabled Row Level Security on all tables';
    RAISE NOTICE '🌱 Seeded % OAuth providers', (SELECT COUNT(*) FROM oauth_providers);
END $$;
