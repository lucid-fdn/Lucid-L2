# Testing Guide: Backend Reward Integration

## Quick Start Testing

### Step 1: Run Database Migration
```bash
# Connect to your Supabase database
psql -h your-db-host -U postgres -d your-database

# Run the migration
\i Lucid-L2/infrastructure/migrations/20250206_rewards_system.sql

# Verify tables were created
\dt

# Expected output should show:
# - users
# - rewards
# - conversations
# - reward_transactions
# - user_achievements
# - mgas_conversions
```

### Step 2: Configure Environment Variables
```bash
# Edit Lucid-L2/offchain/.env
nano Lucid-L2/offchain/.env

# Add these lines:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### Step 3: Install Dependencies and Start Backend
```bash
cd Lucid-L2/offchain

# Install Supabase client (already done)
npm install @supabase/supabase-js

# Start the backend server
npm run dev

# Expected output:
# ▶️  Lucid L2 API listening on:
#    Local:  http://localhost:3000
#    ...
```

### Step 4: Test API Endpoints

#### Test 1: Health Check
```bash
curl http://localhost:3000/api/rewards/stats

# Expected: System stats with 0 users initially
```

#### Test 2: Process a Conversation
```bash
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "messageType": "user",
    "content": "Explain quantum computing in simple terms with creative metaphors",
    "inputTokens": 50,
    "outputTokens": 200
  }'

# Expected Response:
# {
#   "success": true,
#   "earned": 8-15 (depends on quality),
#   "qualityScore": 0.6-0.9,
#   "qualityTier": "good" or "excellent",
#   "streakDays": 1,
#   "isFirstDaily": true,
#   "newAchievements": [{"id": "first_thought", ...}],
#   "balance": {"mGas": 8-25, "lucid": 0}
# }
```

#### Test 3: Get User Balance
```bash
curl http://localhost:3000/api/rewards/balance/test-user-123

# Expected: User's current rewards and stats
```

#### Test 4: Verify Database
```bash
# In psql:
SELECT * FROM users WHERE privy_user_id = 'test-user-123';
SELECT * FROM rewards WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'test-user-123');
SELECT * FROM conversations WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'test-user-123');
SELECT * FROM reward_transactions WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'test-user-123');
SELECT * FROM user_achievements WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'test-user-123');
```

### Step 5: Test Extension Integration

#### 5a. Load Extension
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `Lucid-L2/browser-extension` folder
6. Extension should load successfully

#### 5b. Authenticate with Privy
1. Click the Lucid extension icon
2. Click "Connect Wallet"
3. Authenticate with Privy (email/wallet)
4. Extension should store `privy_session` with userId
5. Check console: `chrome.storage.local.get(['privy_session'], console.log)`

#### 5c. Test ChatGPT Integration
1. Navigate to https://chat.openai.com
2. Start a conversation
3. Watch browser console for:
   ```
   ✅ Lucid L2 ChatGPT Capture initialized
   💬 [BG] chatgpt_message received: user
   📝 Processing conversation for user <userId>
   ✅ Conversation processed: X mGas earned
   🎉 Rewards updated from backend
   ```

#### 5d. Verify Rewards in Extension
1. Open extension popup
2. Should see:
   - mGas balance updated
   - Streak count
   - Daily progress
   - Recent captures in ChatGPT tab

## Integration Flow Verification

### Flow 1: User Message on ChatGPT
```
1. User types message on ChatGPT ✓
2. Content.js captures message ✓
3. Content.js sends to background.js ✓
4. Background.js gets userId from privy_session ✓
5. Background.js POSTs to /api/rewards/process-conversation ✓
6. Backend calculates quality score ✓
7. Backend awards mGas (5-20 based on quality) ✓
8. Backend stores in database ✓
9. Backend checks achievements ✓
10. Backend returns updated balance ✓
11. Background.js sends 'rewards_updated' message ✓
12. Popup.js receives message and refreshes UI ✓
```

### Flow 2: Popup Opens
```
1. User clicks extension icon ✓
2. Popup loads and checks privy_session ✓
3. If authenticated, calls loadRewardsFromBackend() ✓
4. Fetches GET /api/rewards/balance/:userId ✓
5. Updates UI with backend data ✓
```

### Flow 3: Convert mGas to LUCID
```
1. User clicks "Convert" button ✓
2. Enters amount (minimum 100 mGas) ✓
3. POST to /api/rewards/convert ✓
4. Backend validates balance ✓
5. Backend updates database ✓
6. Backend returns conversion result ✓
7. UI updates with new balances ✓
```

## Quality Score Testing

### Test Different Quality Levels

#### Test 1: Basic Quality (expect 5-6 mGas)
```bash
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-quality",
    "messageType": "user",
    "content": "hi",
    "inputTokens": 5
  }'

