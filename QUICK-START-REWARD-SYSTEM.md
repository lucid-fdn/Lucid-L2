# Quick Start: Reward System Integration

## 🚀 3-Step Setup (Using Your Docker Infrastructure)

### Step 1: Start Supabase Database (if not running)
```bash
cd Lucid-L2/infrastructure
docker-compose up -d supabase-db

# Wait for database to be ready
docker exec lucid-supabase-db pg_isready -U postgres
```

### Step 2: Run the Migration
```bash
cd Lucid-L2/infrastructure/scripts
./run-reward-migration.sh
```

This will:
- ✅ Verify Supabase container is running
- ✅ Execute the SQL migration
- ✅ Create 6 tables (users, rewards, conversations, etc.)
- ✅ Set up indexes and triggers
- ✅ Verify all tables were created

### Step 3: Configure and Start Backend
```bash
cd Lucid-L2/offchain

# Ensure environment variables are set (should already be in .env)
# SUPABASE_URL and SUPABASE_SERVICE_KEY are auto-configured for Docker setup

# Start the backend
npm run dev
```

## ✅ Verify Setup

### Test 1: Check Database Tables
```bash
docker exec -i lucid-supabase-db psql -U postgres -d postgres -c "\dt"

# Should show:
# - users
# - rewards
# - conversations
# - reward_transactions
# - user_achievements
# - mgas_conversions
```

### Test 2: Test API Endpoint
```bash
curl http://localhost:3000/api/rewards/stats

# Expected:
# {
#   "success": true,
#   "stats": {
#     "totalUsers": 0,
#     "totalConversations": 0,
#     ...
#   }
# }
```

### Test 3: Process Test Conversation
```bash
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "messageType": "user",
    "content": "Tell me about quantum computing with creative metaphors",
    "inputTokens": 50
  }'

# Expected: success with earned mGas (8-15)
```

### Test 4: Get User Balance
```bash
curl http://localhost:3000/api/rewards/balance/test-user

# Expected: User's balance and stats
```

## 🎮 Test with Browser Extension

### 1. Load Extension
```
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select: Lucid-L2/browser-extension
```

### 2. Authenticate
```
1. Click extension icon
2. Click "Connect Wallet"
3. Authenticate with Privy
4. Verify userId stored:
   - Open DevTools Console
   - Run: chrome.storage.local.get(['privy_session'], console.log)
   - Should show: { userId: "...", solanaAddress: "..." }
```

### 3. Test ChatGPT Integration
```
1. Navigate to https://chat.openai.com
2. Send a message
3. Watch browser console for logs:
   ✅ Lucid L2 ChatGPT Capture initialized
   [BG] chatgpt_message received: user
   📝 Processing conversation for user...
   ✅ Conversation processed: X mGas earned
4. Open extension popup
5. Verify rewards updated
```

## 📊 Monitor in Database

### View User Activity
```bash
# Connect to database
docker exec -it lucid-supabase-db psql -U postgres -d postgres

# Check users
SELECT privy_user_id, wallet_address, streak_days, total_thoughts_processed FROM users;

# Check rewards
SELECT u.privy_user_id, r.mgas_balance, r.lucid_balance, r.lifetime_mgas_earned
FROM rewards r
JOIN users u ON r.user_id = u.id;

# Check recent conversations
SELECT u.privy_user_id, c.message_type, c.quality_tier, c.created_at
FROM conversations c
JOIN users u ON c.user_id = u.id
ORDER BY c.created_at DESC
LIMIT 10;
```

## 🐛 Troubleshooting

### Database Not Running
```bash
cd Lucid-L2/infrastructure
docker-compose up -d supabase-db
docker-compose logs supabase-db
```

### Migration Failed
```bash
# Check error in migration script output
# Run manually if needed:
docker exec -i lucid-supabase-db psql -U postgres -d postgres < infrastructure/migrations/20250206_rewards_system.sql
```

### Backend Not Connecting
```bash
# Check .env has correct values
cat offchain/.env | grep SUPABASE

# For Docker setup, should be:
# SUPABASE_URL=http://localhost:8000 (or your Kong gateway)
# SUPABASE_SERVICE_KEY=<your-service-key>
```

### Extension Not Earning Rewards
```bash
# 1. Check Privy session
#    In browser console: chrome.storage.local.get(['privy_session'], console.log)

# 2. Check backend logs
#    Should show: "Processing conversation for user..."

# 3. Check database
#    docker exec -i lucid-supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM conversations;"
```

## 📚 Full Documentation

- **BROWSER-EXTENSION-BACKEND-INTEGRATION.md** - Complete architecture
- **TESTING-BACKEND-REWARD-INTEGRATION.md** - Comprehensive testing
- **REWARD-BACKEND-IMPLEMENTATION-COMPLETE.md** - Implementation summary

## 🎉 That's It!

Your reward system is now fully integrated:
- ✅ Backend processing ChatGPT conversations
- ✅ Quality-based mGas rewards (5-20 per message)
- ✅ Streak system (up to 2x multiplier)
- ✅ Achievement system (6 achievements)
- ✅ Conversion system (100 mGas = 1 LUCID)
- ✅ Real-time extension updates
- ✅ Complete audit trail in database

Start chatting on ChatGPT and watch the rewards come in! 🚀
