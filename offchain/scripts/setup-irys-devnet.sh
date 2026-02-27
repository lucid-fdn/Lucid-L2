#!/bin/bash
# =============================================================================
# Irys Devnet Setup Script
# Run this once to fund the Irys devnet account.
# If airdrop fails (rate limit), try again in a few hours or visit:
#   https://faucet.solana.com
# =============================================================================

set -e

KEYPAIR="$(dirname "$0")/../keys/irys-keypair.json"
PUBKEY=$(solana-keygen pubkey "$KEYPAIR")

echo "=== Irys Devnet Setup ==="
echo "Keypair: $KEYPAIR"
echo "Public key: $PUBKEY"
echo ""

# Step 1: Airdrop devnet SOL
echo "Step 1: Requesting 1 SOL airdrop on devnet..."
if solana airdrop 1 "$PUBKEY" --url devnet 2>/dev/null; then
  echo "  Airdrop successful!"
else
  echo "  Airdrop failed (rate limit). Try one of these alternatives:"
  echo "    1. Visit https://faucet.solana.com and paste: $PUBKEY"
  echo "    2. Wait a few hours and run this script again"
  echo "    3. Transfer devnet SOL from another wallet:"
  echo "       solana transfer $PUBKEY 1 --url devnet --keypair <your-other-keypair>"
  echo ""

  BALANCE=$(solana balance "$PUBKEY" --url devnet 2>/dev/null | awk '{print $1}')
  if [ "$BALANCE" = "0" ]; then
    echo "  Balance is 0. Cannot proceed. Fund the account first."
    exit 1
  fi
  echo "  Current balance: $BALANCE SOL. Proceeding with existing balance."
fi

echo ""
echo "Step 2: Checking devnet SOL balance..."
solana balance "$PUBKEY" --url devnet

echo ""
echo "Step 3: Funding Irys devnet node..."
irys fund 500000000 \
  -n devnet \
  -t solana \
  -w "$KEYPAIR" \
  --provider-url https://api.devnet.solana.com \
  --no-confirmation

echo ""
echo "Step 4: Checking Irys balance..."
irys balance "$PUBKEY" \
  -n devnet \
  -t solana \
  -h https://devnet.irys.xyz \
  --provider-url https://api.devnet.solana.com

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add these env vars to Railway:"
echo "  DEPIN_PERMANENT_PROVIDER=arweave"
echo "  IRYS_NETWORK=devnet"
echo "  IRYS_TOKEN=solana"
echo "  IRYS_PRIVATE_KEY=$(cat "$KEYPAIR")"
