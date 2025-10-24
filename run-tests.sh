#!/bin/bash

# Lucid L2 Onchain Test Runner
# Run tests from the correct directory with proper environment

set -e

# Set ANCHOR_WALLET if not already set
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

echo "🧪 Running Lucid L2 Onchain Tests"
echo "=================================="
echo "Anchor Wallet: $ANCHOR_WALLET"
echo "Working Directory: $(pwd)"
echo ""

# Run tests using mocha directly from Lucid-L2 directory
cd "$(dirname "$0")"

# Check if Anchor.toml exists
if [ ! -f "Anchor.toml" ]; then
    echo "❌ Error: Anchor.toml not found. Must run from Lucid-L2 directory."
    exit 1
fi

# Run JavaScript test using anchor test
anchor test --skip-build --skip-deploy --skip-local-validator -- tests/thought-epoch-devnet.test.js

echo ""
echo "✅ Test execution complete"
