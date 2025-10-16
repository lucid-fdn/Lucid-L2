# n8n Orchestration Layer - Lucid L2

This directory contains the n8n workflow automation setup for Lucid L2.

## 🚀 Quick Start

```bash
# 1. Generate secrets
openssl rand -hex 32  # Save for N8N_ENCRYPTION_KEY
openssl rand -hex 32  # Save for N8N_HMAC_SECRET

# 2. Configure environment
cp .env.example .env
nano .env  # Paste generated secrets

# 3. Start n8n
docker compose up -d

# 4. Access UI
# http://localhost:5678
```

## 📁 Directory Structure

```
n8n/
├── docker-compose.yml          # Docker services (n8n, postgres, redis)
├── .env.example                # Environment template
├── .env                        # Your secrets (create this, not in git)
├── README.md                   # This file
└── workflows/                  # Importable n8n workflows
    ├── gateway.json            # Main entry point (HMAC verification)
    └── adapters/
        ├── llm-proxy-adapter.json    # LLM inference workflow
        └── solana-write-adapter.json # Blockchain write workflow
```

## 🔐 Required Secrets

Generate these values and add to `.env`:

```bash
# Generate encryption key (for n8n credential storage)
openssl rand -hex 32

# Generate HMAC secret (for API authentication)
openssl rand -hex 32

# Generate database password
openssl rand -base64 16
```

**IMPORTANT:** The `N8N_HMAC_SECRET` must match the same value in `offchain/.env`!

## 📊 Services

### n8n (Port 5678)
- **Workflow orchestrator**
- Web UI for visual workflow editing
- Webhook endpoints for Lucid API
- Stores workflows in Postgres

### PostgreSQL (Internal)
- Stores n8n workflows and execution history
- Volume: `postgres_data`

### Redis (Internal)
- Queue for async workflow execution
- Volume: `redis_data`

## 🔌 Workflow Endpoints

After importing workflows, these webhooks are available:

| Workflow | Webhook URL | Purpose |
|----------|-------------|---------|
| Lucid Gateway | `http://localhost:5678/webhook/lucid-gateway` | Main entry point |
| LLM Adapter | `http://localhost:5678/webhook/llm-proxy-adapter` | Call llm-proxy |
| Solana Adapter | `http://localhost:5678/webhook/solana-write-adapter` | Write to blockchain |

## 📝 Workflow Import Instructions

1. Start n8n: `docker compose up -d`
2. Open UI: http://localhost:5678
3. Create admin account (first time only)
4. Import workflows:
   - Click "+" → "Import from File"
   - Select `workflows/gateway.json`
   - Click "Save" → "Activate"
   - Repeat for adapter workflows

## 🧪 Testing

```bash
# Health check
curl http://localhost:5678/

# Test gateway (should fail without HMAC signature)
curl -X POST http://localhost:5678/webhook/lucid-gateway \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test via Lucid API (with HMAC - requires N8N_ENABLED=true in offchain/.env)
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Test n8n integration"}'
```

## 🔧 Common Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f n8n

# Stop services
docker compose down

# Restart n8n only
docker compose restart n8n

# Check status
docker compose ps

# Execute shell in n8n container
docker compose exec n8n sh

# Backup database
docker compose exec postgres pg_dump -U n8n > backup.sql

# Reset everything (WARNING: Deletes data!)
docker compose down -v
```

## 📊 Monitoring

```bash
# View execution logs in n8n UI
# → Open http://localhost:5678
# → Click "Executions" tab

# Database size
docker compose exec postgres psql -U n8n -c \
  "SELECT pg_size_pretty(pg_database_size('n8n'));"

# Container resource usage
docker stats lucid-n8n lucid-n8n-postgres lucid-n8n-redis
```

## 🛠️ Troubleshooting

### n8n won't start
```bash
# Check logs
docker compose logs n8n

# Common issues:
# - Port 5678 in use: Change port in docker-compose.yml
# - Missing .env: Copy from .env.example
# - Invalid secrets: Regenerate with openssl
```

### Workflows not found (404)
```bash
# 1. Check workflows are imported and ACTIVE in n8n UI
# 2. Verify webhook IDs match in JSON files
# 3. Restart n8n: docker compose restart n8n
```

### HMAC signature errors
```bash
# Ensure secrets match:
cat n8n/.env | grep N8N_HMAC_SECRET
cat offchain/.env | grep N8N_HMAC_SECRET
# These MUST be identical!
```

### Can't reach llm-proxy or Solana API
```bash
# n8n uses host.docker.internal to reach host services
# Verify in docker-compose.yml:
#   extra_hosts:
#     - "host.docker.internal:host-gateway"

# Test from inside container:
docker compose exec n8n curl http://host.docker.internal:8001/
docker compose exec n8n curl http://host.docker.internal:3001/system/status
```

## 🔒 Security Notes

- **Never expose n8n publicly** - Keep on localhost only
- **Use strong passwords** - Generate with `openssl rand -base64 32`
- **Rotate secrets regularly** - Especially in production
- **Backup workflows** - Export from n8n UI regularly
- **Monitor logs** - Check for suspicious activity

## 📚 Documentation

- **Full Integration Guide:** `../N8N-INTEGRATION-GUIDE.md`
- **n8n Official Docs:** https://docs.n8n.io
- **Docker Compose Docs:** https://docs.docker.com/compose/

## 🚦 Status Indicators

After starting, verify:

```bash
✅ docker compose ps shows all services "Running"
✅ curl http://localhost:5678/ returns HTML (n8n UI)
✅ n8n UI accessible in browser at http://localhost:5678
✅ 3 workflows imported and ACTIVE in n8n UI
✅ offchain/.env has N8N_ENABLED=true and matching HMAC secret
✅ Lucid API logs show: "✅ n8n Gateway enabled"
```

## 🎯 Next Steps

1. **Import workflows** (see instructions above)
2. **Configure Lucid API** to use n8n (`offchain/.env`)
3. **Test end-to-end** (Browser Extension → API → n8n → Solana)
4. **Add custom workflows** (n8n UI → Create new)
5. **Monitor executions** (n8n UI → Executions tab)

---

For detailed setup instructions, see: `../N8N-INTEGRATION-GUIDE.md`
