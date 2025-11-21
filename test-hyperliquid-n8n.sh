#!/bin/bash

# Hyperliquid n8n Integration Test Script
# Tests all components of the Hyperliqu + Privy + n8n stack

set -e

echo "🧪 Hyperliquid n8n Integration Test Suite"
echo "=========================================="
echo ""

# Configuration
BACKEND_URL="http://localhost:3001"
N8N_WEBHOOK_URL="http://localhost:5678/webhook"
TEST_USER_ID="test-user-$(date +%s)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
    echo -e "${YELLOW}TEST:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

print_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Test 1: Backend Health Check
print_section "1. Backend Services"

print_test "Checking backend health..."
if curl -s -f "${BACKEND_URL}/health" > /dev/null; then
    print_success "Backend is healthy"
else
    print_error "Backend is not responding"
fi

# Test 2: Hyperliquid Routes Health
print_test "Checking Hyperliquid routes health..."
HEALTH_RESPONSE=$(curl -s "${BACKEND_URL}/api/hyperliquid/health")
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    print_success "Hyperliquid routes are healthy"
    echo "  Response: $HEALTH_RESPONSE"
else
    print_error "Hyperliquid routes not responding correctly"
fi

# Test 3: Create Test User Wallet
print_section "2. Privy Wallet Setup"

print_test "Creating Privy wallet for test user..."
WALLET_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/privy/create-user" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"${TEST_USER_ID}\", \"chainType\": \"ethereum\"}" 2>/dev/null || echo "{}")

if echo "$WALLET_RESPONSE" | grep -q "address\|existed"; then
    print_success "Test wallet created/retrieved"
    WALLET_ADDRESS=$(echo "$WALLET_RESPONSE" | grep -o '"address":"[^"]*"' | cut -d'"' -f4 || echo "")
    echo "  Wallet Address: $WALLET_ADDRESS"
else
    print_error "Failed to create test wallet"
    echo "  Response: $WALLET_RESPONSE"
fi

# Test 4: Create Session Signer
print_test "Creating session signer for test user..."
WALLET_ID=$(echo "$WALLET_RESPONSE" | grep -o '"walletId":"[^"]*"' | cut -d'"' -f4 || echo "test-wallet")

SIGNER_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/privy/add-session-signer" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${TEST_USER_ID}\",
    \"walletId\": \"${WALLET_ID}\",
    \"ttl\": 86400,
    \"maxAmount\": 1000000,
    \"allowedPrograms\": [\"BTC\", \"ETH\"]
  }" 2>/dev/null || echo "{}")

if echo "$SIGNER_RESPONSE" | grep -q "signerId\|error"; then
    if echo "$SIGNER_RESPONSE" | grep -q "signerId"; then
        print_success "Session signer created"
    else
        print_error "Session signer creation failed (may be expected if not yet implemented)"
        echo "  Response: $SIGNER_RESPONSE"
    fi
else
    print_error "Unexpected session signer response"
fi

# Test 5: n8n Hyperliquid Adapter
print_section "3. n8n Hyperliquid Adapter"

print_test "Testing Hyperliquid adapter webhook..."
ADAPTER_RESPONSE=$(curl -s -X POST "${N8N_WEBHOOK_URL}/hyperliquid-adapter" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"placeOrder\",
    \"userId\": \"${TEST_USER_ID}\",
    \"parameters\": {
      \"symbol\": \"BTC\",
      \"side\": \"BUY\",
      \"orderType\": \"market\",
      \"size\": 0.001
    }
  }" 2>/dev/null || echo "{\"error\": \"n8n not responding\"}")

if echo "$ADAPTER_RESPONSE" | grep -q "success\|error"; then
    if echo "$ADAPTER_RESPONSE" | grep -q "\"success\":true"; then
        print_success "Hyperliquid adapter responding (order may not execute without real setup)"
    else
        print_error "Hyperliquid adapter returned error (expected in test environment)"
        echo "  This is normal without full Privy setup"
    fi
else
    print_error "n8n webhook not responding"
fi

# Test 6: Backend API Endpoints
print_section "4. Backend API Endpoints"