# Expected: qualityScore ~0.5, tier: "basic", earned: 5-6 mGas
```

#### Test 2: Good Quality (expect 7-9 mGas)
```bash
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-quality",
    "messageType": "user",
    "content": "I want to learn about machine learning algorithms. Can you explain neural networks with practical examples?",
    "inputTokens": 30
  }'

# Expected: qualityScore ~0.7-0.8, tier: "good", earned: 7-9 mGas
```

#### Test 3: Excellent Quality (expect 10-15 mGas)
```bash
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-quality",
    "messageType": "user",
    "content": "Imagine a world where artificial intelligence could dream. How would we design neural networks that explore creative possibilities beyond their training data, perhaps using metaphors from nature like evolution or symbiotic relationships?",
    "inputTokens": 50
  }'

# Expected: qualityScore ~0.9+, tier: "excellent", earned: 10-15 mGas
```

## Streak Testing

### Test Streak Multipliers
```bash
# Day 1 (no streak bonus)
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{"userId": "streak-test", "messageType": "user", "content": "test day 1", "inputTokens": 10}'

# Day 3 (1.1x multiplier) - need to manually update last_active_date in DB
UPDATE users SET last_active_date = CURRENT_DATE - INTERVAL '2 days', streak_days = 2 WHERE privy_user_id = 'streak-test';

# Then test:
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{"userId": "streak-test", "messageType": "user", "content": "test day 3", "inputTokens": 10}'

# Expected: earnings multiplied by 1.1x
```

## Achievement Testing

### Test "First Thought" Achievement
```bash
# First conversation for new user should unlock "first_thought"
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "achievement-test",
    "messageType": "user",
    "content": "test message",
    "inputTokens": 10
  }'

# Expected: newAchievements array contains first_thought with 10 mGas reward
# Total earned should be base (5-8) + achievement (10) = 15-18 mGas
```

### Verify Achievement in Database
```sql
SELECT ua.*, u.privy_user_id 
FROM user_achievements ua
JOIN users u ON ua.user_id = u.id
WHERE u.privy_user_id = 'achievement-test';

-- Expected: One row with achievement_id = 'first_thought'
```

## Conversion Testing

### Test mGas to LUCID Conversion
```bash
# First, give user some mGas
curl -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "convert-test",
    "messageType": "user",
    "content": "test to get mGas",
    "inputTokens": 10
  }'

# Repeat 20 times to accumulate ~150 mGas, or manually update:
UPDATE rewards SET mgas_balance = 500 WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'convert-test');

# Then convert:
curl -X POST http://localhost:3000/api/rewards/convert \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "convert-test",
    "mGasAmount": 250
  }'

# Expected:
# {
#   "success": true,
#   "lucidReceived": 2,
#   "remainingMGas": 50,
#   "txSignature": "tx_..."
# }
```

### Verify Conversion in Database
```sql
SELECT * FROM mgas_conversions WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'convert-test');
SELECT mgas_balance, lucid_balance FROM rewards WHERE user_id IN (SELECT id FROM users WHERE privy_user_id = 'convert-test');

