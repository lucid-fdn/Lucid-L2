#!/bin/bash

# Privy Wallet Integration Test Script
# Tests all API endpoints for the Privy wallet integration

set -e

API_URL="${API_URL:-http://localhost:3001}"
TEST_USER="test-user-$(date +%s)"
CHAIN_TYPE="solana"

echo "🧪 Privy Wallet Integration Tests"
echo "=================================="
echo "API URL: $API_URL"
echo "Test User: $TEST_USER"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0;0m' # No Color

test_passed=0
test_failed=0

# Function to run a test
run_test() {
    local test_name="$1"
    local command="$2"
    
    echo -n "Testing: $test_name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((test_passed++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((test_failed++))
        return 1
    fi
}

# Test 1: System Status
echo "📊 Test 1: System Status"
run_test "GET /api/system/status" \
    "curl -s -f $API_URL/api/system/status | jq -e '.success == true'"
echo ""

# Test 2: Wallet Options
echo "🔧 Test 2: Wallet Options"
run_test "GET /api/wallets/options/chains" \
    "curl -s -f $API_URL/api/wallets/options/chains | jq -e '.success == true and (.options | length) > 0'"

run_test "GET /api/wallets/options/allowedPrograms" \
    "curl -s -f $API_URL/api/wallets/options/allowedPrograms | jq -e '.success == true and (.options | length) > 0'"

run_test "GET /api/wallets/options/policyTemplates" \
    "curl -s -f $API_URL/api/wallets/options/policyTemplates | jq -e '.success == true and (.options | length) > 0'"
echo ""

# Test 3: Wallet Onboarding
echo "👤 Test 3: Wallet Onboarding"
echo "Creating wallet for $TEST_USER..."

ONBOARD_RESPONSE=$(curl -s -X POST $API_URL/api/wallets/onboard \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER\",
    \"chainType\": \"$CHAIN_TYPE\",
    \"policies\": {
      \"ttl\": 86400,
      \"maxAmount\": \"1000000000\",
      \"dailyLimit\": \"5000000000\",
      \"allowedPrograms\": [\"JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB\"]
    }
  }")

if echo "$ONBOARD_RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Wallet onboarding successful${NC}"
    ((test_passed++))
    
    # Extract wallet ID for later tests
    WALLET_ID=$(echo "$ONBOARD_RESPONSE" | jq -r '.wallet.walletId')
    SIGNER_ID=$(echo "$ONBOARD_RESPONSE" | jq -r '.sessionSigner.signerId')
    
    echo "  Wallet ID: $WALLET_ID"
    echo "  Signer ID: $SIGNER_ID"
else
    echo -e "${RED}✗ Wallet onboarding failed${NC}"
    echo "$ONBOARD_RESPONSE" | jq '.'
    ((test_failed++))
    exit 1
fi
echo ""

# Test 4: Wallet Retrieval
echo "🔍 Test 4: Wallet Retrieval"
run_test "GET /api/wallets/$TEST_USER/$CHAIN_TYPE" \
    "curl -s -f $API_URL/api/wallets/$TEST_USER/$CHAIN_TYPE | jq -e '.success == true and .wallet.walletId == \"$WALLET_ID\"'"
echo ""

# Test 5: List Session Signers
echo "📋 Test 5: List Session Signers"
run_test "GET /api/wallets/$WALLET_ID/session-signers" \
    "curl -s -f \"$API_URL/api/wallets/$WALLET_ID/session-signers?userId=$TEST_USER\" | jq -e '.success == true'"
echo ""

# Test 6: Transaction Signing (Will fail without actual Privy setup, but tests endpoint)
echo "🔐 Test 6: Transaction Signing Endpoint"
echo "Note: This will fail without Privy credentials configured"
SIGN_RESPONSE=$(curl -s -X POST $API_URL/api/wallets/$WALLET_ID/sign-transaction \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER\",
    \"transaction\": \"BASE64_MOCK_TRANSACTION\",
    \"chainType\": \"$CHAIN_TYPE\",
    \"n8nWorkflowId\": \"test-workflow\",
    \"n8nExecutionId\": \"test-execution\"
  }")

# We expect this to fail gracefully with proper error handling
if echo "$SIGN_RESPONSE" | jq -e 'has("error") or has("success")' > /dev/null; then
    echo -e "${GREEN}✓ Endpoint responds correctly${NC}"
    ((test_passed++))
else
    echo -e "${RED}✗ Endpoint error${NC}"
    ((test_failed++))
fi
echo ""

# Test 7: Revoke Session Signer
echo "🚫 Test 7: Revoke Session Signer"
REVOKE_RESPONSE=$(curl -s -X DELETE $API_URL/api/wallets/$WALLET_ID/session-signers/$SIGNER_ID \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$TEST_USER\"}")

if echo "$REVOKE_RESPONSE" | jq -e 'has("success")' > /dev/null; then
    echo -e "${GREEN}✓ Revoke endpoint responds${NC}"
    ((test_passed++))
else
    echo -e "${RED}✗ Revoke endpoint error${NC}"
    ((test_failed++))
fi
echo ""

# Summary
echo "=================================="
echo "📊 Test Summary"
echo "=================================="
echo -e "Total Tests: $((test_passed + test_failed))"
echo -e "${GREEN}Passed: $test_passed${NC}"
echo -e "${RED}Failed: $test_failed${NC}"
echo ""

if [ $test_failed -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