print_test "Testing place-order endpoint..."
ORDER_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/hyperliquid/place-order" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${TEST_USER_ID}\",
    \"symbol\": \"BTC\",
    \"side\": \"BUY\",
    \"orderType\": \"market\",
    \"size\": 0.001
  }" 2>/dev/null || echo "{}")

if echo "$ORDER_RESPONSE" | grep -q "success\|error"; then
    print_success "Place order endpoint responding"
    echo "  (Order may fail without real wallet - this is expected)"
else
    print_error "Place order endpoint not responding"
fi

print_test "Testing cancel-order endpoint..."
CANCEL_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/hyperliquid/cancel-order" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${TEST_USER_ID}\",
    \"orderId\": \"12345\",
    \"symbol\": \"BTC\"
  }" 2>/dev/null || echo "{}")

if echo "$CANCEL_RESPONSE" | grep -q "success\|error"; then
    print_success "Cancel order endpoint responding"
else
    print_error "Cancel order endpoint not responding"
fi

print_test "Testing close-position endpoint..."
CLOSE_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/hyperliquid/close-position" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${TEST_USER_ID}\",
    \"symbol\": \"BTC\",
    \"percentage\": 100
  }" 2>/dev/null || echo "{}")

if echo "$CLOSE_RESPONSE" | grep -q "success\|error"; then
    print_success "Close position endpoint responding"
else
    print_error "Close position endpoint not responding"
fi

# Test 7: Database Schema
print_section "5. Database Schema"

print_test "Checking required tables exist..."
if command -v psql &> /dev/null; then
    TABLES=$(psql -h localhost -U postgres -d lucid -t -c "
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('user_wallets', 'session_signers', 'signer_audit_log')
    " 2>/dev/null || echo "")
    
    if echo "$TABLES" | grep -q "user_wallets"; then
        print_success "Required tables exist"
    else
        print_error "Required tables missing (or psql not accessible)"
    fi
else
    print_error "psql not available - skipping database schema checks"
fi

# Test 8: File Structure
print_section "6. File Structure"

print_test "Checking required files exist..."
FILES_TO_CHECK=(
    "offchain/src/services/hyperliquidTradingService.ts"
    "offchain/src/routes/hyperliquidRoutes.ts"
    "n8n/workflows/adapters/hyperliquid-adapter.json"
    "n8n/workflows/hyperliquid-dca-bot.json"
    "HYPERLIQUID-N8N-INTEGRATION-GUIDE.md"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        print_success "File exists: $file"
    else
        print_error "File missing: $file"
    fi
done

# Test 9: Dependencies
print_section "7. Dependencies"

print_test "Checking npm dependencies..."
cd offchain
if npm list ethers @nktkas/hyperliquid &> /dev/null; then
    print_success "Required npm packages installed"
else
    print_error "Required npm packages missing"
    echo "  Run: npm install ethers @nktkas/hyperliquid"
fi
cd ..

# Test 10: Environment Variables
print_section "8. Environment Configuration"

print_test "Checking environment variables..."
cd offchain
if [ -f ".env" ]; then
    if grep -q "HYPERLIQUID_NETWORK" .env; then
        print_success "HYPERLIQUID_NETWORK configured"
    else
        print_error "HYPERLIQUID_NETWORK not set in .env"
    fi
    
    if grep -q "PRIVY_APP_ID" .env; then
        print_success "Privy credentials configured"
    else
        print_error "Privy credentials missing in .env"
    fi
else
    print_error ".env file not found"
fi
cd ..

# Summary
print_section "Test Summary"
echo ""
echo "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Ensure backend is running: cd offchain && npm start"
    echo "  2. Open n8n: http://localhost:5678"
    echo "  3. Import workflows from n8n/workflows/adapters/"
    echo "  4. Configure real user wallets and session signers"
    echo "  5. Test with small amounts on testnet first"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed${NC}"
    echo ""
    echo "Common issues:"
    echo "  - Backend not running: cd offchain && npm start"
    echo "  - n8n not running: Check n8n is accessible at port 5678"
    echo "  - Dependencies missing: cd offchain && npm install"
    echo "  - Database not configured: Check Supabase connection"
    echo ""
    echo "See HYPERLIQUID-N8N-INTEGRATION-GUIDE.md for setup instructions"
    exit 1
fi
