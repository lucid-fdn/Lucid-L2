# Complete Plan: Deploy and Test All Onchain Components

## Phase 1: Install Required Tools (15 minutes)

### Step 1.1: Install Solana CLI Tools

```bash
# Download and install Solana
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Add to PATH
export PATH="/home/admin/.local/share/solana/install/active_release/bin:$PATH"

# Add to ~/.bashrc for persistence
echo 'export PATH="/home/admin/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# Verify installation
solana --version
# Should show: solana-cli 1.18.0

# Verify cargo build-sbf is available
cargo build-sbf --version
# Should show version info
```

### Step 1.2: Configure Solana for Devnet

```bash
# Set cluster to devnet
solana config set --url https://api.devnet.solana.com

# Verify configuration
solana config get
# Should show:
# RPC URL: https://api.devnet.solana.com
# WebSocket URL: wss://api.devnet.solana.com/
# Keypair Path: /home/admin/.config/solana/id.json
# Commitment: confirmed
```

### Step 1.3: Ensure Wallet Has Devnet SOL

```bash
# Check current balance
solana balance

# If balance is low, request airdrop
solana airdrop 2

# Verify balance
solana balance
# Should show at least 2 SOL
```

**Verification**: Run these commands and ensure no errors:
```bash
solana --version
cargo build-sbf --version
solana balance
```

---

## Phase 2: Build All Programs (10 minutes)

### Step 2.1: Clean Previous Builds

```bash
cd Lucid-L2
rm -rf target/deploy/*.so
rm -rf target/idl/*.json
```

### Step 2.2: Build All Three Programs

```bash
# Build all programs at once
anchor build

# Expected output:
# Compiling thought-epoch v0.1.0
# Compiling gas-utils v0.1.0
# Compiling lucid-passports v0.1.0
# ...
# Build successful
```

### Step 2.3: Verify Build Artifacts

```bash
# Check .so files exist
ls -lh target/deploy/
# Should show:
# thought_epoch.so
# gas_utils.so
# lucid_passports.so

# Check IDL files exist
ls -lh target/idl/
# Should show:
# thought_epoch.json
# gas_utils.json
# lucid_passports.json
```

**Verification**: All 3 `.so` files and 3 `.json` files should exist

---

## Phase 3: Deploy Programs to Devnet (20 minutes)

### Step 3.1: Deploy Thought-Epoch

```bash
cd Lucid-L2
anchor deploy --provider.cluster devnet --program-name thought_epoch

# Expected output:
# Deploying cluster: https://api.devnet.solana.com
# Upgrade authority: /home/admin/.config/solana/id.json
# Deploying program "thought_epoch"...
# Program Id: <NEW_PROGRAM_ID>
# Deploy success
```

**IMPORTANT**: Copy the Program Id from output!

### Step 3.2: Deploy Gas-Utils

```bash
anchor deploy --provider.cluster devnet --program-name gas_utils

# Copy the Program Id from output
```

### Step 3.3: Deploy Lucid-Passports

```bash
anchor deploy --provider.cluster devnet --program-name lucid_passports

# Copy the Program Id from output
```

### Step 3.4: Update Anchor.toml

Edit `Anchor.toml` and replace the placeholder IDs:

```toml
[programs.devnet]
thought_epoch = "<COPY_FROM_DEPLOY_OUTPUT>"
gas_utils = "<COPY_FROM_DEPLOY_OUTPUT>"
lucid_passports = "<COPY_FROM_DEPLOY_OUTPUT>"
```

Save the file.

### Step 3.5: Update Program declare_id! Macros

Edit each program's `lib.rs` file:

**programs/thought-epoch/src/lib.rs**:
```rust
declare_id!("<THOUGHT_EPOCH_PROGRAM_ID>");
```

**programs/gas-utils/src/lib.rs**:
```rust
declare_id!("<GAS_UTILS_PROGRAM_ID>");
```

