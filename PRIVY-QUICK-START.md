# Privy Wallet Integration - Quick Start Guide

This guide will help you get started with the Privy wallet integration for autonomous n8n workflows.

## 📋 Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose running
- Supabase account (for database)
- Privy account at [dashboard.privy.io](https://dashboard.privy.io)
- n8n instance running (see `Lucid-L2/n8n/README.md`)

---

## 🚀 Quick Setup (5 Steps)

### Step 1: Privy Account Setup

1. Go to [dashboard.privy.io](https://dashboard.privy.io) and create an account
2. Create a new app
3. Note your credentials:
   - App ID
   - App Secret
4. Enable embedded wallets in Settings
5. Configure supported chains (Solana, Ethereum)

### Step 2: Generate Authorization Keys

```bash
# Generate ECDSA private key (P-256 curve)
openssl ecparam -name prime256v1 -genkey -noout -out privy-auth-private.pem

# Extract public key
openssl ec -in privy-auth-private.pem -pubout -out privy-auth-public.pem

# Display public key (copy this)
cat privy-auth-public.pem

# Generate encryption key for session signers
openssl rand -hex 32
```

**Register Public Key in Privy:**
1. Go to Privy Dashboard → Settings → Authorization Keys
2. Create new "Key Quorum" with threshold=1
3. Paste your public key
4. Note the `KEY_QUORUM_ID`

### Step 3: Configure Environment

Edit `Lucid-L2/offchain/.env`:

```bash
# Privy Configuration
PRIVY_APP_ID=your_app_id_from_dashboard
PRIVY_APP_SECRET=your_app_secret_from_dashboard
PRIVY_AUTH_PRIVATE_KEY=/path/to/privy-auth-private.pem
PRIVY_KEY_QUORUM_ID=your_key_quorum_id_from_dashboard
PRIVY_API_BASE_URL=https://api.privy.io/v1

# Session Signer Encryption (output from openssl rand -hex 32)
PRIVY_SIGNER_ENCRYPTION_KEY=your_64_char_hex_key_here

# Supabase Configuration - OPTION 1: Local Supabase (Already Configured!)
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.QgI22wW2Xr8r7AqZJ3tpNuNBCASQ-tmJdTGowkqnnaU

# OR OPTION 2: Cloud Supabase (if you prefer)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your_cloud_service_key_here
```

**Note:** You already have a local Supabase instance running! Check `Lucid-L2/infrastructure/.env` for your existing configuration. You can use this local instance or create a cloud project.

#### Option 1: Use Local Supabase (Recommended for Development)

Your local Supabase is already configured in `Lucid-L2/infrastructure/.env`. Simply use these values:

```bash
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.QgI22wW2Xr8r7AqZJ3tpNuNBCASQ-tmJdTGowkqnnaU
```

Make sure your local Supabase is running:
```bash
cd Lucid-L2/infrastructure
docker-compose up -d
```

#### Option 2: Use Cloud Supabase (For Production)

If you want to use Supabase cloud instead:

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click "New Project"
3. Fill in project details (name, database password, region)
4. Wait for project to be created (2-3 minutes)
5. Go to Settings → API
6. Copy your credentials:
   - **Project URL** → Use as `SUPABASE_URL`
   - **service_role secret** → Use as `SUPABASE_SERVICE_KEY`

**Example cloud values:**
```bash
SUPABASE_URL=https://abcdefghijklmno.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ubyIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2MjE1MjM2MDAsImV4cCI6MTkzNzA5OTYwMH0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **Important:** Never commit your `service_role` key to git! It has admin access to your database.

### Step 4: Run Database Migration

```bash
cd Lucid-L2/infrastructure

# Option 1: Using Supabase CLI
npx supabase db push

# Option 2: Using Supabase Dashboard
# 1. Go to your Supabase project
# 2. Navigate to Database → SQL Editor
# 3. Copy contents of migrations/20250131_privy_wallets.sql
# 4. Execute the SQL
```

**Verify tables created:**
- `user_wallets`
- `session_signers`
- `signer_audit_log`

### Step 5: Start Backend API

```bash
cd Lucid-L2/offchain

# Install dependencies (if not already done)
npm install

# Build TypeScript
npm run build

# Start the API server
npm run dev

# Verify it's running
curl http://localhost:3001/api/system/status
```

---

## ✅ Test Your Setup

### 1. Test Wallet Onboarding

```bash
curl -X POST http://localhost:3001/api/wallets/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "chainType": "solana",
    "policies": {
      "ttl": 86400,
      "maxAmount": "1000000000",
      "dailyLimit": "5000000000",
      "allowedPrograms": ["JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB"]
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "wallet": {
    "walletId": "...",
    "address": "...",
    "chainType": "solana"
  },
  "sessionSigner": {
    "signerId": "...",
    "expiresAt": "..."
  }
}
```

### 2. Test Wallet Retrieval

```bash
curl http://localhost:3001/api/wallets/test-user-001/solana
```

### 3. Import n8n Workflows

1. Open n8n at http://localhost:5678
2. Click "Workflows" → "Import from File"
3. Import `Lucid-L2/n8n/workflows/privy-wallet-onboarding.json`
4. Import `Lucid-L2/n8n/workflows/privy-autonomous-trading.json`
5. Update user IDs in workflows
6. Click "Execute Workflow" to test

### 4. Verify in Supabase

Go to your Supabase project → Table Editor:

**Check `user_wallets`:**
- Should see your test user's wallet

**Check `session_signers`:**
- Should see an active session signer

**Check `signer_audit_log`:**
- Will populate when transactions are signed

---

## 📊 Policy Templates

### Conservative (Recommended for Testing)
```json
{
  "ttl": 86400,              // 24 hours
  "maxAmount": "1000000000", // 1 SOL per transaction
  "dailyLimit": "5000000000", // 5 SOL daily
  "allowedPrograms": [
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB"  // Jupiter only
  ],
  "requiresQuorum": false
}
```

### Moderate (For Production)
```json
{
  "ttl": 604800,              // 7 days
  "maxAmount": "10000000000", // 10 SOL per transaction
  "dailyLimit": "50000000000", // 50 SOL daily
  "allowedPrograms": [],       // All programs allowed
  "requiresQuorum": false
}
```

### High-Value (With Quorum)
```json
{
  "ttl": 3600,                 // 1 hour
  "maxAmount": "100000000000", // 100 SOL per transaction
  "dailyLimit": "500000000000", // 500 SOL daily
  "requiresQuorum": true       // Requires 2/2 signatures
}
```

---

## 🔧 Common Issues & Solutions

### Issue: "Privy API authentication failed"

**Solution:**
1. Verify `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are correct
2. Check that public key is registered in Privy Dashboard
3. Verify `PRIVY_KEY_QUORUM_ID` matches Dashboard
4. Ensure private key file path is correct

### Issue: "Database connection failed"

**Solution:**
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
2. Check that migration has been run
3. Test connection: `psql $SUPABASE_URL`

### Issue: "Transaction denied: amount exceeds limit"

**Solution:**
- Increase `maxAmount` in policy
- Or split transaction into smaller amounts
- Check
