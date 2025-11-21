# Deployment Guide: Reward System to Production

## Current Status

✅ **Code Complete**: All backend and extension code implemented
✅ **Database Ready**: Migration exists and tables are created
✅ **Extension Configured**: Using `http://13.221.253.195:3001`
⚠️  **Backend Needs Restart**: Production server needs updated code deployed

## Quick Deployment (Production Server: 13.221.253.195)

### Step 1: Deploy Updated Code to Production

On the production server (13.221.253.195):

```bash
# SSH into production server
ssh admin@13.221.253.195

cd /home/admin/Lucid/Lucid-L2

# Pull latest changes from repository
git pull origin main

# Install new dependencies
cd offchain
npm install pg @types/pg

# Rebuild TypeScript
npm run build
```

### Step 2: Verify Environment Variables

Ensure `.env` has PostgreSQL credentials:

```bash
cat offchain/.env

# Should include:
# POSTGRES_PASSWORD=your-postgres-password
# OR
# SUPABASE_DB_PASSWORD=your-supabase-db-password
```

If missing, add to `.env`:
```bash
echo "POSTGRES_PASSWORD=your-actual-password" >> offchain/.env
```

### Step 3: Restart Backend

```bash
# If using PM2:
pm2 restart lucid-backend

# If using systemd:
sudo systemctl restart lucid-backend

# If running manually:
# Kill existing process and restart:
pkill -f "node.*offchain"
cd offchain && npm run dev
```

### Step 4: Verify Deployment

```bash
# Test the reward API from anywhere:
curl -X POST http://13.221.253.195:3001/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-deployment",
    "messageType": "user", 
    "content": "Test quantum computing with creative metaphors",
    "inputTokens": 50
  }'

# Expected successful response:
# {
#   "success": true,
#   "earned": 10-15,
#   "qualityScore": 0.7-0.9,
#   "qualityTier": "good" or "excellent",
#   "streakDays": 1,
#   "isFirstDaily": true,
#   "newAchievements": [...],
#   "balance": {"mGas": 20-25, "lucid": 0}
# }
```

### Step 5: Test Extension Integration

1. Load extension in Chrome (`chrome://extensions/`)
2. Authenticate with Privy
3. Visit https://chat.openai.com
4. Send a message
5. Open extension popup → See rewards!

## What Changed

### Backend Changes
- `offchain/src/services/rewardService.ts` - Now uses direct PostgreSQL connection
- `offchain/src/routes/rewardRoutes.ts` - Updated to use PostgreSQL
- `offchain/src/services/api.ts` - Mounted `/api/rewards` routes
- New dependency: `pg` and `@types/pg`

### Extension Changes
- `background.js` - Backend URL: `http://13.221.253.195:3001`
- `popup.js` - Backend URL: `http://13.221.253.195:3001`
- `content.js` - Backend URL: `http://13.221.253.195:3001`
- `manifest.json` - Added permission for backend IP

## Database Configuration

The reward service uses these environment variables (in priority order):

```bash
POSTGRES_PASSWORD=xxx        # Preferred
SUPABASE_DB_PASSWORD=xxx     # Fallback (from your existing .env)

# Optional (defaults shown):
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
```

## Troubleshooting

### Issue: "client password must be a string"
**Cause**: Backend hasn't been restarted with updated code  
**Solution**: Restart backend on production server

### Issue: "Connection refused"
**Cause**: Backend not running  
**Solution**: Start/restart backend service

### Issue: Still getting Supabase errors
**Cause**: Old code still running  
**Solution**: Force kill and restart:
```bash
pkill -9 -f "node.*offchain"
cd offchain && npm run build && npm start
```

### Issue: Tables don't exist
**Cause**: Migration not run  
**Solution**:
```bash
cd infrastructure/scripts
./run-reward-migration.sh
```

## Verification Checklist

After deployment, verify:

- [ ] Backend responds to `/api/rewards/stats`
- [ ] Can process test conversation
- [ ] User created in database
- [ ] Rewards awarded correctly
- [ ] Extension can connect
- [ ] ChatGPT messages processed
- [ ] Popup shows backend rewards

## Quick Test Script

Save as `test-reward-deployment.sh`:

```bash
#!/bin/bash
BACKEND="http://13.221.253.195:3001"

echo "🧪 Testing Reward System Deployment..."

# Test 1: Stats endpoint
echo "1. Testing stats endpoint..."
curl -s $BACKEND/api/rewards/stats | jq .

# Test 2: Process conversation
echo "2. Processing test conversation..."
curl -s -X POST $BACKEND/api/rewards/process-conversation \
  -H "Content-Type: application/json" \
  -d '{"userId":"deploy-test","messageType":"user","content":"creative quantum test","inputTokens":20}' | jq .

# Test 3: Get balance
echo "3. Getting user balance..."
curl -s $BACKEND/api/rewards/balance/deploy-test | jq .

echo "✅ Deployment test complete!"
```

## Production Checklist

- [ ] Code deployed to production server
- [ ] Dependencies installed (`pg`, `@types/pg`)
- [ ] Environment variables configured
- [ ] Database migration run
- [ ] Backend restarted/rebuilt
- [ ] API endpoints tested
- [ ] Extension tested end-to-end
- [ ] Monitoring enabled
- [ ] Backup strategy in place

## Next Steps After Deployment

1. **Monitor logs** for any errors
2. **Track user activity** in database
3. **Verify quality scores** are calculating correctly
4. **Test achievements** unlock properly
5. **Monitor performance** under load

---

**Status**: Code Complete ✅ | Awaiting Production Deployment 🚀  
**Contact**: Check backend logs for any issues after restart
