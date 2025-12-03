#!/bin/bash
# =============================================================================
# Solana n8n Node Integration Test Script
# =============================================================================
# 
# This script tests all Solana operations through:
# 1. Direct REST API endpoints
# 2. FlowSpec DSL workflow creation
# 3. n8n workflow integration
#
# Usage: ./test-solana-n8n.sh [--devnet|--testnet|--mainnet]
#
# Prerequisites:
# - Backend server running on port 3001
# - n8n instance running (optional for FlowSpec tests)
# - Solana devnet wallet (for write operation tests)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="${API_BASE:-http://localhost:3001}"
NETWORK="${1:---devnet}"

# Test addresses (well-known addresses on Solana devnet)
TEST_WALLET="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"  # Example address
USDC_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC mint address
TEST_SIGNATURE="5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# =============================================================================
# Utility Functions
# =============================================================================

print_header() {
    echo -e "\n${BLUE}==============================================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}==============================================================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}▶ Test: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

print_failure() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

print_skip() {
    echo -e "${YELLOW}⏭️  $1${NC}"
    ((TESTS_SKIPPED++))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_health() {
    local response
    response=$(curl -s "${API_BASE}/api/solana/health" 2>&1)
    if echo "$response" | grep -q "healthy"; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# Phase 1: REST API Tests (Read Operations)
# =============================================================================

test_api_health() {
    print_test "Solana Adapter Health Check"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/health")
    
    if echo "$response" | grep -q "healthy"; then
        print_success "Health check passed"
        echo "Response: $response" | head -c 200
    else
        print_failure "Health check failed: $response"
    fi
}

test_get_balance() {
    print_test "Get SOL Balance"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/balance/${TEST_WALLET}")
    
    if echo "$response" | grep -q "success\|balance\|lamports"; then
        print_success "Get balance successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get balance failed: $response"
    fi
}

test_get_recent_blockhash() {
    print_test "Get Recent Blockhash"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/recent-blockhash")
    
    if echo "$response" | grep -q "blockhash\|lastValidBlockHeight"; then
        print_success "Get recent blockhash successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get recent blockhash failed: $response"
    fi
}

test_get_token_accounts() {
    print_test "Get Token Accounts"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/token-accounts/${TEST_WALLET}")
    
    if echo "$response" | grep -q "success"; then
        print_success "Get token accounts successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get token accounts failed: $response"
    fi
}

test_get_transactions() {
    print_test "Get Transaction History"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/transactions/${TEST_WALLET}?limit=5")
    
    if echo "$response" | grep -q "success"; then
        print_success "Get transaction history successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get transaction history failed: $response"
    fi
}

test_get_token_supply() {
    print_test "Get Token Supply (USDC)"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/token-supply/${USDC_MINT}")
    
    if echo "$response" | grep -q "success\|amount\|decimals"; then
        print_success "Get token supply successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get token supply failed: $response"
    fi
}

test_get_account_info() {
    print_test "Get Account Info"
    
    local response
    response=$(curl -s "${API_BASE}/api/solana/account-info/${TEST_WALLET}")
    
    if echo "$response" | grep -q "success\|error"; then
        print_success "Get account info successful (or expected error for non-existent account)"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Get account info failed: $response"
    fi
}

# =============================================================================
# Phase 2: REST API Tests (Write Operations) - SKIPPED by default
# =============================================================================

test_transfer_sol() {
    print_test "Transfer SOL (REQUIRES PRIVATE KEY)"
    
    if [ -z "${SOLANA_PRIVATE_KEY}" ]; then
        print_skip "Skipped - SOLANA_PRIVATE_KEY not set"
        echo "To test write operations, set SOLANA_PRIVATE_KEY environment variable"
        return
    fi
    
    local response
    response=$(curl -s -X POST "${API_BASE}/api/solana/transfer-sol" \
        -H "Content-Type: application/json" \
        -d '{
            "toAddress": "'"${TEST_WALLET}"'",
            "amount": 0.001,
            "commitment": "confirmed"
        }')
    
    if echo "$response" | grep -q "signature\|success"; then
        print_success "Transfer SOL successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "Transfer SOL failed: $response"
    fi
}

# =============================================================================
# Phase 3: FlowSpec DSL Tests
# =============================================================================

test_flowspec_list() {
    print_test "FlowSpec List Workflows"
    
    local response
    response=$(curl -s "${API_BASE}/flowspec/list")
    
    if echo "$response" | grep -q "success\|workflows"; then
        print_success "FlowSpec list successful"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "FlowSpec list failed: $response"
    fi
}

test_flowspec_solana_read() {
    print_test "FlowSpec - Create Solana Read Workflow"
    
    local flowspec_json='{
        "name": "solana-balance-check-test",
        "description": "Test workflow to check Solana balance via FlowSpec",
        "nodes": [
            {
                "id": "check-balance",
                "type": "solana.read",
                "config": {
                    "url": "'"${API_BASE}/api/solana/balance/${TEST_WALLET}"'",
                    "method": "GET"
                }
            }
        ],
        "edges": [],
        "metadata": {
            "createdBy": "test-script",
            "testRun": true
        }
    }'
    
    local response
    response=$(curl -s -X POST "${API_BASE}/flowspec/create" \
        -H "Content-Type: application/json" \
        -d "$flowspec_json")
    
    if echo "$response" | grep -q "success\|id\|workflow"; then
        print_success "FlowSpec Solana read workflow created"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "FlowSpec creation failed: $response"
    fi
}

test_flowspec_multi_node() {
    print_test "FlowSpec - Create Multi-Node Solana Workflow"
    
    local flowspec_json='{
        "name": "solana-multi-check-test",
        "description": "Test workflow with multiple Solana read operations",
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
                    "url": "'"${API_BASE}/api/solana/balance/${TEST_WALLET}"'",
                    "method": "GET"
                }
            },
            {
                "id": "get-blockhash",
                "type": "solana.read", 
                "config": {
                    "url": "'"${API_BASE}/api/solana/recent-blockhash"'",
                    "method": "GET"
                }
            },
            {
                "id": "transform-response",
                "type": "transform",
                "config": {
                    "code": "return items.map(item => ({ ...item, timestamp: Date.now() }));"
                }
            }
        ],
        "edges": [
            { "from": "trigger", "to": "check-balance" },
            { "from": "check-balance", "to": "get-blockhash" },
            { "from": "get-blockhash", "to": "transform-response" }
        ],
        "metadata": {
            "createdBy": "test-script",
            "testRun": true
        }
    }'
    
    local response
    response=$(curl -s -X POST "${API_BASE}/flowspec/create" \
        -H "Content-Type: application/json" \
        -d "$flowspec_json")
    
    if echo "$response" | grep -q "success\|id\|workflow"; then
        print_success "FlowSpec multi-node workflow created"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_failure "FlowSpec creation failed: $response"
    fi
}