-- Expected: 
-- mgas_balance reduced by 250
-- lucid_balance increased by 2
-- One row in mgas_conversions
```

## End-to-End Testing with Real Extension

### Test Scenario: New User Journey

#### 1. Fresh Start
```bash
# Clear extension storage
# In browser console (popup):
chrome.storage.local.clear()
```

#### 2. Authenticate
- Click extension icon
- Connect wallet with Privy
- Verify authentication in backend:
  ```bash
  # Check if user was created
  SELECT * FROM users ORDER BY created_at DESC LIMIT 1;
  SELECT * FROM rewards ORDER BY updated_at DESC LIMIT 1;
  ```

#### 3. Use ChatGPT
- Navigate to https://chat.openai.com
- Send message: "Tell me a creative story about AI"
- Watch console logs
- Check extension popup for updated mGas

#### 4. Verify in Database
```sql
-- Check conversations were saved
SELECT c.*, u.privy_user_id 
FROM conversations c
JOIN users u ON c.user_id = u.id
ORDER BY c.created_at DESC
LIMIT 5;

-- Check rewards were awarded
SELECT rt.*, u.privy_user_id 
FROM reward_transactions rt
JOIN users u ON rt.user_id = u.id
ORDER BY rt.created_at DESC
LIMIT 5;
```

#### 5. Test Daily Streak
- Send another message tomorrow
- Verify streak increments
- Check for streak multiplier in earnings

## Common Issues & Solutions

### Issue: "User not found" errors
**Solution**: Ensure Privy session has userId field
```javascript
// Check in browser console:
chrome.storage.local.get(['privy_session'], console.log)
// Should have: { userId: "...", solanaAddress: "..." }
```

### Issue: Rewards not updating in extension
**Solution**: Check background script logs
```javascript
// In extension background page console:
// Should see:
[BG] chatgpt_message received: user
📝 Processing conversation for user...
✅ Conversation processed: X mGas earned
```

### Issue: Database connection errors
**Solution**: Verify environment variables
```bash
cd Lucid-L2/offchain
cat .env | grep SUPABASE

# Should show:
# SUPABASE_URL=https://...
# SUPABASE_SERVICE_KEY=...
```

### Issue: Quality scores seem wrong
**Solution**: Review message content
- Basic (0-0.5): Very short, simple messages
- Average (0.5-0.7): Normal questions
- Good (0.7-0.9): Complex, well-formed questions
- Excellent (0.9+): Creative, unique, complex questions with metaphors

## Performance Testing

### Load Test: Multiple Users
```bash
# Test concurrent conversation processing
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/rewards/process-conversation \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"load-test-user-$i\", \"messageType\": \"user\", \"content\": \"test message $i\", \"inputTokens\": 10}" &
done
wait

# Check database:
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM conversations;
SELECT SUM(mgas_balance) FROM rewards;
```

### Stress Test: High Volume
```bash
# Simulate 100 messages from one user
USER_ID="stress-test-user"
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/rewards/process-conversation \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"messageType\": \"user\", \"content\": \"message $i with some complexity and creativity\", \"inputTokens\": 15}"
  sleep 0.1
done

# Verify:
curl http://localhost:3000/api/rewards/balance/$USER_ID

