-- Admin audit log for security monitoring
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  reason TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_ip ON admin_audit_log (ip);
CREATE INDEX idx_admin_audit_created ON admin_audit_log (created_at DESC);

-- Auto-expire old audit entries (keep 90 days)
-- Run via pg_cron or application-level cleanup:
-- DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '90 days';

-- User profiles (JIT-provisioned from Privy auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_email ON profiles (email) WHERE email IS NOT NULL;
CREATE INDEX idx_profiles_handle ON profiles (handle);

-- Identity links (maps external auth providers to internal user IDs)
CREATE TABLE IF NOT EXISTS identity_links (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id)
);

CREATE INDEX idx_identity_links_user ON identity_links (user_id);
CREATE INDEX idx_identity_links_provider ON identity_links (provider, external_id);