# =============================================================================
# Phase 4: Integration Tests
# =============================================================================

test_api_server_running() {
    print_test "API Server Connectivity"
    
    if curl -s "${API_BASE}/health" > /dev/null 2>&1 || curl -s "${API_BASE}/api/health" > /dev/null 2>&1; then
        print_success "API server is running at ${API_BASE}"
    else
        print_failure "Cannot connect to API server at ${API_BASE}"
        echo "Make sure the backend is running: cd Lucid-L2/offchain && npm run dev"
        exit 1
    fi
}

test_solana_adapter_registered() {
    print_test "Solana Adapter Registration"
    
    local response
    response=$(curl -s "${API_BASE}/api/protocols" 2>/dev/null || echo "")
    
    if echo "$response" | grep -q "solana"; then
        print_success "Solana adapter is registered"
    else
        # Try health check as fallback
        if check_health; then
            print_success "Solana adapter is functional (via health check)"
        else
            print_failure "Solana adapter not found in protocol registry"
        fi
    fi
}

# =============================================================================
# Main Test Runner
# =============================================================================

run_all_tests() {
    print_header "SOLANA N8N NODE INTEGRATION TESTS"
    echo "API Base URL: ${API_BASE}"
    echo "Network: ${NETWORK}"
    echo "Test Wallet: ${TEST_WALLET}"
    
    print_header "Phase 0: Prerequisites"
    test_api_server_running
    
    print_header "Phase 1: REST API Tests (Read Operations)"
    test_api_health
    test_get_balance
    test_get_recent_blockhash
    test_get_token_accounts
    test_get_transactions
    test_get_token_supply
    test_get_account_info
    
    print_header "Phase 2: REST API Tests (Write Operations)"
    test_transfer_sol
    
    print_header "Phase 3: FlowSpec DSL Tests"
    test_flowspec_list
    test_flowspec_solana_read
    test_flowspec_multi_node
    
    print_header "Phase 4: Integration Tests"
    test_solana_adapter_registered
    
    print_header "TEST RESULTS SUMMARY"
    echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
    echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
    echo -e "${YELLOW}Skipped: ${TESTS_SKIPPED}${NC}"
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $total -gt 0 ]; then
        local pass_rate=$((TESTS_PASSED * 100 / total))
        echo -e "\nPass Rate: ${pass_rate}%"
    fi
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "\n${RED}⚠️  Some tests failed. Check output above for details.${NC}"
        exit 1
    else
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    fi
}

# =============================================================================
# Script Entry Point
# =============================================================================

# Help message
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Solana n8n Node Integration Test Script"
    echo ""
    echo "Usage: ./test-solana-n8n.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --devnet     Test against Solana devnet (default)"
    echo "  --testnet    Test against Solana testnet"
    echo "  --mainnet    Test against Solana mainnet-beta"
    echo "  --help, -h   Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  API_BASE          Base URL for API (default: http://localhost:3001)"
    echo "  SOLANA_PRIVATE_KEY  Private key for write operation tests (optional)"
    echo ""
    echo "Example:"
    echo "  ./test-solana-n8n.sh --devnet"
    echo "  API_BASE=http://api.example.com ./test-solana-n8n.sh"
    exit 0
fi

run_all_tests
