# Nango + n8n Credential Management Guide

**Date:** February 10, 2025  
**Version:** 1.0  
**Status:** Implementation Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Setup & Configuration](#setup--configuration)
5. [Implementation](#implementation)
6. [Usage Examples](#usage-examples)
7. [Security](#security)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This guide details the integration of **Nango** (OAuth credential management) with **n8n workflows** and **Privy authentication** to enable secure, per-user API credential management at scale.

### What This Solves

**Before Nango:**
- Shared API keys for all users
- Manual token rotation
- Security risks with hardcoded credentials
- No per-user audit trail

**After Nango:**
- Per-user OAuth credentials (Twitter, Discord, exchanges, etc.)
- Automatic token refresh
- Secure credential isolation
- Complete audit trail
- Scalable for millions of users

### Key Features

✅ **Unified Authentication**: Privy handles user identity, Nango handles API credentials  
✅ **Self-Hosted**: Full control over credential storage  
✅ **Automatic Token Refresh**: No manual intervention needed  
✅ **Per-User Isolation**: Each user's credentials isolated  
✅ **n8n Integration**: Workflows fetch credentials on-demand  
✅ **Audit Trail**: Track every API call per user  
✅ **Rate Limiting**: Prevent abuse at scale  
✅ **Multi-Provider**: Twitter, Discord, Telegram, Binance, Coinbase, and more

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  User Applications                       │
│    (Browser Extension, Dashboard, Telegram Bot)         │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Authenticate with Privy
                 ▼
    ┌────────────────────────────────────────────┐
    │         Privy Authentication               │
    │  • Email, Social, Crypto Wallet Login     │
    │  • Issues JWT with Privy User ID          │
    └────────────┬───────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────────────┐
    │              Lucid Backend API                      │
    │  • Validates Privy JWT                             │
    │  • Links Privy User ID to Nango connections        │
    │  • Manages both wallets (Privy) and API creds      │
    └────────┬────────────────────────┬──────────────────┘
             │                        │
    ┌────────▼──────────┐   ┌────────▼─────────────────┐
    │ Privy Wallets     │   │  Nango Server            │
    │ (Embedded)        │   │  (Self-hosted)           │
    │ • Session Signers │   │  • OAuth tokens storage  │
    └───────────────────┘   │  • Token refresh         │
                            │  • Twitter, Discord, etc.│
                            └────────┬─────────────────┘
                                     │
                        ┌────────────▼──────────────────┐
                        │        n8n Workflows           │
                        │  1. Get Privy User ID          │
                        │  2. Fetch OAuth token          │
                        │  3. Call external API          │
                        │  4. Log usage                  │
                        └───────────────────────────────┘
                                     │
                        ┌────────────▼──────────────────┐
                        │     External APIs              │
                        │  (Twitter, Discord, Binance)  │
                        └───────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- ✅ Docker and Docker Compose installed
- ✅ Privy authentication working
- ✅ Lucid-L2 backend running (port 3001)
- ✅ n8n running (port 5678)
- ✅ PostgreSQL database

### 5-Minute Setup

```bash
# 1. Generate Nango secrets
cd /home/admin/Lucid/Lucid-L2
openssl rand -hex 32  # For NANGO_SECRET_KEY
openssl rand -hex 32  # For NANGO_ENCRYPTION_KEY

# 2. Update docker-compose.yml (add Nango service)
nano infrastructure/docker-compose.yml

# 3. Update .env file
nano offchain/.env
# Add:
# NANGO_SECRET_KEY=<generated-key>
# NANGO_ENCRYPTION_KEY=<generated-key>
# NANGO_API_URL=http://localhost:3003

# 4. Apply database migration
cd infrastructure
npx supabase db push

# 5. Start Nango
cd ..
docker compose -f infrastructure/docker-compose.yml up -d nango

# 6. Install dependencies
cd offchain
npm install @nangohq/node ioredis

# 7. Start backend
npm run build
npm start

# 8. Access Nango Dashboard
# Open http://localhost:3007
```

---

## Setup & Configuration

### Step 1: Docker Compose Configuration (5 min)

Add Nango service to `Lucid-L2/infrastructure/docker-compose.yml`:

```yaml
services:
  # ... existing services (n8n, postgres, redis, etc.)
  
  nango:
    image: nangohq/nango-server:latest
    container_name: lucid-nango
    ports:
      - "3003:3003"  # API
      - "3007:3007"  # Dashboard
    environment:
      - NANGO_DB_HOST=postgres
      - NANGO_DB_PORT=5432
      - NANGO_DB_NAME=nango
      - NANGO_DB_USER=${NANGO_DB_USER:-nango}
      - NANGO_DB_PASSWORD=${NANGO_DB_PASSWORD}
      - NANGO_ENCRYPTION_KEY=${NANGO_ENCRYPTION_KEY}
      - NANGO_SECRET_KEY=${NANGO_SECRET_KEY}
      - NANGO_CALLBACK_URL=${NANGO_CALLBACK_URL:-http://localhost:3001/api/oauth/callback}
      - SERVER_PORT=3003
      - SERVER_RUN_MODE=DOCKERIZED
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - lucid-network
    volumes:
      - nango_data:/var/lib/nango
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  nango_data:
    driver: local
```

### Step 2: Environment Variables (3 min)

Add to `Lucid-L2/offchain/.env`:

```bash
# ===================================
# Nango Configuration
# ===================================
NANGO_SECRET_KEY=<generate-with-openssl-rand-hex-32>
NANGO_ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>
NANGO_DB_USER=nango
NANGO_DB_PASSWORD=<generate-with-openssl-rand-base64-16>
NANGO_API_URL=http://localhost:3003
NANGO_DASHBOARD_URL=http://localhost:3007
NANGO_CALLBACK_URL=http://localhost:3001/api/oauth/callback

# Redis Configuration (for token caching)
REDIS_URL=redis://localhost:6379

# Rate Limiting
OAUTH_RATE_LIMIT_WINDOW=3600000  # 1 hour in ms
OAUTH_RATE_LIMIT_MAX_REQUESTS=300  # Max requests per window
```

### Step 3: Database Schema (5 min)

Create migration file:

```bash
cd Lucid-L2/infrastructure/migrations
touch 20250210_nango_integration.sql
```

See [Database Schema](#database-schema) section below for SQL content.

### Step 4: Configure Nango Integrations (10 min)

After starting Nango, access dashboard at `http://localhost:3007`:

**For Twitter/X:**
1. Create integration named `twitter`
2. Add OAuth 2.0 configuration:
   - Auth URL: `https://twitter.com/i/oauth2/authorize`
   - Token URL: `https://api.twitter.com/2/oauth2/token`
   - Scopes: `tweet.read tweet.write users.read`
3. Add your Twitter API credentials

**For Discord:**
1. Create integration named `discord`
2. Add OAuth 2.0 configuration:
   - Auth URL: `https://discord.com/api/oauth2/authorize`
   - Token URL: `https://discord.com/api/oauth2/token`
   - Scopes: `identify guilds messages.write`
3. Add your Discord application credentials

**For Binance:**
1. Create integration named `binance`
2. Add API Key authentication
3. Configure per-user API key storage

---

## Implementation

### Database Schema

File: `Lucid-L2/infrastructure/migrations/20250210_nango_integration.sql`

```sql
-- OAuth state management (CSRF protection)
CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  privy_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- User OAuth connections linked to Privy users
CREATE TABLE user_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  
  -- Nango details
  nango_connection_id TEXT NOT NULL,
  nango_integration_id TEXT NOT NULL,
  
  -- Provider account info
  provider_account_id TEXT,
  provider_account_name TEXT,
  provider_account_email TEXT,
  scopes TEXT[],
  
  -- Lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  
  CONSTRAINT unique_user_provider UNIQUE (privy_user_id, provider)
);

-- OAuth API usage logging
CREATE TABLE oauth_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES user_oauth_connections(id) ON DELETE SET NULL,
  privy_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  
  -- Request details
  n8n_workflow_id TEXT,
  n8n_execution_id TEXT,
  endpoint_called TEXT,
  api_method TEXT CHECK (api_method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  
  -- Response
  status_code INTEGER,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  
  -- Performance
  created_at TIMESTAMP DEFAULT NOW(),
  response_time_ms INTEGER,
  
  -- Rate limiting
  rate_limit_window TIMESTAMP DEFAULT DATE_TRUNC('hour', NOW())
);

-- Indexes for performance
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expiry ON oauth_states(expires_at) WHERE expires_at > NOW();

CREATE INDEX idx_oauth_connections_user ON user_oauth_connections(privy_user_id);
CREATE INDEX idx_oauth_connections_provider ON user_oauth_connections(provider) 
  WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX idx_oauth_connections_nango ON user_oauth_connections(nango_connection_id);

CREATE INDEX idx_oauth_usage_user_time ON oauth_usage_log(privy_user_id, created_at DESC);
CREATE INDEX idx_oauth_usage_workflow ON oauth_usage_log(n8n_workflow_id, created_at DESC);
CREATE INDEX idx_oauth_usage_rate_limit ON oauth_usage_log(privy_user_id, provider, rate_limit_window);

-- Cleanup old states (auto)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states() RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Rate limiting helper function
CREATE OR REPLACE FUNCTION get_user_request_count(
  p_privy_user_id TEXT,
  p_provider TEXT,
  p_window_start TIMESTAMP
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM oauth_usage_log
    WHERE privy_user_id = p_privy_user_id
      AND provider = p_provider
      AND rate_limit_window = p_window_start
  );
END;
$$ LANGUAGE plpgsql;

-- High frequency detection
CREATE OR REPLACE FUNCTION get_high_frequency_oauth_users(
  p_threshold INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
) RETURNS TABLE(
  privy_user_id TEXT,
  provider TEXT,
  request_count BIGINT,
  window_start TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.privy_user_id,
    l.provider,
    COUNT(*) as request_count,
    l.rate_limit_window
  FROM oauth_usage_log l
  WHERE l.created_at >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
  GROUP BY l.privy_user_id, l.provider, l.rate_limit_window
  HAVING COUNT(*) > p_threshold
  ORDER BY request_count DESC;
END;
$$ LANGUAGE plpgsql;
```

### Backend Service Layer

File: `Lucid-L2/offchain/src/services/nangoService.ts`

(Content provided in plan - full implementation)

### API Routes

File: `Lucid-L2/offchain/src/routes/oauthRoutes.ts`

(Content provided in plan - full implementation)

### Middleware for Privy JWT Verification

File: `Lucid-L2/offchain/src/middleware/privyAuth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from '@privy-io/server-auth';

export interface PrivyRequest extends Request {
  user?: {
    privyUserId: string;
    userId: string;
    walletAddress?: string;
  };
}

export async function verifyPrivyToken(
  req: PrivyRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7);
    
    // Verify with Privy
    const claims = await verifyAuthToken(token, process.env.PRIVY_APP_SECRET!);
    
    if (!claims || !claims.userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Attach user info to request
    req.user = {
      privyUserId: claims.userId,
      userId: claims.userId, // Or map to your internal user ID
      walletAddress: claims.walletAddress
    };
    
    next();
  } catch (error) {
    console.error('Privy JWT verification failed:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}
```

---

## Usage Examples

### Example 1: Twitter Trading Bot

**n8n Workflow:**

```json
{
  "name": "Twitter Trading Signal Bot",
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "trading-signal",
        "responseMode": "onReceived"
      }
    },
    {
      "name": "Extract User & Signal",
      "type": "n8n-nodes-base.set",
      "parameters": {
        "values": {
          "string": [
            {
              "name": "privyUserId",
              "value": "={{ $json.body.privyUserId }}"
            },
            {
              "name": "signal",
              "value": "={{ $json.body.signal }}"
            },
            {
              "name": "price",
              "value": "={{ $json.body.price }}"
            }
          ]
        }
      }
    },
    {
      "name": "Get Twitter Token",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/oauth/={{ $json.privyUserId }}/twitter/token",
        "method": "GET",
        "authentication": "genericCredentialType",
        "genericAuthType": "hmac"
      }
    },
    {
      "name": "Compose Tweet",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const signal = $input.item.json.signal;\nconst price = $input.item.json.price;\n\nreturn {\n  text: `🚀 ${signal} Signal Alert!\\nPrice: $${price}\\n\\n#Crypto #Trading #DeFi`\n};"
      }
    },
    {
      "name": "Post Tweet",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.twitter.com/2/tweets",
        "method": "POST",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer ={{ $node['Get Twitter Token'].json.token }}"
            },
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "text",
              "value": "={{ $json.text }}"
            }
          ]
        }
      }
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{ "node": "Extract User & Signal", "type": "main", "index": 0 }]]
    },
    "Extract User & Signal": {
      "main": [[{ "node": "Get Twitter Token", "type": "main", "index": 0 }]]
    },
    "Get Twitter Token": {
      "main": [[{ "node": "Compose Tweet", "type": "main", "index": 0 }]]
    },
    "Compose Tweet": {
      "main": [[{ "node": "Post Tweet", "type": "main", "index": 0 }]]
    }
  }
}
```

### Example 2: Discord Notifications

**n8n Workflow:**

```json
{
  "name": "Discord Trading Notifications",
  "nodes": [
    {
      "name": "Schedule Every 5 min",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "minutes", "value": 5 }]
        }
      }
    },
    {
      "name": "Get All Users",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/users/with-discord",
        "method": "GET"
      }
    },
    {
      "name": "Split Users",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": {
        "batchSize": 10
      }
    },
    {
      "name": "Get User Discord Token",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/oauth/={{ $json.privyUserId }}/discord/token",
        "method": "GET"
      }
    },
    {
      "name": "Send Discord Message",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://discord.com/api/v10/channels/={{ $json.channelId }}/messages",
        "method": "POST",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer ={{ $node['Get User Discord Token'].json.token }}"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "content",
              "value": "Your daily trading report is ready! 📊"
            }
          ]
        }
      }
    }
  ]
}
```

### Example 3: Binance Auto-Trading

**n8n Workflow:**

```json
{
  "name": "Binance DCA Bot",
  "nodes": [
    {
      "name": "Daily Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "days", "value": 1 }]
        }
      }
    },
    {
      "name": "Get User Config",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/trading/dca-config/={{ $json.userId }}",
        "method": "GET"
      }
    },
    {
      "name": "Get Binance Token",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/oauth/={{ $json.privyUserId }}/binance/token",
        "method": "GET"
      }
    },
    {
      "name": "Place Market Order",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.binance.com/api/v3/order",
        "method": "POST",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "X-MBX-APIKEY",
              "value": "={{ $node['Get Binance Token'].json.apiKey }}"
            }
          ]
        },
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "symbol",
              "value": "={{ $json.symbol }}"
            },
            {
              "name": "side",
              "value": "BUY"
            },
            {
              "name": "type",
              "value": "MARKET"
            },
            {
              "name": "quoteOrderQty",
              "value": "={{ $json.amount }}"
            },
            {
              "name": "signature",
              "value": "={{ $node['Get Binance Token'].json.signature }}"
            }
          ]
        }
      }
    }
  ]
}
```

---

## Security

### Best Practices

#### 1. Token Storage
- ✅ All OAuth tokens encrypted in Nango database
- ✅ Encryption key stored in environment variables
- ✅ Never log tokens in plaintext
- ✅ Cache tokens in Redis with short TTL (max 50 minutes)

#### 2. Access Control
- ✅ Validate Privy JWT on every request
- ✅ Ensure user can only access their own credentials
- ✅ HMAC signature for n8n → Backend communication
- ✅ Rate limiting per user per provider

#### 3. OAuth Scopes
- ✅ Request minimum necessary scopes
- ✅ Document why each scope is needed
- ✅ Allow users to review scopes before connecting
- ✅ Provide scope upgrade/downgrade mechanism

#### 4. Audit Trail
- ✅ Log every OAuth API call
- ✅ Include workflow ID and execution ID
- ✅ Track success/failure rates
- ✅ Alert on anomalies (high frequency, high failure rate)

### Security Checklist

- [ ] Nango encryption key generated and stored securely
- [ ] HTTPS enforced for all OAuth callbacks
- [ ] Environment variables not committed to Git
- [ ] Database credentials rotated regularly
- [ ] Privy JWT verification implemented correctly
- [ ] Rate limiting configured appropriately
- [ ] Audit logs enabled and monitored
- [ ] Alert system configured for anomalies
- [ ] User permissions validated on every request
- [ ] OAuth tokens never exposed in logs or errors

---

## Monitoring

### Key Metrics to Track

#### 1. Connection Health
```sql
-- Active connections per provider
SELECT 
  provider,
  COUNT(*) as active_connections,
  COUNT(DISTINCT privy_user_id) as unique_users
