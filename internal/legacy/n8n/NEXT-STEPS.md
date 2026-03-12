# 🎯 n8n Next Steps - Import Workflows & Test

**Status:** ✅ n8n UI accessible and license activated!

---

## 📥 Step 1: Import Workflows (5 minutes)

You need to import 3 workflows into n8n:

### 1.1 Import Gateway Workflow

**In n8n UI:**
1. Click the **"+"** button (top right corner)
2. Select **"Import from File"**
3. Click **"Browse"** or drag file
4. Navigate to: `/home/admin/Lucid/Lucid-L2/n8n/workflows/gateway.json`
5. Click **"Open"**
6. Click **"Import"**
7. The workflow will open in the editor
8. Click **"Save"** (top right)
9. Toggle the **"Active"** switch ON (top right)

**You should see:** "Lucid Gateway" workflow with 6 nodes connected.

### 1.2 Import LLM Proxy Adapter

1. Go back to workflows list (click "Workflows" in left sidebar)
2. Click **"+"** → **"Import from File"**
3. Select: `/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/llm-proxy-adapter.json`
4. Import → Save → **Activate**

**You should see:** "LLM Proxy Adapter" workflow with 6 nodes.

### 1.3 Import Solana Write Adapter

1. Same process
2. Select: `/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/solana-write-adapter.json`
3. Import → Save → **Activate**

**You should see:** "Solana Write Adapter" workflow with 6 nodes.

### ✅ Verification

Go to **"Workflows"** tab (left sidebar). You should see:

```
✅ Lucid Gateway              (Active - green indicator)
✅ LLM Proxy Adapter          (Active - green indicator)
✅ Solana Write Adapter       (Active - green indicator)
```

**Important:** All 3 workflows MUST show "Active" status (green).

---

## 🔐 Step 2: Configure Lucid API (3 minutes)

Now configure your Lucid API to use n8n with the HMAC secret:

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# Add n8n configuration to .env
cat >> .env << 'EOF'

# n8n Orchestrator Configuration
N8N_ENABLED=true
N8N_URL=http://localhost:5678
N8N_HMAC_SECRET=3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4
EOF

# Verify it was added
echo ""
echo "✅ n8n configuration added to .env:"
cat .env | grep N8N
```

**Expected output:**
```
N8N_ENABLED=true
N8N_URL=http://localhost:5678
N8N_HMAC_SECRET=3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4
```

---

## 🚀 Step 3: Restart Lucid API (2 minutes)

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# If API is already running, stop it first (Ctrl+C in that terminal)

# Start the API
npm start

# Look for these log lines:
# ✅ "n8n Gateway enabled at http://localhost:5678"
# ✅ "Lucid L2 API listening on http://localhost:3001"
```

**If you see errors:**
- Check that n8n is running: `cd ../n8n && docker compose ps`
- Verify HMAC secret matches in both .env files

---

## 🧪 Step 4: Test End-to-End Pipeline (5 minutes)

### Test 1: Simple API Call

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello n8n! This is a test of the orchestration layer."}'
```

**Expected response (may take 5-10 seconds):**
```json
{
  "success": true,
  "content": "AI generated response...",
  "hash": "sha256_hash_here...",
  "txSignature": "solana_tx_signature...",
  "provider": "llmproxy",
  "model": "openai-gpt35-turbo"
}
```

### Test 2: Check n8n Execution Logs

**In n8n UI:**
1. Click **"Executions"** tab (left sidebar)
2. You should see recent executions:
   - ✅ Lucid Gateway (success)
   - ✅ LLM Proxy Adapter (success)
   - Maybe: Solana Write Adapter (depends on workflow logic)
3. Click on any execution to see detailed logs

**What you'll see:**
- Green checkmarks for successful steps
- Request/response data flowing through
- Timestamps and durations
- Any errors (red X) if something failed

### Test 3: Verify Solana Transaction

```bash
# If your test returned a txSignature, verify it on Solana Explorer
# Copy the txSignature from the response above