**programs/lucid-passports/src/lib.rs**:
```rust
declare_id!("<PASSPORTS_PROGRAM_ID>");
```

### Step 3.6: Rebuild with Correct IDs

```bash
anchor build
```

### Step 3.7: Upgrade Deployed Programs

```bash
anchor upgrade target/deploy/thought_epoch.so --provider.cluster devnet --program-id <THOUGHT_EPOCH_ID>
anchor upgrade target/deploy/gas_utils.so --provider.cluster devnet --program-id <GAS_UTILS_ID>
anchor upgrade target/deploy/lucid_passports.so --provider.cluster devnet --program-id <PASSPORTS_ID>
```

**Verification**: Verify all programs exist on devnet:
```bash
solana program show <THOUGHT_EPOCH_ID> --url devnet
solana program show <GAS_UTILS_ID> --url devnet
solana program show <PASSPORTS_ID> --url devnet
```

All three should return program info, NOT "Unable to find the account"

---

## Phase 4: Run Tests (5 minutes)

### Step 4.1: Test Thought-Epoch

```bash
cd Lucid-L2
anchor test --skip-build --skip-deploy --skip-local-validator
```

**Expected output**:
```
  Thought Epoch - Devnet Tests
    ✓ should commit a single Merkle root on-chain
    ✓ should commit batch of Merkle roots
    ✓ should handle maximum batch size (16 roots)
    ✓ should reject oversized batch (17 roots)
    ✓ should handle edge case: all-zero root
    ✓ should handle edge case: all-ones root
    ✓ should update existing epoch record

  7 passing (15s)
```

### Step 4.2: Create and Run Gas-Utils Tests

Create `tests/gas-utils-devnet.test.js`:

```javascript
const anchor = require('@coral-xyz/anchor');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const assert = require('assert');

describe('Gas Utils - Devnet Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GasUtils;

  it('should validate recipient percentages', async () => {
    // Test percentage validation
    const recipients = [
      { recipient: anchor.web3.Keypair.generate().publicKey, percentage: 50 },
      { recipient: anchor.web3.Keypair.generate().publicKey, percentage: 50 }
    ];
    
    // Implementation here - tests gas collection and distribution
  });
});
```

Run:
```bash
anchor test --skip-build --skip-deploy --skip-local-validator
```

### Step 4.3: Create and Run Lucid-Passports Tests

Create `tests/lucid-passports-devnet.test.js`:

```javascript
const anchor = require('@coral-xyz/anchor');
const assert = require('assert');

describe('Lucid Passports - Devnet Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LucidPassports;

  it('should register a passport', async () => {
    // Test passport registration
    const assetType = { model: {} };
    const slug = 'test-model-' + Date.now();
    const version = { major: 1, minor: 0, patch: 0 };
    
    // Implementation here
  });
});
```

Run:
```bash
anchor test --skip-build --skip-deploy --skip-local-validator
```

---

## Phase 5: Verification (5 minutes)

### Final Verification Checklist

Run each command and verify results:

```bash
# 1. All programs queryable on devnet
solana program show <THOUGHT_EPOCH_ID> --url devnet  # Should show program info
solana program show <GAS_UTILS_ID> --url devnet      # Should show program info
solana program show <PASSPORTS_ID> --url devnet      # Should show program info

# 2. All tests pass
cd Lucid-L2
anchor test --skip-build --skip-deploy --skip-local-validator
# Should show "X passing" with no failures

# 3. Can interact with programs manually
cd Lucid-L2
node tests/commit-epoch.js
# Should commit and verify successfully
```

---

## Troubleshooting

### Issue: Solana tools not installing

**Fix**:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### Issue: Anchor build fails

**Fix**:
```bash
# Check Rust version
rustc --version
# Should be 1.70+

# Update if needed
rustup update stable

# Try build again
anchor build
```

### Issue: Deployment fails "insufficient funds"

**Fix**:
```bash
solana airdrop 5
# Wait a few seconds
solana airdrop 5
# Deployments need ~2-3 SOL total
```

