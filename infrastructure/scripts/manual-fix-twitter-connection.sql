-- ============================================================================
-- MANUAL FIX: Register Existing Twitter OAuth Connection
-- ============================================================================
-- This SQL manually registers the Twitter connection that exists in Nango
-- but is missing from the user_oauth_connections table.
--
-- USER: did:privy:cmi2zxrhi01gal70cm2n2xke5
-- CONNECTION: did:privy:cmi2zxrhi01gal70cm2n2xke5-twitter (exists in Nango)
--
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kwihlcnapmkaivijyiif/sql
-- ============================================================================

-- Step 1: Insert the missing connection record
INSERT INTO user_oauth_connections (
  privy_user_id,
  user_id,
  provider,
  nango_connection_id,
  nango_integration_id,
  scopes,
  created_at
) VALUES (
  'did:privy:cmi2zxrhi01gal70cm2n2xke5',
  'did:privy:cmi2zxrhi01gal70cm2n2xke5',
  'twitter',
  'did:privy:cmi2zxrhi01gal70cm2n2xke5-twitter',
  'twitter-v2',
  ARRAY['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  NOW()
)
ON CONFLICT (privy_user_id, provider) 
DO UPDATE SET
  nango_connection_id = EXCLUDED.nango_connection_id,
  nango_integration_id = EXCLUDED.nango_integration_id,
  revoked_at = NULL;

-- Step 2: Verify the connection was inserted
SELECT 
  id,
  privy_user_id,
  provider,
  nango_connection_id,
  nango_integration_id,
  created_at,
  last_used_at,
  revoked_at
FROM user_oauth_connections
WHERE privy_user_id = 'did:privy:cmi2zxrhi01gal70cm2n2xke5';

-- Step 3: Clean up expired OAuth states (optional cleanup)
DELETE FROM oauth_states
WHERE privy_user_id = 'did:privy:cmi2zxrhi01gal70cm2n2xke5'
  AND expires_at < NOW();

-- ============================================================================
-- EXPECTED RESULT:
-- ============================================================================
-- After running this SQL, the API endpoint GET /api/oauth/connections
-- should return the Twitter connection for this user.
--
-- Test with:
-- curl -X GET "https://api.lucid.foundation/api/oauth/connections" \
--   -H "Authorization: Bearer <PRIVY_JWT_TOKEN>"
-- ============================================================================
