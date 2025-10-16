# 🔗 n8n Integration Guide - Lucid L2

**Date:** October 16, 2025  
**Version:** 1.0  
**Status:** Ready for Deployment

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)

---

## Overview

This guide walks you through integrating **n8n** (workflow automation) with Lucid L2 to enable:

- **Better orchestration** of LLM + Solana pipelines
- **Visual workflow editor** for debugging
- **HMAC-secured** private communication
- **Scalable workflow management**

### What n8n Adds

**Before (Direct Integration):**
```
Browser Extension → Lucid API → llm-proxy → Solana
```

**After (With n8n):**
```
Browser Extension → Lucid API → n8n Gateway (HMAC) → Workflows
                                        ↓
                              ┌─────────┴─────────┐
                        LLM Adapter        Solana Adapter
                              ↓                    ↓
                        llm-proxy            Blockchain
```

### Benefits

✅ **Separation of concerns** - Business logic in workflows, not code  
✅ **Visual debugging** - See execution flow in n8n UI  
✅ **Easy to extend** - Add new adapters by dragging nodes  
✅ **Retry logic** - Built-in error handling and retries  
✅ **Scalability** - Parallel execution, queuing, rate limiting

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────┐
│          Lucid L2 API (Port 3001)               │
│  ┌──────────────────────────────────────────┐   │
│  │     n8nGateway Service                    │   │
│  │  - HMAC signature generation             │   │
│  │  - Workflow execution                    │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                      ↓ HMAC secured
┌─────────────────────────────────────────────────┐
│          n8n (Port 5678 - Private)              │
│  ┌──────────────────────────────────────────┐   │
│  │  Gateway Workflow                        │   │
│  │  1. Verify HMAC signature                │   │
│  │  2. Route by workflow type               │   │
│  │  3. Execute sub-workflows                │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────┐  ┌──────────────────────┐     │
│  │ LLM Adapter  │  │  Solana Adapter      │     │
│  │ - Call proxy │  │  - Write to chain    │     │
│  │ - Normalize  │  │  - Return tx sig     │     │
│  └──────────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────┘
```

### Security

- **HMAC Authentication:** Every API → n8n request is signed
- **Private Network:** n8n only accessible from localhost
- **No Public Exposure:** n8n UI accessed via SSH tunnel or VPN only
- **Encrypted Credentials:** n8n stores secrets with encryption key

---

## Quick Start

### Prerequisites

- ✅ Docker and Docker Compose installed
- ✅ Lucid-L2 API running (port 3001)
- ✅ llm-proxy running (port 8001)
- ✅ Solana wallet configured

### 5-Minute Setup

```bash
# 1. Navigate to n8n directory
cd /home/admin/Lucid/Lucid-L2/n8n

# 2. Generate secrets
openssl rand -hex 32  # For N8N_ENCRYPTION_KEY
openssl rand -hex 32  # For N8N_HMAC_SECRET

# 3. Create .env file
cp .env.example .env
nano .env  # Paste the generated keys

# 4. Start n8n
docker compose up -d

# 5. Check status
docker compose ps
docker compose logs -f n8n

# 6. Access n8n UI
# Open browser: http://localhost:5678
```

**Expected Output:**
```
✅ lucid-n8n          Running   0.0.0.0:5678->5678/tcp
✅ lucid-n8n-postgres Running
✅ lucid-n8n-redis    Running
```

---

## Detailed Setup

### Step 1: Generate Secrets (2 min)

```bash
cd /home/admin/Lucid/Lucid-L2/n8n

# Generate encryption key
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"

# Generate HMAC secret
echo "N8N_HMAC_SECRET=$(openssl rand -hex 32)"

# Generate DB password
echo "DB_PASSWORD=$(openssl rand -base64 16)"
```

**Save these values!** You'll need them for both n8n and Lucid API.

### Step 2: Configure n8n (3 min)

```bash
# Create .env file
cat > .env << 'EOF'
# n8n Basic Auth
N8N_USER=admin
N8N_PASSWORD=YourStrongPassword123!

# Encryption & HMAC (paste values from Step 1)
N8N_ENCRYPTION_KEY=<paste-key-here>
N8N_HMAC_SECRET=<paste-secret-here>

# Database
DB_PASSWORD=<paste-db-password-here>
EOF
```

### Step 3: Start n8n Services (2 min)

```bash
# Start all services
docker compose up -d

# Verify all containers running
docker compose ps

# Check logs
docker compose logs -f n8n
```

**Wait for:**
```
✅ Database migrations completed
✅ n8n ready on port 5678
```

### Step 4: Access n8n UI (2 min)

```bash
# Open browser (on the EC2 server)
http://localhost:5678