# Expected: 500-1000+ mGas depending on quality scores
```

## Browser Extension Testing

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Can authenticate with Privy
- [ ] userId stored in chrome.storage
- [ ] ChatGPT messages captured
- [ ] Backend processes messages
- [ ] Rewards update in popup
- [ ] Streak increments daily
- [ ] Achievements unlock
- [ ] Conversion works (100 mGas → 1 LUCID)
- [ ] History tab shows captures
- [ ] Stats display correctly

### Console Log Verification

**Content Script (ChatGPT page):**
```
✅ Lucid L2 ChatGPT Capture initialized
✅ Starting ChatGPT conversation capture
✅ ChatGPT conversation capture is active
✅ Captured X messages
```

**Background Script:**
```
🚀 Background script loaded
[BG] chatgpt_message received: user
📝 Processing conversation for user...
✅ Conversation processed: X mGas earned
```

**Popup:**
```
📊 Fetching rewards from backend...
✅ Backend rewards loaded: {...}
🎉 Rewards updated from backend
```

## Production Deployment Checklist

### Backend
- [ ] Database migration applied to production DB
- [ ] Environment variables configured
- [ ] Backend server deployed and running
- [ ] CORS configured for extension origin
- [ ] Rate limiting enabled
- [ ] Monitoring/logging active
- [ ] Backup strategy in place

### Extension
- [ ] Built with production API URL
- [ ] Tested on all supported browsers
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] Version number incremented
- [ ] Submitted to Chrome Web Store

### Database
- [ ] Indexes verified (run EXPLAIN ANALYZE)
- [ ] Backup schedule configured
- [ ] Monitoring alerts set up
- [ ] Connection pooling optimized
- [ ] Query performance validated

## Monitoring

### Key Metrics to Track

1. **User Metrics**
   - New users per day
   - Active users (daily/weekly/monthly)
   - Average streak length
   - Retention rate

2. **Reward Metrics**
   - Total mGas distributed
   - Average earnings per user
   - Quality score distribution
   - Conversion rate (mGas → LUCID)

3. **System Metrics**
   - API response times
   - Database query performance
   - Error rates
   - Message processing throughput

### Sample Monitoring Queries

```sql
-- Active users today
SELECT COUNT(DISTINCT user_id) 
FROM conversations 
WHERE created_at >= CURRENT_DATE;

-- mGas distribution stats
SELECT 
  AVG(mgas_balance) as avg_balance,
  MAX(mgas_balance) as max_balance,
  SUM(mgas_balance) as total_in_circulation,
  SUM(lifetime_mgas_earned) as total_earned
FROM rewards;

-- Quality score distribution
SELECT 
  quality_tier,
  COUNT(*) as count,
  AVG(quality_score) as avg_score
FROM conversations
WHERE quality_tier IS NOT NULL
GROUP BY quality_tier
ORDER BY count DESC;

-- Top users by earnings
SELECT 
  u.privy_user_id,
  u.wallet_address,
  r.mgas_balance,
  r.lifetime_mgas_earned,
  u.streak_days,
  u.total_thoughts_processed
FROM users u
JOIN rewards r ON u.id = r.user_id
ORDER BY r.lifetime_mgas_earned DESC
LIMIT 10;
```

## Troubleshooting

### Debug Mode

Enable detailed logging:
```javascript
// In background.js, add at top:
const DEBUG = true;

// Then wrap console.logs:
if (DEBUG) console.log('...');
```

### Database Debug

Check for orphaned records:
```sql
-- Users without rewards
SELECT u.* FROM users u
LEFT JOIN rewards r ON u.id = r.user_id
WHERE r.id IS NULL;

-- Should be 0 (auto-created with user)
```

### API Debug

Test with verbose curl:
```bash
curl -v -X POST http://localhost:3000/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{"userId": "debug-test", "messageType": "user", "content": "test", "inputTokens": 10}' \
  2>&1 | grep -E "HTTP|success|error"
```

## Success Criteria

✅ **Backend Integration Complete When:**
1. All API endpoints return 200 with valid data
2. Database tables populated correctly
3. Quality scores calculate accurately
4. Achievements unlock at correct thresholds
5. Conversion math is correct (100 mGas = 1 LUCID)

✅ **Extension Integration Complete When:**
1. ChatGPT messages captured and sent to backend
2. Popup displays backend rewards (not local storage)
3. Real-time updates work (rewards_updated message)
4. Authentication flow seamless
5. No console errors in any component

## Next Steps After Testing

1. **Monitor initial users** - Watch for any unexpected behavior
2. **Gather feedback** - User experience, reward fairness
3. **Optimize** - Database queries, API response times
4. **Enhance** - Add more achievements, events, features
5. **Scale** - Prepare for increased load

---

**Status**: ✅ Ready for Testing | Document version: 1.0 | Last updated: 2025-02-06