FROM user_oauth_connections
WHERE revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY provider
ORDER BY active_connections DESC;
```

#### 2. API Usage
```sql
-- API calls per provider (last 24 hours)
SELECT 
  provider,
  COUNT(*) as total_calls,
  COUNT(DISTINCT privy_user_id) as unique_users,
  AVG(response_time_ms) as avg_response_time,
  SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as success_rate
FROM oauth_usage_log
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY total_calls DESC;
```

#### 3. Error Rates
```sql
-- Failed OAuth attempts (last hour)
SELECT 
  provider,
  error_message,
  COUNT(*) as error_count
FROM oauth_usage_log
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND success = false
GROUP BY provider, error_message
ORDER BY error_count DESC
LIMIT 10;
```

#### 4. Rate Limit Violations
```sql
-- Users hitting rate limits
SELECT 
  privy_user_id,
  provider,
  COUNT(*) as request_count,
  rate_limit_window
FROM oauth_usage_log
WHERE rate_limit_window = DATE_TRUNC('hour', NOW())
GROUP BY privy_user_id, provider, rate_limit_window
HAVING COUNT(*) > 300  -- Adjust threshold
ORDER BY request_count DESC;
```

### Alerting

Set up alerts for:
- High error rates (> 10% in 1 hour)
- Rate limit violations (> 5 users hitting limit)
- Connection failures (> 50% OAuth flows failing)
- Slow response times (avg > 5 seconds)
- Unusual activity patterns (100+ requests/minute from single user)

---

## Troubleshooting

### Issue 1: "No OAuth connection found"

**Symptoms:**
```
Error: No twitter connection found for user
```

**Causes:**
1. User hasn't connected the provider yet
2. Connection expired
3. Connection was revoked
4. Database sync issue

**Solutions:**
```bash
# Check if connection exists
psql -d lucid -c "SELECT * FROM user_oauth_connections WHERE privy_user_id='USER_ID' AND provider='twitter';"

