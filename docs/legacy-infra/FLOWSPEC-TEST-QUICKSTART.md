# FlowSpec Testing - Quick Start

**Get your FlowSpec routes tested in under 5 minutes!**

## 🚀 One-Command Setup

```bash
# From Lucid-L2/offchain directory
chmod +x test-flowspec.js && node test-flowspec.js
```

## ✅ Prerequisites Checklist

Before running tests, ensure:

- [ ] **n8n is running**
  ```bash
  docker ps | grep n8n
  # If not running: cd ../n8n && docker-compose up -d
  ```

- [ ] **API server is running**
  ```bash
  # In another terminal: npm run dev
  ```

- [ ] **Environment variables are set** (check `.env` file)
  ```bash
  N8N_URL=http://localhost:5678
  N8N_HMAC_SECRET=your-secret-key
  ```

## 📋 What Gets Tested

✨ **Test 1: Echo Workflow**
- Creates a simple webhook → transform workflow
- Input: `"Hello from FlowSpec!"`
- Expected Output: `{ message: "...", timestamp: "...", echo: true }`

🌐 **Test 2: HTTP API Integration**
- Fetches real data from GitHub API
- Tests external service calls
- Expected: Repository data from nodejs/node

🔀 **Test 3: Conditional Branch**
- Tests workflow branching
- Two executions: high priority & normal priority
- Validates different execution paths

## 📊 Expected Output

```
✓ TEST SUITE PASSED
Total Tests: 9
Passed: 9
Failed: 0
Success Rate: 100.0%
```

## 🐛 Quick Troubleshooting

| Error | Quick Fix |
|-------|-----------|
| `Cannot connect to API server` | Run `npm run dev` in offchain/ |
| `n8n container not found` | Run `cd ../n8n && docker-compose up -d` |
| `N8N_HMAC_SECRET not set` | Add to `.env` file |

## 📖 Full Documentation

For detailed information, see:
- [README-FLOWSPEC-TESTING.md](./README-FLOWSPEC-TESTING.md) - Complete testing guide
- [FLOWSPEC-API-REFERENCE.md](./FLOWSPEC-API-REFERENCE.md) - API documentation
- [FLOWSPEC-DSL-GUIDE.md](./FLOWSPEC-DSL-GUIDE.md) - FlowSpec syntax

## 🎯 Manual Quick Test

```bash
# 1. Create workflow
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Quick Test","nodes":[{"id":"w","type":"webhook"},{"id":"t","type":"transform","config":{"expression":"{ test: true }"}}],"edges":[{"from":"w","to":"t"}]}'

# 2. Execute (use workflowId from response)
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowId":"YOUR_ID","context":{"tenantId":"test","variables":{}}}'
```

## ✨ Next Steps

After successful tests:
1. ✅ Review the generated JSON report (`test-results-*.json`)
2. 🔍 Check created workflows in n8n UI (http://localhost:5678)
3. 🔧 Extend tests with your own workflows
4. 📦 Integrate FlowSpec into your application

---

**Need help?** Check the [full testing guide](./README-FLOWSPEC-TESTING.md) or review logs:
```bash
# API server logs
npm run dev

# n8n logs
docker logs lucid-n8n