# First time setup:
# 1. Create admin account
# 2. Skip email setup (optional)
# 3. You'll see the n8n dashboard
```

### Step 5: Import Workflows (5 min)

**Import Gateway Workflow:**
1. n8n UI → Click "+" → "Import from File"
2. Select: `workflows/gateway.json`
3. Click "Save" → "Activate"

**Import Adapters:**
1. Import `workflows/adapters/llm-proxy-adapter.json`
2. Import `workflows/adapters/solana-write-adapter.json`
3. Activate both workflows

**Verify Webhooks:**
- Gateway: `http://localhost:5678/webhook/lucid-gateway`
- LLM Adapter: `http://localhost:5678/webhook/llm-proxy-adapter`
- Solana Adapter: `http://localhost:5678/webhook/solana-write-adapter`

### Step 6: Configure Lucid API (3 min)

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# Create .env if not exists
touch .env

# Add n8n configuration (use SAME N8N_HMAC_SECRET from Step 1)
cat >> .env << 'EOF'

# n8n Configuration
N8N_ENABLED=true
N8N_URL=http://localhost:5678
N8N_HMAC_SECRET=<paste-same-secret-as-n8n>
EOF
```

### Step 7: Restart Lucid API (1 min)

```bash
# Stop current API (Ctrl+C if running in terminal)

# Start with n8n enabled
npm start

# You should see:
# ✅ n8n Gateway enabled at http://localhost:5678
```

---

## Testing

### Test 1: n8n Health Check

```bash
curl http://localhost:5678/

# Expected: n8n welcome page HTML
```

### Test 2: Workflow Import Verification

```bash
# In n8n UI, check:
# - "Lucid Gateway" workflow exists and is ACTIVE
# - "LLM Proxy Adapter" workflow exists and is ACTIVE
# - "Solana Write Adapter" workflow exists and is ACTIVE
```

### Test 3: End-to-End Pipeline Test

```bash
# Test via Lucid API (which will route through n8n)
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello n8n! This is a test of the orchestration layer."
  }'

# Expected response:
# {
#   "success": true,
#   "content": "AI response...",
#   "hash": "sha256...",
#   "txSignature": "...",
#   "provider": "llmproxy",
#   "model": "openai-gpt35-turbo"
# }
```

### Test 4: Check n8n Execution Logs

1. n8n UI → "Executions" tab
2. You should see 3 executions:
   - ✅ Lucid Gateway (success)
   - ✅ LLM Proxy Adapter (success)
   - ✅ Solana Write Adapter (success)
3. Click each to see detailed logs

### Test 5: Verify Solana Transaction

```bash
# Copy txSignature from response above
# Visit Solana Explorer:
https://explorer.solana.com/tx/<txSignature>?cluster=devnet

# You should see transaction details on-chain
```

---

## Troubleshooting

### Issue 1: n8n Won't Start

**Symptoms:**
```bash
docker compose ps
# Shows: Exit 1 or Restarting
```

**Solutions:**

```bash
# Check logs
docker compose logs n8n

# Common issues:
# 1. Port 5678 already in use
netstat -tulpn | grep 5678
# If busy, stop the conflicting service or change port

# 2. Database connection failed
docker compose logs postgres
# Ensure postgres is healthy

# 3. Missing environment variables
cat .env
# Verify all required vars are set

# Restart fresh
docker compose down
docker compose up -d
```

### Issue 2: HMAC Signature Verification Failed

**Symptoms:**
```
❌ n8n Gateway Error: Invalid HMAC signature
```

**Solutions:**

```bash
# 1. Verify secrets match
# In n8n/.env:
cat n8n/.env | grep N8N_HMAC_SECRET

# In offchain/.env:
cat offchain/.env | grep N8N_HMAC_SECRET

# They MUST be identical!

# 2. Restart both services after changing
cd n8n && docker compose restart n8n
cd ../offchain && npm start
```

### Issue 3: Workflow Not Found

**Symptoms:**
```
404 Not Found: /webhook/lucid-gateway
```

**Solutions:**

1. Check workflow is imported and ACTIVE in n8n UI
2. Verify webhook path matches:
   - Gateway: `lucid-gateway`
   - LLM Adapter: `llm-proxy-adapter`
3. Re-import workflows if needed

### Issue 4: llm-proxy Not Reachable

**Symptoms:**
```
❌ Call LLM Proxy: ECONNREFUSED
```

**Solutions:**

```bash
# 1. Check llm-proxy is running
curl http://localhost:8001/
# Should return: {"status": "online"}

# 2. Verify Docker network config
# n8n uses host.docker.internal to reach host services
# Ensure this is configured in docker-compose.yml:
#   extra_hosts:
#     - "host.docker.internal:host-gateway"