# If expired, prompt user to reconnect
# If exists but not working, try re-authenticating
```

### Issue 2: "Token refresh failed"

**Symptoms:**
```
Error: Unable to refresh access token
```

**Causes:**
1. Refresh token expired (user needs to re-authorize)
2. OAuth app credentials changed
3. User revoked access on provider side
4. Nango service down

**Solutions:**
```bash
# Check Nango service
curl http://localhost:3003/health

# Check logs
docker logs lucid-nango

# Force re-authentication
DELETE FROM user_oauth_connections WHERE id='CONNECTION_ID';
```

### Issue 3: Rate limit exceeded

**Symptoms:**
```
Error: Rate limit exceeded for provider twitter
```

**Causes:**
1. User exceeding provider's rate limits
2. Workflow running too frequently
3. Multiple workflows using same credentials

**Solutions:**
```typescript
// Implement backoff in n8n workflow
const { rateLimit } = $node['Get Twitter Token'].json;

if (rateLimit && rateLimit.remaining < 10) {
  // Wait before next request
  await new Promise(resolve => setTimeout(resolve, 60000));
}
```

### Issue 4: Nango service won't start

**Symptoms:**
```
docker compose ps
# lucid-nango: Exit 1
```

**Causes:**
1. Database connection failed
2. Missing environment variables
3. Port conflict

**Solutions:**
```bash
# Check logs
docker compose logs nango

