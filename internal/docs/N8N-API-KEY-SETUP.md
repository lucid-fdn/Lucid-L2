# 🔑 n8n API Key Setup - Final Step

**Issue:** FlowSpec endpoints need n8n API key to create/list workflows  
**Time:** 3 minutes

---

## 🎯 Create n8n API Key

### Step 1: Generate API Key in n8n UI (2 min)

**In n8n UI (http://54.204.114.86:5678):**

1. Click your **profile icon** (bottom left, shows "BR" or your initials)
2. Select **"Settings"**
3. Go to **"API"** tab (left sidebar in settings)
4. Click **"Create an API Key"** button
5. Give it a name: `lucid-flowspec-service`
6. Click **"Create"**
7. **Copy the API key** (it will only be shown once!)
   - Should look like: `n8n_api_1234567890abcdef...`

### Step 2: Add API Key to Configuration (1 min)

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# Add n8n API key to .env
cat >> .env << 'EOF'

# n8n API Key for FlowSpec
N8N_API_KEY=<paste-your-api-key-here>
EOF

# Edit and paste the actual key
nano .env
# Add the key you copied from n8n UI
```

### Step 3: Restart API (1 min)

```bash
# Stop API (Ctrl+C or)
pkill -f "node.*index"

# Start fresh
npm start
```

---

## 🧪 Test FlowSpec Endpoints

```bash
# Test 1: List workflows
curl http://localhost:3001/flowspec/list

# Expected:
# {"success":true,"count":0,"workflows":[],...}

# Test 2: Run examples
node test-flowspec-examples.js

# Should create 4 workflows successfully
```

---

## ✅ Success Criteria

After adding API key:

- [ ] `curl .../flowspec/list` returns JSON (not error)
- [ ] `test-flowspec-examples.js` creates workflows
- [ ] n8n UI shows new workflows appear
- [ ] All 4 examples execute successfully

---

## 🔍 Where to Find API Key in n8n UI

**n8n UI Navigation:**
```
Profile Icon (bottom left) 
  → Settings
    → API (tab in left sidebar)
      → Create an API Key
        → Copy key
```

**Alternative if can't find:**
```
Click the avatar/icon in bottom left corner
Look for "Settings" or "Personal Settings"
Find "API" section
```

---

## 📝 Complete .env Example

Your `offchain/.env` should have:

```bash
# n8n Configuration
N8N_ENABLED=true
N8N_URL=http://localhost:5678
N8N_HMAC_SECRET=3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4
N8N_API_KEY=n8n_api_YOUR_KEY_HERE

# Other existing config...
```

---

## 🚀 After This Works

You'll have:
- ✅ Fully operational n8n orchestrator
- ✅ FlowSpec DSL for programmatic workflow creation
- ✅ Visual workflow editor
- ✅ API endpoints for workflow management
- ✅ Complete test suite

**This is the final piece - create the API key and everything will work!** 🎉
