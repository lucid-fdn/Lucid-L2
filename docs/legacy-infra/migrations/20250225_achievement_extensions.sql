-- Achievement Extensions Migration
-- Add support for batch_thoughts and referral tracking

-- Add referred_users array to track referrals
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS referred_users TEXT[] DEFAULT '{}';

-- Add metadata column to conversations for batch tracking
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index on metadata for performance
CREATE INDEX IF NOT EXISTS idx_conversations_metadata ON conversations USING GIN (metadata);

-- Comments
COMMENT ON COLUMN users.referred_users IS 'Array of privy_user_ids that this user referred';
COMMENT ON COLUMN conversations.metadata IS 'Additional metadata like is_batch flag for tracking batch processing';

-- Example of updating a conversation to mark it as batch:
-- UPDATE conversations SET metadata = '{"is_batch": true}' WHERE id = 'some-id';

-- Example of adding a referral:
-- UPDATE users SET referred_users = array_append(referred_users, 'referred_user_privy_id') WHERE privy_user_id = 'referrer_privy_id';