# Verify environment variables
docker compose config | grep NANGO

# Check port availability
netstat -tulpn | grep 3003

# Restart clean
docker compose down nango
docker compose up -d nango
```

### Issue 5: OAuth callback not received

**Symptoms:**
- User completes OAuth flow
- But connection not saved

**Causes:**
1. Incorrect callback URL configured
2. State token mismatch (CSRF)
3. Network/firewall blocking callback

**Solutions:**
```bash
# Verify callback URL in Nango dashboard
# Should be: http://localhost:3001/api/oauth/callback

# Check state in database
SELECT * FROM oauth_states WHERE expires_at > NOW();

# Test callback manually
curl -X GET "http://localhost:3001/api/oauth/callback?code=TEST&state=VALID_STATE"
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All secrets generated and stored in .env
- [ ] Database migration tested
- [ ] Nango service starts successfully
- [ ] OAuth providers configured in Nango dashboard
- [ ] Callback URLs registered with OAuth providers
- [ ] Backend API routes implemented
- [ ] Privy JWT verification working
- [ ] n8n workflows updated to use new credential fetching
- [ ] Rate limiting configured
- [ ] Monitoring and alerting set up

### Deployment Steps

```bash
# 1. Backup current database
pg_dump lucid > backup_before_nango_$(date +%Y%m%d).sql

# 2. Apply migration
cd Lucid-L2/infrastructure
npx supabase db push

# 3. Build backend
cd ../offchain
npm run build

# 4. Start Nango
docker compose -f ../infrastructure/docker-compose.yml up -d nango

# 5. Wait for Nango to be healthy
until curl -