### Issue: Program upgrade fails "incorrect authority"

**Fix**:
- Ensure you're using the same wallet that deployed
- Check: `solana address`
- Should match the deployment authority

### Issue: Tests can't find programs

**Fix**:
1. Verify Anchor.toml has correct IDs
2. Verify programs exist: `solana program show <ID> --url devnet`
3. Check provider.cluster in Anchor.toml is "devnet"

---

## Complete Command Sequence

Here's the complete sequence to go from current state to fully tested:

```bash
# ====================
# PHASE 1: INSTALL
# ====================

# Install Solana tools
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
export PATH="/home/admin/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="/home/admin/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# Configure for devnet
solana config set --url https://api.devnet.solana.com

# Get devnet SOL
solana airdrop 5

# Verify
solana --version
cargo build-sbf --version
solana balance

# ====================
# PHASE 2: BUILD
# ====================

cd Lucid-L2
anchor build

# Verify .so files created
ls target/deploy/*.so

# ====================
# PHASE 3: DEPLOY
# ====================

# Deploy each program
anchor deploy --provider.cluster devnet --program-name thought_epoch
# Copy Program Id: <THOUGHT_EPOCH_ID>

anchor deploy --provider.cluster devnet --program-name gas_utils  
# Copy Program Id: <GAS_UTILS_ID>

anchor deploy --provider.cluster devnet --program-name lucid_passports
# Copy Program Id: <PASSPORTS_ID>

# Update Anchor.toml with the three Program IDs

# Update declare_id! in each program's lib.rs
# Then rebuild and upgrade:
anchor build

anchor upgrade target/deploy/thought_epoch.so --provider.cluster devnet --program-id <THOUGHT_EPOCH_ID>
anchor upgrade target/deploy/gas_utils.so --provider.cluster devnet --program-id <GAS_UTILS_ID>
anchor upgrade target/deploy/lucid_passports.so --provider.cluster devnet --program-id <PASSPORTS_ID>

# ====================
# PHASE 4: VERIFY
# ====================

# Verify deployments
solana program show <THOUGHT_EPOCH_ID> --url devnet
solana program show <GAS_UTILS_ID> --url devnet
solana program show <PASSPORTS_ID> --url devnet

# ====================
# PHASE 5: TEST
# ====================

# Run all tests
anchor test --skip-build --skip-deploy --skip-local-validator

# Should see:
#   Thought Epoch - Devnet Tests
#     ✓ 7 tests passing
#   (and more tests if gas-utils and passports tests created)
```

---

## Time Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | Install Solana tools | 10-15 min |
| 2 | Build programs | 5-10 min |
| 3 | Deploy to devnet | 15-20 min |
| 4 | Create remaining tests | 20-30 min |
| 5 | Run and verify tests | 5-10 min |
| **Total** | | **55-85 minutes** |

---

## Success Criteria

You'll know everything is working when:

1. ✅ All three programs show on devnet:
   ```bash
   solana program show <ID> --url devnet
   # Returns program info (not "account not found")
   ```

2. ✅ Tests execute and pass:
   ```bash
   anchor test --skip-build --skip-deploy --skip-local-validator
   # Shows "X passing (Ys)" with no failures
   ```

3. ✅ Can interact with programs manually:
   ```bash
   # Example: commit an epoch
   cd Lucid-L2/offchain
   node -e "const {commitThoughtEpoch} = require('./src/solana/client'); commitThoughtEpoch('test', '127.0.0.1').then(console.log);"
   # Should return transaction signature
   ```

4. ✅ Can view transactions on Solana Explorer:
   - Navigate to https://explorer.solana.com/?cluster=devnet
   - Search for your wallet address
   - See successful transactions

---

## Quick Start Script

