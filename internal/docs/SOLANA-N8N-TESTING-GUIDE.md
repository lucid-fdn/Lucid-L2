# Solana n8n Node Testing Guide

Complete guide for testing the Solana adapter integration with n8n and FlowSpec DSL.

## Overview

The Solana n8n node provides 13 operations for interacting with the Solana blockchain:
- **8 Read Operations** (no credentials required)
- **5 Write Operations** (requires private key)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Testing Approaches                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   1. Direct REST API        2. FlowSpec DSL        3. n8n Workflow │
│   ───────────────────       ──────────────        ─────────────── │
│   curl /api/solana/*        POST /flowspec/       Import JSON      │
│         │                         │                     │          │
│         └─────────────────────────┼─────────────────────┘          │
│                                   ▼                                │
│                          Lucid API (port 3001)                     │
│                                   │                                │
│                                   ▼                                │
│                          SolanaAdapter                             │
│                                   │                                │
│                                   ▼                                │
│               Solana Network (devnet/testnet/mainnet)              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. Backend Server Running

```bash
cd Lucid-L2/offchain
npm install
npm run dev

# Server should be running on http://localhost:3001
```

### 2. Environment Configuration

Ensure your `.env` file has:
```env
# Solana Configuration (optional for read operations)
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# For write operations
SOLANA_PRIVATE_KEY=your_base58_encoded_private_key
```

### 3. n8n Instance (for FlowSpec tests)

```bash
cd Lucid-L2/infrastructure
docker-compose up n8n
```

## Quick Start - Run Tests

```bash
# Make script executable
chmod +x Lucid-L2/test-solana-n8n.sh

# Run all tests
cd Lucid-L2
./test-solana-n8n.sh

# Run with custom API URL
API_BASE=http://your-server:3001 ./test-solana-n8n.sh

# Test write operations (requires private key)
SOLANA_PRIVATE_KEY=your_key ./test-solana-n8n.sh
```

## Available Operations

### Read Operations (No Auth Required)

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| getBalance | GET /api/solana/balance/:address | Get SOL balance |
| getTokenBalance | POST /api/solana/token-balance | Get SPL token balance |
| getTokenAccounts | GET /api/solana/token-accounts/:address | List token accounts |
| getAccountInfo | GET /api/solana/account-info/:address | Get account details |
| getTransaction | GET /api/solana/transaction/:signature | Get transaction info |
| getSignaturesForAddress | GET /api/solana/transactions/:address | Transaction history |
| getRecentBlockhash | GET /api/solana/recent-blockhash | Get recent blockhash |
| getTokenSupply | GET /api/solana/token-supply/:mint | Get token supply |

### Write Operations (Auth Required)

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| transferSOL | POST /api/solana/transfer-sol | Transfer SOL |
| transferToken | POST /api/solana/transfer-token | Transfer SPL tokens |
| createTokenAccount | POST /api/solana/create-token-account | Create token account |
| closeTokenAccount | POST /api/solana/close-token-account | Close token account |

## Testing Methods

### Method 1: Direct REST API Testing

#### Test Health Check
```bash
curl http://localhost:3001/api/solana/health
```

#### Test Get Balance
```bash
curl http://localhost:3001/api/solana/balance/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

#### Test Get Recent Blockhash
```bash
curl http://localhost:3001/api/solana/recent-blockhash
```

#### Test Get Token Accounts
```bash
curl http://localhost:3001/api/solana/token-accounts/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

#### Test Get Transaction History
```bash
curl "http://localhost:3001/api/solana/transactions/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?limit=5"
```

#### Test Get Token Supply (USDC)
```bash
curl http://localhost:3001/api/solana/token-supply/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

#### Test Transfer SOL (Write - Requires Key)
```bash
curl -X POST http://localhost:3001/api/solana/transfer-sol \
  -H "Content-Type: application/json" \
  -d '{
    "toAddress": "DESTINATION_ADDRESS",
    "amount": 0.001,
    "commitment": "confirmed"
  }'
```

### Method 2: FlowSpec DSL Testing

FlowSpec supports Solana operations through the `solana.read` and `solana.write` node types.

#### List Existing Workflows
```bash
curl http://localhost:3001/flowspec/list
```

#### Create Solana Balance Check Workflow
```bash
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "check-solana-balance",
    "description": "Check Solana wallet balance",
    "nodes": [
      {
        "id": "get-balance",
        "type": "solana.read",
        "config": {
          "url": "http://localhost:3001/api/solana/balance/YOUR_WALLET",
          "method": "GET"
        }
      }
    ],
    "edges": []
  }'
```

#### Create Multi-Step Solana Workflow
```bash
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "solana-data-aggregation",
    "description": "Aggregate multiple Solana data points",
    "nodes": [
      {
        "id": "trigger",
        "type": "n8n-nodes-base.manualTrigger",
        "config": {}
      },
      {
        "id": "check-balance",
        "type": "solana.read",
        "config": {
          "url": "http://localhost:3001/api/solana/balance/YOUR_WALLET",
          "method": "GET"
        }
      },
      {
        "id": "get-blockhash",
        "type": "solana.read",
        "config": {
          "url": "http://localhost:3001/api/solana/recent-blockhash",
          "method": "GET"
        }
      },
      {
        "id": "process-data",
        "type": "transform",
        "config": {
          "code": "return items.map(item => ({ ...item, processed: true, timestamp: Date.now() }));"
        }
      }
    ],
    "edges": [
      { "from": "trigger", "to": "check-balance" },
      { "from": "check-balance", "to": "get-blockhash" },
      { "from": "get-blockhash", "to": "process-data" }
    ]
  }'
```

#### Execute a FlowSpec Workflow
```bash
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "WORKFLOW_ID",
    "context": {
      "tenantId": "test-tenant",
      "userId": "test-user"
    }
  }'
```

### Method 3: n8n Workflow Testing

#### Import Existing Solana Workflow

1. Open n8n UI: `http://localhost:5678`
2. Go to **Workflows** → **Import**
3. Select: `Lucid-L2/n8n/workflows/adapters/solana-write-adapter.json`
4. Activate the workflow

#### Create New Workflow via n8n UI

1. Create new workflow
2. Add **Webhook** trigger node
3. Add **HTTP Request** node:
   - Method: GET
   - URL: `http://host.docker.internal:3001/api/solana/balance/YOUR_WALLET`
4. Add **Respond to Webhook** node
5. Connect nodes: Webhook → HTTP Request → Respond
6. Activate and test

## FlowSpec Node Types for Solana

| FlowSpec Type | Compiles To | Use Case |
|--------------|-------------|----------|
| `solana.read` | HTTP Request (GET) | Read blockchain data |
| `solana.write` | HTTP Request (POST) | Write transactions |

### Example: Conditional Transfer Workflow

```json
{
  "name": "conditional-solana-transfer",
  "nodes": [
    {
      "id": "check-balance",
      "type": "solana.read",
      "config": {
        "url": "http://localhost:3001/api/solana/balance/SOURCE_WALLET",
        "method": "GET"
      }
    },
    {
      "id": "has-sufficient-balance",
      "type": "branch",
      "config": {
        "condition": "{{$json.data.balance > 1}}"
      }
    },
    {
      "id": "do-transfer",
      "type": "solana.write",
      "config": {
        "url": "http://localhost:3001/api/solana/transfer-sol",
        "method": "POST",
        "body": {
          "toAddress": "DESTINATION",
          "amount": 0.1
        }
      }
    }
  ],
  "edges": [
    { "from": "check-balance", "to": "has-sufficient-balance" },
    { "from": "has-sufficient-balance", "to": "do-transfer", "when": "true" }
  ]
}
```

## Test Scenarios

### Scenario 1: Basic Read Operations
✅ Health check
✅ Get balance
✅ Get recent blockhash
✅ Get token accounts
✅ Get transaction history

### Scenario 2: FlowSpec Workflow Creation
✅ Create single-node workflow
✅ Create multi-node workflow
✅ List workflows

### Scenario 3: Write Operations (Requires Devnet SOL)
⚠️ Transfer SOL
⚠️ Create token account
⚠️ Transfer tokens

### Scenario 4: Integration Testing
✅ Multi-step workflows
✅ Conditional logic
✅ Error handling

## Troubleshooting

### Common Issues

#### 1. "Connection refused"
```
Error: Cannot connect to API server
```
**Solution:** Start the backend server:
```bash
cd Lucid-L2/offchain && npm run dev
```

#### 2. "Solana adapter not found"
```
Error: Solana adapter not found
```
**Solution:** Ensure the adapter is registered in `ProtocolRegistry`:
```typescript
// Check src/protocols/adapters/index.ts exports SolanaAdapter
```

#### 3. "Private key required"
```
Error: AUTH_REQUIRED - Private key required for transfers
```
**Solution:** Set `SOLANA_PRIVATE_KEY` environment variable

#### 4. FlowSpec endpoints return 404
```
Cannot GET /flowspec/list
```
**Solution:** Ensure FlowSpec routes are registered and n8n API key is set:
```env
N8N_API_KEY=your_n8n_api_key
```

### Network Selection

| Environment | RPC URL | Explorer |
|-------------|---------|----------|
| Devnet | `https://api.devnet.solana.com` | `explorer.solana.com?cluster=devnet` |
| Testnet | `https://api.testnet.solana.com` | `explorer.solana.com?cluster=testnet` |
| Mainnet | `https://api.mainnet-beta.solana.com` | `explorer.solana.com` |

## Test Coverage Checklist

### REST API Endpoints
- [ ] GET /api/solana/health
- [ ] GET /api/solana/balance/:address
- [ ] POST /api/solana/token-balance
- [ ] GET /api/solana/token-accounts/:address
- [ ] GET /api/solana/account-info/:address
- [ ] GET /api/solana/transaction/:signature
- [ ] GET /api/solana/transactions/:address
- [ ] GET /api/solana/recent-blockhash
- [ ] GET /api/solana/token-supply/:mint
- [ ] POST /api/solana/transfer-sol
- [ ] POST /api/solana/transfer-token
- [ ] POST /api/solana/create-token-account
- [ ] POST /api/solana/close-token-account

### FlowSpec Integration
- [ ] GET /flowspec/list
- [ ] POST /flowspec/create (solana.read)
- [ ] POST /flowspec/create (solana.write)
- [ ] POST /flowspec/execute
- [ ] Multi-node workflow compilation
- [ ] Edge connections

### n8n Workflows
- [ ] Import solana-write-adapter.json
- [ ] Webhook trigger functionality
- [ ] HTTP Request to Solana endpoints
- [ ] Response handling

## Sample Test Output

```
==============================================================================
  SOLANA N8N NODE INTEGRATION TESTS
==============================================================================
API Base URL: http://localhost:3001
Network: --devnet
Test Wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

==============================================================================
  Phase 0: Prerequisites
==============================================================================

▶ Test: API Server Connectivity
✅ API server is running at http://localhost:3001

==============================================================================
  Phase 1: REST API Tests (Read Operations)
==============================================================================

▶ Test: Solana Adapter Health Check
✅ Health check passed

▶ Test: Get SOL Balance
✅ Get balance successful
{
  "success": true,
  "data": {
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "lamports": 1000000000,
    "balance": 1
  }
}

==============================================================================
  TEST RESULTS SUMMARY
==============================================================================
Passed: 12
Failed: 0
Skipped: 1

Pass Rate: 100%

🎉 All tests passed!
```

## Next Steps

1. **Run the test script**: `./test-solana-n8n.sh`
2. **Verify n8n workflows**: Import and test in n8n UI
3. **Test write operations**: Use devnet with test tokens
4. **Create custom FlowSpec workflows**: For your specific use cases

## Related Documentation

- [FlowSpec DSL Guide](./offchain/FLOWSPEC-DSL-GUIDE.md)
- [Hyperliquid N8N Integration](./HYPERLIQUID-N8N-INTEGRATION-GUIDE.md)
- [Protocol SDK README](./offchain/PROTOCOL-SDK-README.md)
- [N8N Integration Guide](./N8N-INTEGRATION-GUIDE.md)
