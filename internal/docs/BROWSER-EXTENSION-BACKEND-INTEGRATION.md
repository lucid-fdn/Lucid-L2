# Browser Extension Backend Integration Guide

## Overview
This document describes the complete backend integration for the Lucid L2 browser extension, connecting Privy-authenticated users with the reward system.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ChatGPT / Web Pages                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Browser Extension                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Content.js   │→ │ Background.js│→ │  Popup.js    │         │
│  │ (Captures)   │  │  (API calls) │  │  (Display)   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                Backend API (Express/TypeScript)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/rewards/process-conversation                  │  │
│  │  GET  /api/rewards/balance/:userId                       │  │
│  │  GET  /api/rewards/history/:userId                       │  │
│  │  POST /api/rewards/convert                               │  │
│  │  POST /api/rewards/sync                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Reward Service (TypeScript)                    │
│  • Quality Assessment (creativity, complexity, coherence)       │
│  • Earnings Calculation (base + quality + streak + time)        │
│  • Achievement Tracking                                         │
│  • Conversion (mGas → LUCID)                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Supabase PostgreSQL Database                    │
│  • users (Privy userIds, streaks, stats)                       │
│  • rewards (mGas & LUCID balances)                             │
│  • conversations (captured messages with quality scores)        │
│  • reward_transactions (audit log)                             │
│  • user_achievements (unlocked achievements)                   │
│  • mgas_conversions (conversion history)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables Created (migration: `20250206_rewards_system.sql`)

1. **users** - User profiles linked to Privy
   - privy_user_id (unique)
   - wallet_address
   - streak_days
   - last_active_date
   - total_thoughts_processed
   - total_shares

2. **rewards** - User balances
   - mgas_balance
   - lucid_balance
   - lifetime_mgas_earned
   - lifetime_lucid_earned

3. **conversations** - ChatGPT captures
   - message_type (user/assistant)
   - content
   - input_tokens, output_tokens
   - quality_score, quality_tier
   - quality_breakdown (JSONB)

4. **reward_transactions** - Audit log
   - transaction_type (earn/convert/achievement/bonus)
   - mgas_amount, lucid_amount
   - source, metadata (JSONB)

5. **user_achievements** - Achievement tracking
   - achievement_id, achievement_title
   - mgas_reward
   - unlocked_at

6. **mgas_conversions** - Conversion history
   - mgas_converted, lucid_received
   - conversion_rate, tx_signature

## API Endpoints

### Conversation Processing
```http
POST /api/rewards/process-conversation
Content-Type: application/json

{
  "userId": "privy-user-id",
  "messageType": "user",
  "content": "Tell me about quantum computing",
  "inputTokens": 50,
  "outputTokens": 200
}

Response:
{
  "success": true,
  "earned": 8,
  "qualityScore": 0.75,
  "qualityTier": "good",
  "streakDays": 5,
  "isFirstDaily": false,
  "newAchievements": [],
  "balance": {
    "mGas": 1250,
    "lucid": 2.5
  }
}
```

### Get User Rewards
```http
GET /api/rewards/balance/:userId

Response:
{
  "success": true,
  "rewards": {
    "userId": "privy-user-id",
    "balance": { "mGas": 1250, "lucid": 2.5 },
    "lifetime": { "mGas": 5000, "lucid": 10.0 },
    "streakDays": 5,
    "totalThoughts": 42,
    "achievements": [...],
    "lastActive": "2025-02-06"
  }
}
```

### Sync State
```http
POST /api/rewards/sync
Content-Type: application/json

{
  "userId": "privy-user-id"
}

Response:
{
  "success": true,
  "sync": {
    "timestamp": "2025-02-06T17:00:00Z",
    "rewards": {...},
    "recentHistory": [...]
  }
}
```

### Convert mGas to LUCID
```http
POST /api/rewards/convert
Content-Type: application/json

{
  "userId": "privy-user-id",
  "mGasAmount": 500
}

Response:
{
  "success": true,
  "lucidReceived": 5,
  "remainingMGas": 0,
  "txSignature": "tx_1234567890_abc123"
}
```

## Reward Calculation Logic

### Quality Assessment
Evaluates 5 metrics (0.0 - 1.0 each):
1. **Creativity** (25% weight) - Creative words, imagination
2. **Complexity** (20% weight) - Sentence length, word complexity
3. **Coherence** (20% weight) - Transition words, logical flow
4. **Uniqueness** (20% weight) - Different from recent messages
5. **AI Engagement** (15% weight) - Quality of AI response

**Quality Tiers:**
- Excellent: ≥0.9 (50% bonus)
- Good: ≥0.7 (30% bonus)
- Average: ≥0.5 (10% bonus)
- Basic: <0.5 (no bonus)

### Earnings Formula
```
Base Reward: 5 mGas

Earnings = (Base + Quality Bonus) × Streak Multiplier × Time Bonus + First Daily Bonus

Where:
- Quality Bonus = Base × Quality Tier Multiplier
- Streak Multiplier: 
  * 3 days → 1.1x
  * 7 days → 1.25x
  * 14 days → 1.5x
  * 30 days → 2.0x
- Time Bonus: 1.1x during peak hours (9-11 AM, 2-4 PM, 7-9 PM)
- First Daily: +5 mGas
```

### Example Calculation
```
User with 7-day streak, good quality (0.75), peak hours, first daily:

Base: 5 mGas
Quality Bonus: 5 × 0.3 = 1.5 mGas
Subtotal: 6.5 mGas
Streak: 6.5 × 1.25 = 8.125 mGas
Time: 8.125 × 1.1 = 8.9375 mGas
First Daily: 8.9375 + 5 = 13.9375 mGas
Final: 14 mGas (rounded)
```