Create `Lucid-L2/deploy-and-test.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Complete Deployment and Testing Pipeline"
echo "=========================================="

# Phase 1: Prerequisites check
echo ""
echo "📋 Phase 1: Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "❌ Solana CLI not installed. Run: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "❌ Anchor not installed"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "❌ Cargo not installed"; exit 1; }
echo "✅ All tools installed"

# Phase 2: Build
echo ""
echo "🔨 Phase 2: Building programs..."
cd "$(dirname "$0")"
anchor build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build successful"

# Phase 3: Deploy
echo ""
echo "🌐 Phase 3: Deploying to devnet..."
echo "Deploying thought-epoch..."
THOUGHT_EPOCH_ID=$(anchor deploy --provider.cluster devnet --program-name thought_epoch 2>&1 | grep "Program Id:" | awk '{print $3}')
echo "  Program ID: $THOUGHT_EPOCH_ID"

echo "Deploying gas-utils..."
GAS_UTILS_ID=$(anchor deploy --provider.cluster devnet --program-name gas_utils 2>&1 | grep "Program Id:" | awk '{print $3}')
echo "  Program ID: $GAS_UTILS_ID"

echo "Deploying lucid-passports..."
PASSPORTS_ID=$(anchor deploy --provider.cluster devnet --program-name lucid_passports 2>&1 | grep "Program Id:" | awk '{print $3}')
echo "  Program ID: $PASSPORTS_ID"

echo "✅ All programs deployed"

# Phase 4: Update configuration
echo ""
echo "📝 Phase 4: Update Anchor.toml with deployed IDs"
echo ""
echo "ADD THESE TO Anchor.toml [programs.devnet]:"
echo "thought_epoch = \"$THOUGHT_EPOCH_ID\""
echo "gas_utils = \"$GAS_UTILS_ID\""
echo "lucid_passports = \"$PASSPORTS_ID\""
echo ""
echo "PRESS ENTER after updating Anchor.toml..."
read

# Phase 5: Verify
echo ""
echo "✅ Phase 5: Verifying deployments..."
solana program show $THOUGHT_EPOCH_ID --url devnet
solana program show $GAS_UTILS_ID --url devnet
solana program show $PASSPORTS_ID --url devnet

# Phase 6: Test
echo ""
echo "🧪 Phase 6: Running tests..."
anchor test --skip-build --skip-deploy --skip-local-validator

echo ""
echo "=================================="
echo "✅ Deployment and Testing Complete"
echo "=================================="
```

Make it executable:
```bash
chmod +x Lucid-L2/deploy-and-test.sh
```

Run it:
```bash
cd Lucid-L2
./deploy-and-test.sh
```

---

## What You'll Have After Completion

### Deployed Programs ✅
- Thought-Epoch on devnet with real ID
- Gas-Utils on devnet with real ID
- Lucid-Passports on devnet with real ID

### Working Tests ✅
- 7 tests for thought-epoch (passing)
- Tests for gas-utils (to be created)
- Tests for lucid-passports (to be created)

### Verification Methods ✅
- `anchor test` runs successfully
- `solana program show` confirms deployments
- Manual transactions work
- Solana Explorer shows activity

---

## Alternative: Use Docker (If Tool Installation Fails)

If installing Solana tools locally is problematic, use Docker:

```bash
# Pull Solana dev image
docker pull solanalabs/solana:v1.18.0

# Run build in container
docker run -v $(pwd)/Lucid-L2:/workspace -w /workspace solanalabs/solana:v1.18.0 anchor build

# Deploy from container
docker run -v $(pwd)/Lucid-L2:/workspace -v ~/.config/solana:/root/.config/solana -w /workspace solanalabs/solana:v1.18.0 anchor deploy --provider.cluster devnet
```

---

## Summary

**Current State**: Testing infrastructure ready, programs not deployed

**Action Plan**:
1. Install Solana CLI tools (15 min)
2. Build programs (10 min)
3. Deploy to devnet (20 min)  
4. Run tests (5 min)
5. Verify everything works (5 min)

**Total Time**: ~1 hour

**After Completion**: All onchain components will be tested and verified working

**Next Step**: Run the commands in Phase 1 to install Solana tools
