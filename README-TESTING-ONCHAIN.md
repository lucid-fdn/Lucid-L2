# How to Test Onchain Components - Practical Guide

## TL;DR

**Testing Infrastructure**: ✅ Complete and ready
**Can test now**: ❌ No (Solana toolchain issue)
**Practical solution**: Downgrade Anchor to 0.29.0

## Quick Solution: Downgrade Anchor

The simplest fix is to use Anchor 0.29.0 which has older dependencies compatible with Solana v1.18.18's Rust 1.75:

```bash
cd Lucid-L2

# 1. Update Anchor.toml
# Change: anchor_version = "0.31.1"
# To:     anchor_version = "0.29.0"

# 2. Update program Cargo.toml files
# In each programs/*/Cargo.toml, change:
# anchor-lang = "0.31.1" to anchor-lang = "0.29.0"
# anchor-spl = "0.31.1" to anchor-spl = "0.29.0" (if used)

# 3. Clean and build
rm -rf target programs/*/Cargo.lock
PATH="/home/admin/solana-release/bin:$PATH" anchor build

# 4. Deploy
PATH="/home/admin/solana-release/bin:$PATH" anchor deploy --provider.cluster devnet

# 5. Test
PATH="/home/admin/solana-release/bin:$PATH" anchor test --skip-build --skip-deploy --skip-local-validator
```

## What Was Created For You ✅

### Complete Test Suite
- **7 tests** for thought-epoch program
- **Test utilities** (fixtures, assertions)
- **Documentation** (5 guides)
- **Scripts** (test runners)

### Files Ready to Use
```
tests/thought-epoch-devnet.test.js  # 7 production tests
tests/helpers/fixtures.ts           # Test utilities
tests/helpers/assertions.ts         # Custom validators
```

## How to Actually Test (Step by Step)

### Option 1: Downgrade Anchor (Recommended)

This should work with your current Solana v1.18.18:

1. Edit `Anchor.toml` → change anchor_version to "0.29.0"
2. Edit each `programs/*/Cargo.toml` → change anchor dependencies to 0.29.0
3. Run: `anchor build`
4. Run: `anchor deploy --provider.cluster devnet`
5. Run: `anchor test --skip-build --skip-deploy --skip-local-validator`

### Option 2: Get Help From Team

If you have team members with working Solana setups:

1. Ask them to build and deploy the programs
2. Get the deployed program IDs from them
3. Update your `Anchor.toml` with those IDs
4. Run tests: `anchor test --skip-build --skip-deploy --skip-local-validator`

### Option 3: Test Without Building

If programs are already deployed somewhere:

```bash
# Just run the tests
cd Lucid-L2
anchor test --skip-build --skip-deploy --skip-local-validator
```

## Expected Test Output

When tests work, you'll see:

```
  Thought Epoch - Devnet Tests
🔍 Test Configuration:
   Program ID: <actual-id>
   Wallet: <your-wallet>
   Network: Devnet

📝 Test 1: Single Epoch Commitment
   Root: 42,42,42,42...
   PDA: <pda-address>
   Transaction: <tx-signature>
✅ Single epoch commitment successful

📝 Test 2: Batch Epoch Commitment
   Batch size: 5
   PDA: <pda-address>
   Transaction: <tx-signature>
✅ Batch commitment successful

... (5 more tests)

  7 passing (15s)
```

## Verification Commands

To verify programs are working:

```bash
# Check program exists on devnet
solana program show <PROGRAM_ID> --url devnet

# Check your wallet
solana balance --url devnet

# View transaction on explorer
# Go to: https://explorer.solana.com/?cluster=devnet
# Search your wallet address
```

## The Toolchain Issue Explained

**Problem**: Solana v1.18.18-1.18.22 all use Rust 1.75 internally
**Reality**: Anchor 0.31.1 needs Rust 1.79+
**Solution**: Use Anchor 0.29.0 which works with Rust 1.75

## Next Steps

1. **Try Option 1** (downgrade Anchor) - most likely to work
2. **If that fails**, try Option 2 (get help from team)
3. **Document results** in this file

## Files to Reference

- `TESTING-INFRASTRUCTURE-FINAL-REPORT.md` - Complete status
- `DEPLOYMENT-AND-TESTING-PLAN.md` - Detailed procedures
- `tests/TESTING-GUIDE.md` - How to use the tests

The testing infrastructure is ready. Just need to resolve the build toolchain, then tests will run immediately.