## Extension Integration Flow

### 1. User Authentication (existing)
```javascript
// Already implemented with Privy
User → Privy Auth → Extension stores userId
```

### 2. Message Capture (content.js)
```javascript
// Capture ChatGPT conversations
chatGptObserver.observe(chatContainer, {
  childList: true,
  subtree: true
});

// On new message:
chrome.runtime.sendMessage({
  type: 'chatgpt_message',
  data: {
    messageType: 'user', // or 'assistant'
    content: messageContent,
    timestamp: Date.now()
  }
});
```

### 3. Backend Processing (background.js)
```javascript
// New message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'chatgpt_message') {
    // Get Privy userId from storage
    chrome.storage.local.get(['privy_session'], async (result) => {
      const userId = result.privy_session?.userId;
      
      // Send to backend
      const response = await fetch('https://api.lucid.foundation/api/rewards/process-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          messageType: msg.data.messageType,
          content: msg.data.content,
          inputTokens: msg.data.inputTokens,
          outputTokens: msg.data.outputTokens
        })
      });
      
      const data = await response.json();
      
      // Update extension state
      if (data.success) {
        // Notify popup to refresh
        chrome.runtime.sendMessage({
          type: 'rewards_updated',
          data: data.balance
        });
      }
    });
  }
});
```

### 4. UI Display (popup.js)
```javascript
// On popup load, fetch from backend
async function loadRewards() {
  const { privy_session } = await chrome.storage.local.get(['privy_session']);
  const userId = privy_session?.userId;
  
  const response = await fetch(`https://api.lucid.foundation/api/rewards/balance/${userId}`);
  const data = await response.json();
  
  if (data.success) {
    // Update UI
    document.getElementById('mGasBalance').textContent = data.rewards.balance.mGas;
    document.getElementById('lucidBalance').textContent = data.rewards.balance.lucid;
    document.getElementById('streakDays').textContent = data.rewards.streakDays;
  }
}

// Listen for updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'rewards_updated') {
    loadRewards(); // Refresh display
  }
});
```

## Achievements System

### Built-in Achievements
1. **First Thought** - Process first AI thought (10 mGas)
2. **Creative Writer** - 10 excellent quality scores (50 mGas)
3. **Streak Master** - 7-day streak (100 mGas)
4. **Token Converter** - Convert mGas 5 times (25 mGas)
5. **Social Butterfly** - Share 20 responses (30 mGas)
6. **Quality Guru** - Average quality >0.8 (75 mGas)

Achievements are automatically checked after each conversation is processed.

## Conversion System

**Rate:** 100 mGas = 1 LUCID

**Process:**
1. User requests conversion (minimum 100 mGas)
2. Backend validates balance
3. Calculates LUCID amount = floor(mGas / 100)
4. Simulates blockchain transaction
5. Updates both balances
6. Records in conversion history
7. Creates audit transaction

## Environment Variables Required

```bash
# Supabase (Database)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Backend API
API_PORT=3000
```

## Testing

### 1. Database Setup
```bash
# Run migration
psql -d your_database -f Lucid-L2/infrastructure/migrations/20250206_rewards_system.sql
```

### 2. Backend Start
```bash
cd Lucid-L2/offchain
npm install @supabase/supabase-js
npm run dev
```

### 3. Extension Testing
1. Load extension in Chrome
2. Authenticate with Privy
3. Visit ChatGPT
4. Send a message
5. Check popup for updated rewards

### 4. API Testing
```bash
# Test conversation processing
curl -X POST https://api.lucid.foundation/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "messageType": "user",
    "content": "Explain quantum computing",
    "inputTokens": 20,
    "outputTokens": 100
  }'

# Test balance query
curl https://api.lucid.foundation/api/rewards/balance/test-user
```

## Security Considerations

1. **Authentication**: All endpoints expect Privy userId - validate server-side
2. **Rate Limiting**: Implement rate limits on API endpoints
3. **Input Validation**: All user inputs are validated and sanitized
4. **SQL Injection**: Using parameterized queries via Supabase client
5. **CORS**: Backend allows extension origin only

## Performance Optimizations

1. **Caching**: Store rewards in extension local storage, sync periodically
2. **Batch Processing**: Group multiple conversations for DB insertion
3. **Indexed Queries**: All database queries use indexed columns
4. **Connection Pooling**: Supabase handles connection management
5. **Async Processing**: Reward calculations don't block UI

## Future Enhancements

1. **Real Blockchain Integration**: Replace simulated transactions
2. **Social Features**: User leaderboards, referral system
3. **Advanced Analytics**: Detailed quality breakdowns, trends
4. **Event System**: Seasonal events, double rewards periods
5. **NFT Achievements**: Mint achievements as NFTs
6. **Multi-chain Support**: Ethereum, Polygon, etc.

## Troubleshooting

### Extension not connecting to backend
- Check CORS settings in backend
- Verify API URL in extension
- Check browser console for errors

### Rewards not updating
- Verify Privy session is active
- Check backend logs for errors
- Verify database migrations ran successfully

### Quality scores seem incorrect
- Review quality assessment weights
- Check for edge cases in text processing
- Verify calculations match expected formula

## Support

For issues or questions:
1. Check backend logs: `docker logs lucid-offchain` (if dockerized)
2. Check extension console
3. Review database state in Supabase dashboard
4. Contact development team

---

**Status**: ✅ Backend Complete | 🔄 Extension Updates Pending | ⏳ Testing Required
