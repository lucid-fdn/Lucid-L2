-- Rewards System Migration
-- User rewards, conversations, and achievement tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Privy authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  privy_user_id TEXT UNIQUE NOT NULL,
  wallet_address TEXT,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  total_thoughts_processed INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0
);

-- Rewards balance table
CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mgas_balance INTEGER DEFAULT 0,
  lucid_balance DECIMAL(18, 8) DEFAULT 0,
  lifetime_mgas_earned INTEGER DEFAULT 0,
  lifetime_lucid_earned DECIMAL(18, 8) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Conversations table (ChatGPT captures)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  quality_score DECIMAL(3, 2),
  quality_tier TEXT, -- 'excellent', 'good', 'average', 'basic'
  quality_breakdown JSONB, -- Detailed quality metrics
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reward transactions (audit log)
CREATE TABLE IF NOT EXISTS reward_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- 'earn', 'convert', 'bonus', 'referral', 'achievement'
  mgas_amount INTEGER,
  lucid_amount DECIMAL(18, 8),
  source TEXT, -- 'conversation', 'achievement', 'referral', 'event', 'streak', 'quality'
  metadata JSONB, -- Quality breakdown, streak info, earning breakdown, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Achievements tracking
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  achievement_title TEXT,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  mgas_reward INTEGER,
  UNIQUE(user_id, achievement_id)
);

-- Conversion history
CREATE TABLE IF NOT EXISTS mgas_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mgas_converted INTEGER NOT NULL,
  lucid_received DECIMAL(18, 8) NOT NULL,
  conversion_rate INTEGER DEFAULT 100, -- mGas per LUCID
  tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_user ON reward_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_privy ON users(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_mgas_conversions_user ON mgas_conversions(user_id, created_at DESC);

-- Trigger to update users.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update rewards.updated_at
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'User profiles linked to Privy authentication';
COMMENT ON TABLE rewards IS 'User reward balances (mGas and LUCID)';
COMMENT ON TABLE conversations IS 'ChatGPT conversation records with quality metrics';
COMMENT ON TABLE reward_transactions IS 'Audit log of all reward transactions';
COMMENT ON TABLE user_achievements IS 'Unlocked achievements per user';
COMMENT ON TABLE mgas_conversions IS 'History of mGas to LUCID conversions';