# 3. Test from within n8n container
docker exec -it lucid-n8n curl http://host.docker.internal:8001/
```

### Issue 5: Solana Transaction Fails

**Symptoms:**
```
❌ Solana Write Adapter: Transaction failed
```

**Solutions:**

```bash
# 1. Check Solana CLI configured
solana config get
# Should show: RPC URL: https://api.devnet.solana.com

# 2. Check wallet has SOL
solana balance
# Need at least 0.01 SOL

# 3. Check Lucid API can write to Solana
curl -X POST http://localhost:3001/run -d '{"text":"test"}'
# If this works, n8n → Solana path is OK
```

---

## Advanced Configuration

### Enable n8n in Production

```bash
# offchain/.env
N8N_ENABLED=true  # Set to true
N8N_URL=http://localhost:5678
N8N_HMAC_SECRET=<your-secret>
```

### Add Custom Workflows

1. n8n UI → "+" → "Create new workflow"
2. Add nodes (HTTP Request, Function, etc.)
3. Save and activate
4. Call from Lucid API via `n8nGateway.executeWorkflow()`

### Monitor n8n Performance

```bash
# View execution stats
docker compose exec n8n n8n execute --id <execution-id>

# Database size
docker compose exec postgres psql -U n8n -c "SELECT pg_size_pretty(pg_database_size('n8n'));"

# Redis stats
docker compose exec redis redis-cli INFO stats
```

### Backup n8n Data

```bash
# Backup database
docker compose exec postgres pg_dump -U n8n > n8n_backup_$(date +%Y%m%d).sql

# Backup workflows (JSON export from UI)
# n8n UI → Settings → "Export all workflows"

# Backup docker volumes
docker compose down
sudo tar -czf n8n_volumes_$(date +%Y%m%d).tar.gz \
  /var/lib/docker/volumes/lucid-l2_n8n_data \
  /var/lib/docker/volumes/lucid-l2_postgres_data
docker compose up -d
```

### Scale n8n

For high-volume production:

```yaml
# docker-compose.yml
services:
  n8n:
    deploy:
      replicas: 3  # Multiple instances
    environment:
      - EXECUTIONS_MODE=queue  # Use Redis queue
      - QUEUE_BULL_REDIS_HOST=redis
```

---

## Checklist

### Deployment Checklist

- [ ] Secrets generated (encryption key, HMAC secret, DB password)
- [ ] n8n/.env configured with all secrets
- [ ] Docker containers running (n8n, postgres, redis)
- [ ] n8n UI accessible at http://localhost:5678
- [ ] All 3 workflows imported and activated
- [ ] offchain/.env configured with N8N_ENABLED=true and matching HMAC secret
- [ ] Lucid API restarted with n8n configuration
- [ ] End-to-end test successful (API → n8n → llm-proxy → Solana)
- [ ] n8n execution logs show successful workflows
- [ ] Solana transaction confirmed on explorer

### Verification Tests

```bash
# 1. n8n Running
docker compose ps | grep lucid-n8n

# 2. Workflows Active
curl http://localhost:5678/webhook/test-lucid-gateway

# 3. HMAC Working
curl -X POST http://localhost:3001/run -d '{"text":"test"}'

# 4. Full Pipeline
# Browser Extension → Send message → Check n8n logs → Verify Solana tx
```

---

## Next Steps

Once n8n is working:

1. **Add More Workflows**
   - IPFS upload adapter
   - Multi-model comparison
   - Agent planning workflows

2. **Enable Advanced Features**
   - Conditional routing (IF/THEN logic)
   - Parallel execution (fan-out/fan-in)
   - Retry policies
   - Error notifications

3. **Monitoring**
   - Set up OpenTelemetry for traces
   - Add Prometheus metrics
   - Configure alerts

4. **Scale to Production**
   - Move to AWS ECS/EKS
   - Use RDS for Postgres
   - Add load balancer
   - Enable SSL/TLS

---

## Support & Resources

**Documentation:**
- n8n Docs: https://docs.n8n.io
- This guide: `/home/admin/Lucid/Lucid-L2/N8N-INTEGRATION-GUIDE.md`

**Logs:**
```bash
# n8n logs
docker compose -f n8n/docker-compose.yml logs -f n8n

# Lucid API logs
cd offchain && npm start

# All logs
docker compose -f n8n/docker-compose.yml logs -f
```

**Quick Commands:**
```bash
# Start n8n
cd n8n && docker compose up -d

# Stop n8n
cd n8n && docker compose down

# Restart n8n
cd n8n && docker compose restart

# Reset n8n (WARNING: Deletes data!)
cd n8n && docker compose down -v && docker compose up -d
```

---

**Happy Orchestrating! 🚀**
