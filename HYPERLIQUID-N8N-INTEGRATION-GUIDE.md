# Hyperliquid n8n Integration Guide

**Date:** November 17, 2025  
**Version:** 1.0  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Setup & Configuration](#setup--configuration)
5. [API Reference](#api-reference)
6. [n8n Workflows](#n8n-workflows)
7. [Security & Policies](#security--policies)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide details the integration of **Hyperliquid DEX** with **n8n workflows** using **Privy embedded wallets** for autonomous trading. Users can execute trades on Hyperliquid directly from n8n workflows using their Privy wallets and session signers.

### What This Enables

✅ **Autonomous Trading** - n8n workflows trade on behalf of users 24/7  
✅ **Policy-Based Security** - Session signers enforce limits (size, frequency, pairs)  
✅ **Multi-User Support** - Each user has isolated wallet and trading policies  
✅ **Full Audit Trail** - Every trade logged with workflow context  
✅ **All Order Types** - Market, limit, stop-loss, take-profit, trailing stops  
✅ **Position Management** - Query positions, close positions, update leverage  

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  n8n Workflow Engine                     │
│         (DCA Bot, Grid Trading, Signal Bot)             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────┐
    │    Hyperliquid Adapter (Webhook)           │
    │    Validates & Routes Operations           │
    └────────────┬───────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────────────┐
    │           Backend API (Express)                     │
    │    /api/hyperliquid/place-order                    │
    │    /api/hyperliquid/cancel-order                   │
    └────────┬────────────────────────┬──────────────────┘
             │                        │
    ┌────────▼──────────┐   ┌────────▼─────────────────┐
    │ Hyperliquid       │   │  Privy Wallets            │
    │ Trading Service   │   │  (Session Signers)        │
    │ • Resolve Wallet  │   │  • EIP-712 Signing        │
    │ • Check Policy    │   │  • Policy Enforcement     │
    │ • Sign TX         │   │  • Audit Logging          │
    │ • Submit Order    │   └───────────────────────────┘
    └───────────────────┘
             │
             ▼
    ┌────────────────────┐
    │  Hyperliquid DEX   │
    │    (Mainnet)       │
    └────────────────────┘
```

---

## Quick Start

### Prerequisites

- ✅ Privy wallets configured (see PRIVY-IMPLEMENTATION-PLAN.md)
- ✅ Session signers created for users
- ✅ n8n running (port 5678)
- ✅ Backend API running (port 3001)
- ✅ Dependencies installed (`npm install ethers @nktkas/hyperliquid`)

### 5-Minute Setup

```bash
# 1. Navigate to offchain directory
cd /home/admin/Lucid/Lucid-L2/offchain

# 2. Add Hyperliquid routes to main server
# Edit src/index.ts and add:
# import hyperliquidRoutes from './routes/hyperliquidRoutes';
# app.use('/api/hyperliquid', hyperliquidRoutes);

# 3. Set environment variable
echo "HYPERLIQUID_NETWORK=mainnet" >> .env

# 4. Rebuild and restart backend
npm run build
npm start

# 5. Import n8n workflows
# - Import n8n/workflows/adapters/hyperliquid-adapter.json
# - Import n8n/workflows/hyperliquid-dca-bot.json

# 6. Test health endpoint
curl http://localhost:3001/api/hyperliquid/health
```

---

## Setup & Configuration

### Step 1: Register Routes in Backend

Add to `Lucid-L2/offchain/src/index.ts`:

```typescript
// Import Hyperliquid routes
import hyperliquidRoutes from './routes/hyperliquidRoutes';

// Register routes (after other routes)
app.use('/api/hyperliquid', hyperliquidRoutes);
```

### Step 2: Configure Environment

Add to `Lucid-L2/offchain/.env`:

```bash
# Hyperliquid Configuration
HYPERLIQUID_NETWORK=mainnet  # or 'testnet'

# Privy Configuration (if not already set)
PRIVY_APP_ID=your-app-id
PRIVY_APP_SECRET=your-app-secret
PRIVY_KEY_QUORUM_ID=your-key-quorum-id
PRIVY_SIGNER_ENCRYPTION_KEY=your-encryption-key

# API URLs
LUCID_API_URL=http://localhost:3001
N8N_WEBHOOK_URL=http://localhost:5678/webhook
```

### Step 3: Import n8n Workflows

1. Open n8n at `http://localhost:5678`
2. Import `n8n/workflows/adapters/hyperliquid-adapter.json`
3. Import `n8n/workflows/hyperliquid-dca-bot.json`
4. Activate the Hyperliquid Adapter workflow

### Step 4: Create Session Signer for User

Before users can trade, they need a session signer:

```bash
# Via API or Privy adapter
curl -X POST http://localhost:3001/api/privy/add-session-signer \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "walletId": "wallet-id-from-privy",
    "ttl": 2592000,
    "maxAmount": 1000000,
    "allowedPrograms": ["BTC", "ETH", "SOL"]
  }'
```

---

## API Reference

### Place Order

**Endpoint:** `POST /api/hyperliquid/place-order`

**Request Body:**
```json
{
  "userId": "user123",
  "symbol": "BTC",
  "side": "BUY",
  "orderType": "market",
  "size": 0.01,
  "price": 45000,
  "reduceOnly": false,
  "postOnly": false,
  "timeInForce": "GTC",
  "n8nWorkflowId": "workflow-123",
  "n8nExecutionId": "execution-456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": {
      "data": {
        "statuses": [{
          "resting": { "oid": "12345" }
        }]
      }
    }
  },
  "timestamp": 1700000000000
}
```

**Order Types:**
- `market` - Execute immediately at market price
- `limit` - Execute at specific price (requires `price`)
- `stop-loss` - Trigger at price below market (requires `triggerPrice`)
- `take-profit` - Trigger at price above market (requires `triggerPrice`)
- `trailing-stop` - Trail behind price movement (requires `trailAmount`)

---

### Cancel Order

**Endpoint:** `POST /api/hyperliquid/cancel-order`

**Request Body:**
```json
{
  "userId": "user123",
  "orderId": "12345",
  "symbol": "BTC",
  "n8nWorkflowId": "workflow-123"
}
```

---

### Cancel All Orders

**Endpoint:** `POST /api/hyperliquid/cancel-all-orders`

**Request Body:**
```json
{
  "userId": "user123",
  "symbol": "BTC",
  "n8nWorkflowId": "workflow-123"
}
```

Leave `symbol` empty to cancel all orders across all symbols.

---

### Close Position

**Endpoint:** `POST /api/hyperliquid/close-position`

**Request Body:**
```json
{
  "userId": "user123",
  "symbol": "BTC",
  "percentage": 100,
  "n8nWorkflowId": "workflow-123"
}
```

**Parameters:**
- `percentage` - Percentage of position to close (1-100, default: 100)

---

### Update Leverage

**Endpoint:** `POST /api/hyperliquid/update-leverage`

**Request Body:**
```json
{
  "userId": "user123",
  "symbol": "BTC",
  "leverage": 10,
  "crossMargin": false
}
```

**Parameters:**
- `leverage` - Leverage multiplier (1-50x)
- `crossMargin` - Use cross margin mode (default: false = isolated)

---

## n8n Workflows

### Hyperliquid Adapter (Core)

**Location:** `n8n/workflows/adapters/hyperliquid-adapter.json`

**Purpose:** Central webhook that validates and routes all Hyperliquid operations.

**Usage in Workflows:**
```javascript
// Call via HTTP Request node
{
  "operation": "placeOrder",
  "userId": "user123",
  "parameters": {
    "symbol": "BTC",
    "side": "BUY",
    "orderType": "market",
    "size": 0.01
  }
}
```

**Supported Operations:**
- `placeOrder`
- `cancelOrder`
- `cancelAllOrders`
- `modifyOrder`
- `closePosition`
- `updateLeverage`

---

### DCA Bot Example

**Location:** `n8n/workflows/hyperliquid-dca-bot.json`

**Purpose:** Automatically buy BTC daily at 12pm UTC (Dollar Cost Averaging).

**Configuration:**
```javascript
// DCA Configuration node
{
  "userId": "user123",        // Your user ID
  "symbol": "BTC",            // Trading pair
  "orderType": "market",      // Order type
  "side": "BUY",              // Buy or sell
  "quoteSize": "100"          // Daily buy amount in USD
}
```

**Schedule:** Daily at 12:00 UTC (customizable via cron expression)

**Flow:**
1. Trigger on schedule
2. Check Hyperliquid health
3. Fetch current BTC price
4. Calculate order size (quoteSize / price)
5. Place market buy order
6. Log execution result

---

### Grid Trading Bot (Advanced)

Create buy/sell ladder orders:

```javascript
// Pseudocode for grid trading
const currentPrice = await getMarketPrice('BTC');
const gridLevels = 10;
const gridSpacing = 0.02; // 2% between levels

// Place buy orders below current price
for (let i = 1; i <= gridLevels; i++) {
  await placeOrder({
    symbol: 'BTC',
    side: 'BUY',
    orderType: 'limit',
    price: currentPrice * (1 - gridSpacing * i),
    size: 0.001
  });
}

// Place sell orders above current price
for (let i = 1; i <= gridLevels; i++) {
  await placeOrder({
    symbol: 'BTC',
    side: 'SELL',
    orderType: 'limit',
    price: currentPrice * (1 + gridSpacing * i),
    size: 0.001
  });
}
```

---

## Security & Policies

### Session Signer Policies

Session signers enforce per-user trading limits:

**Policy Options:**
```typescript
{
  ttl: 2592000,                    // Time to live (30 days)
  maxAmount: 1000000,              // Max order size (lamports/wei)
  dailyLimit: 5000000,             // Daily trading limit
  allowedPrograms: ['BTC', 'ETH'], // Allowed trading pairs
  requiresQuorum: false            // Multi-sig requirement
}
```

### Checking Trade Permissions

Before every trade, the system:
1. ✅ Verifies user owns wallet
2. ✅ Checks active session signer exists
3. ✅ Validates order against policies
4. ✅ Checks daily limits not exceeded
5. ✅ Logs attempt to audit trail

### Audit Trail

Every operation logged to `signer_audit_log`:

```sql
SELECT 
  user_id,
  transaction_type,
  status,
  metadata,
  n8n_workflow_id,
  created_at
FROM signer_audit_log
WHERE user_id = 'user123'
ORDER BY created_at DESC
LIMIT 100;
```

**Logged Fields:**
- User ID
- Wallet ID
- Signer ID
- Transaction type (placeOrder, cancelOrder, etc.)
- Status (success, denied, error)
- Metadata (order details)
- n8n workflow ID and execution ID
- Timestamp

---

## Troubleshooting

### Issue 1: "No active session signer found"

**Cause:** User doesn't have a session signer or it's expired.

**Solution:**
```bash
# Create new session signer
curl -X POST http://localhost:3001/api/privy/add-session-signer \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "walletId": "wallet-id",
    "ttl": 2592000
  }'
```

---

### Issue 2: "Trade denied: Policy violation"

**Cause:** Order exceeds policy limits (size, daily limit, or not in allowed pairs).

**Solution:**
```sql
-- Check user's session signer policies
SELECT 
  max_amount_lamports,
  max_amount_wei,
  daily_limit_lamports,
  allowed_programs,
  expires_at
FROM session_signers
WHERE user_id = 'user123'
  AND revoked_at IS NULL;

-- Update policies or revoke and create new signer
```

---

### Issue 3: "Wallet not found"

**Cause:** User hasn't created Privy wallet yet.

**Solution:**
```bash
# Create Privy wallet for user
curl -X POST http://localhost:3001/api/privy/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "chainType": "ethereum"
  }'
```

---

### Issue 4: Order placement fails

**Check:**
1. Hyperliquid service health: `curl http://localhost:3001/api/hyperliquid/health`
2. User wallet exists: Check `user_wallets` table
3. Session signer active: Check `session_signers` table
4. Order parameters valid: Check symbol, size, price format
5. Backend logs: `docker logs lucid-backend`

---

## Testing

### Test Health Endpoint

```bash
curl http://localhost:3001/api/hyperliquid/health
```

Expected response:
```json
{
  "status": "healthy",
  "network": "mainnet",
  "timestamp": 1700000000000
}
```

### Test Place Order (Market)

```bash
curl -X POST http://localhost:3001/api/hyperliquid/place-order \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "symbol": "BTC",
    "side": "BUY",
    "orderType": "market",
    "size": 0.001
  }'
```

### Test via n8n Adapter

```bash
curl -X POST http://localhost:5678/webhook/hyperliquid-adapter \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "placeOrder",
    "userId": "user123",
    "parameters": {
      "symbol": "BTC",
      "side": "BUY",
      "orderType": "market",
      "size": 0.001
    }
  }'
```

---

## Production Checklist

- [ ] Session signers created for all users
- [ ] Policies configured appropriately
- [ ] Backend routes registered in `index.ts`
- [ ] Environment variables set correctly
- [ ] n8n workflows imported and activated
- [ ] Audit logging verified
- [ ] Rate limiting configured
- [ ] Monitoring and alerts set up
- [ ] Error handling tested
- [ ] Network set to 'mainnet' for production

---

## Advanced: Custom Trading Strategy

### Example: RSI-Based Trading Bot

```javascript
// n8n workflow pseudocode
// 1. Trigger: Every 5 minutes
const rsi = await calculateRSI('BTC', 14); // 14-period RSI

if (rsi < 30) {
  // Oversold - Buy signal
  await hyperliquidAdapter.placeOrder({
    userId: 'user123',
    symbol: 'BTC',
    side: 'BUY',
    orderType: 'market',
    size: 0.01
  });
} else if (rsi > 70) {
  // Overbought - Sell signal
  await hyperliquidAdapter.placeOrder({
    userId: 'user123',
    symbol: 'BTC',
    side: 'SELL',
    orderType: 'market',
    size: 0.01
  });
}
```

---

## Support

For issues or questions:
1. Check this guide's troubleshooting section
2. Review audit logs in database
3. Check backend logs: `docker logs lucid-backend`
4. Verify Privy wallet and session signer status

---

## Changelog

**v1.0 - November 17, 2025**
- Initial release
- Full trading operations support
- Privy wallet integration
- Session signer policies
- n8n workflow examples
- Complete documentation
