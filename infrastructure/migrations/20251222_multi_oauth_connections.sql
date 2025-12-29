-- ============================================
-- Support multiple OAuth connections per provider per user
-- Date: 2025-12-22
-- ============================================

-- The original Nango integration migration created a uniqueness constraint:
--   UNIQUE(privy_user_id, provider)
-- which limits each user to one connection per provider.
--
-- We need multiple accounts per provider (e.g. multiple Twitter accounts).

ALTER TABLE IF EXISTS user_oauth_connections
  DROP CONSTRAINT IF EXISTS unique_user_provider;

-- Enforce uniqueness on the specific Nango connection instead.
-- (Nango connection_id is what we use to target a specific credential set).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_oauth_connections_user_provider_nango
  ON user_oauth_connections(privy_user_id, provider, nango_connection_id)
  WHERE revoked_at IS NULL;

-- Helpful index for listing a user's connections by provider.
CREATE INDEX IF NOT EXISTS idx_user_oauth_connections_user_provider
  ON user_oauth_connections(privy_user_id, provider)
  WHERE revoked_at IS NULL;