# Open in browser:
# https://explorer.solana.com/tx/<txSignature>?cluster=devnet
```

---

## 📊 Understanding the Flow

When you call `/run`, here's what happens:

```
1. Browser/Client → POST /run
              ↓
2. Lucid API → Signs request with HMAC
              ↓
3. n8n Gateway → Verifies HMAC signature
              ↓
4. LLM Proxy Adapter → Calls llm-proxy (port 8001)
              ↓
5. llm-proxy → Eden AI → OpenAI/Claude/etc
              ↓
6. Response flows back through adapters
              ↓
7. (Optional) Solana Adapter → Writes to blockchain
              ↓
8. Final response → Back to client
```

You can see this flow visually in n8n's execution logs!

---

## 🎯 What You Can Do Now

### In n8n UI:

1. **View Executions**
   - See every workflow run
   - Debug failures
   - Monitor performance

2. **Edit Workflows**
   - Click on any workflow
   - Drag and drop nodes
   - Add new logic (conditions, loops, etc.)

3. **Create New Workflows**
   - Click "+"
   - Build custom workflows
   - Call from Lucid API

4. **Test Workflows**
   - Click "Test workflow" button
   - Provide sample data
   - See results immediately

### Example: Adding a New Step

Want to add IPFS upload after LLM response?

1. Open "LLM Proxy Adapter" workflow
2. Click "+" between nodes
3. Search for "HTTP Request" node
4. Configure to call IPFS API
5. Save and activate

No code changes needed!

---

## 🔧 Troubleshooting

### "n8n Gateway not found" error

**Check n8n is running:**
```bash
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose ps
# All 3 containers should be "Up"
```

### "Invalid HMAC signature" error

**HMAC secrets must match:**
```bash
# Check n8n secret:
cat /home/admin/Lucid/Lucid-L2/n8n/.env | grep HMAC

# Check Lucid API secret:
cat /home/admin/Lucid/Lucid-L2/offchain/.env | grep HMAC

# They should be identical!
```

### Workflows not executing

**Check they're activated:**
- n8n UI → Workflows
- All 3 should have green "Active" badge
- If not, click workflow → Toggle "Active" ON

### llm-proxy errors

**Check llm-proxy is running:**
```bash
curl http://localhost:8001/
# Should return: {"status": "online"}

# If not running:
cd /home/admin/Lucid/llm-proxy
docker compose up -d
```

---

## 📚 Quick Commands Reference

```bash
# Check n8n status
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose ps

# View n8n logs
docker compose logs -f n8n

# Restart n8n
docker compose restart n8n

# Check Lucid API is running
curl http://localhost:3001/system/status

# Test the pipeline
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}'

# View API logs
# (in the terminal where npm start is running)
```

---

## ✅ Success Checklist

- [ ] n8n UI accessible at http://54.204.114.86:5678
- [ ] Free license activated
- [ ] 3 workflows imported and active
- [ ] Lucid API configured with N8N_ENABLED=true
- [ ] HMAC secret added to offchain/.env
- [ ] Lucid API restarted
- [ ] Test `/run` endpoint returns success
- [ ] n8n Executions tab shows workflow runs
- [ ] Solana transaction confirmed (if applicable)

---

## 🎉 You're Done!

Once all checkboxes above are ✅, your n8n orchestration layer is fully operational!

**What's Next?**

1. **Explore n8n UI** - Click around, see what nodes are available
2. **Customize workflows** - Add your own logic
3. **Build new workflows** - Create custom automation
4. **Monitor executions** - Track performance and errors
5. **Scale as needed** - n8n handles parallel execution automatically

---

## 📖 Documentation

- **This Guide:** Quick start (you are here)
- **N8N-READY.md:** Configuration reference
- **N8N-INTEGRATION-GUIDE.md:** Complete 60-page manual
- **NETWORK-ACCESS-GUIDE.md:** Security & remote access
- **n8n Official Docs:** https://docs.n8n.io

---

**Need help?** Check the troubleshooting section above or review the logs in n8n UI!
