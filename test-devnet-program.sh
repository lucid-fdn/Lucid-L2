#!/bin/bash
# =============================================================================
# DEVNET PROGRAM TEST SCRIPT
# Tests the thought-epoch Solana program on devnet
# =============================================================================

set -e

echo "======================================"
echo "  LUCID THOUGHT-EPOCH DEVNET TEST"
echo "======================================"
echo ""

PROGRAM_ID="J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c"
AUTHORITY="D12Q1MiGbnB6hWDsHrgc3kMNvKCi5rAUkFEukyHcxWxn"
RPC_URL="https://api.devnet.solana.com"

echo "📍 Program ID: $PROGRAM_ID"
echo "🔑 Authority:  $AUTHORITY"
echo "🌐 Network:    Devnet"
echo ""

# =============================================================================
# 1. VERIFY PROGRAM EXISTS
# =============================================================================
echo "1️⃣  Verifying program exists on devnet..."
echo "-------------------------------------------"

PROGRAM_INFO=$(solana program show $PROGRAM_ID --url devnet 2>&1)
if echo "$PROGRAM_INFO" | grep -q "Program Id"; then
    echo "✅ Program is deployed and active!"
    echo "$PROGRAM_INFO" | head -7
else
    echo "❌ Program NOT found on devnet!"
    exit 1
fi
echo ""

# =============================================================================
# 2. CHECK AUTHORITY BALANCE
# =============================================================================
echo "2️⃣  Checking authority wallet balance..."
echo "-----------------------------------------"

BALANCE=$(solana balance $AUTHORITY --url devnet)
echo "💰 Authority Balance: $BALANCE"

# Check if balance is sufficient (at least 0.1 SOL)
BALANCE_NUM=$(echo "$BALANCE" | sed 's/ SOL//')
if (( $(echo "$BALANCE_NUM >= 0.1" | bc -l) )); then
    echo "✅ Sufficient balance for transactions"
else
    echo "⚠️  Low balance - may need airdrop"
fi
echo ""

# =============================================================================
# 3. VIEW ON SOLANA EXPLORER
# =============================================================================
echo "3️⃣  Solana Explorer Links..."
echo "----------------------------"
echo "📊 Program: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo "👤 Authority: https://explorer.solana.com/address/$AUTHORITY?cluster=devnet"
echo ""

# =============================================================================
# 4. TEST API ANCHORING HEALTH (if server is running)
# =============================================================================
echo "4️⃣  Testing API Anchoring Health..."
echo "------------------------------------"

API_URL="http://localhost:3001"

# Check if API is running
if curl -s --connect-timeout 2 "$API_URL/health" > /dev/null 2>&1; then
    echo "🔄 API is running, checking anchoring health..."
    curl -s "$API_URL/v1/anchoring/health" | jq '.' 2>/dev/null || echo "⚠️  Could not parse response"
else
    echo "⚠️  API not running on localhost:3001"
    echo "   Start with: cd offchain && npm run dev"
fi
echo ""

# =============================================================================
# 5. TEST CREATING RECEIPT + EPOCH (requires API)
# =============================================================================
echo "5️⃣  API Test Commands (run when API is up)..."
echo "-----------------------------------------------"
echo ""
echo "# Create a receipt:"
echo 'curl -X POST http://localhost:3001/v1/receipts \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{
    "model_passport_id": "test-model-001",
    "compute_passport_id": "test-compute-001",
    "policy_hash": "abc123",
    "runtime": "vllm",
    "tokens_in": 100,
    "tokens_out": 500,
    "ttft_ms": 150
  }'"'"''
echo ""
echo "# Get current epoch:"
echo "curl http://localhost:3001/v1/epochs/current"
echo ""
echo "# Commit epoch to Solana (requires funded keypair):"
echo 'curl -X POST http://localhost:3001/v1/receipts/commit-root \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"epoch_id": "<EPOCH_ID>"}'"'"''
echo ""

# =============================================================================
# 6. RECENT TRANSACTIONS
# =============================================================================
echo "6️⃣  Checking recent program transactions..."
echo "--------------------------------------------"

echo "🔍 Recent transactions (if any):"
solana transaction-history $PROGRAM_ID --url devnet --limit 5 2>/dev/null || echo "   No recent transactions or query failed"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "======================================"
echo "         TEST SUMMARY"
echo "======================================"
echo "✅ Program: DEPLOYED on devnet"
echo "✅ Authority Balance: $BALANCE"
echo ""
echo "📋 Next Steps:"
echo "   1. Start API: cd offchain && npm run dev"
echo "   2. Create receipts via API"
echo "   3. Commit epoch to anchor on Solana"
echo "   4. Verify transaction on Explorer"
echo ""
echo "🔗 Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo "======================================"
