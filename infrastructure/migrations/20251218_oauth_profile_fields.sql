-- ============================================
-- Add OAuth provider profile fields to user_oauth_connections
-- Date: 2025-12-18
-- ============================================

ALTER TABLE IF EXISTS user_oauth_connections
  ADD COLUMN IF NOT EXISTS provider_username TEXT,
  ADD COLUMN IF NOT EXISTS provider_display_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT;

-- Helpful index for lookup (optional)
CREATE INDEX IF NOT EXISTS idx_user_oauth_connections_provider_username
  ON user_oauth_connections(provider, provider_username)
  WHERE revoked_at IS NULL;
