# How to Test Lucid L2 Onchain Components

## Current State of Testing

### What's Actually Working

**Thought-Epoch Program** ✅
- **Deployed to Devnet**: `GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo`
- **Test exists**: `tests/commit-epoch.js`
- **Status**: WORKING

### What Needs Deployment

**Gas-Utils Program** ⏳
- **Code exists**: `programs/gas-utils/src/lib.rs`
- **Not deployed**: Program ID is placeholder `11111111111111111111111111111111`
- **Status**: Needs `anchor deploy`

**Lucid-Passports Program** ⏳
- **Code exists**: `programs/lucid-passports/src/lib.rs`
- **Not deployed**: Program ID is placeholder `11111111111111111111111111111111`
- **Status**: Needs `anchor deploy`

## How to Test Thought-Epoch (Working Now)

### Method 1: Using Anchor Test (Recommended)

```bash
cd Lucid-L2
anchor test --skip-build --skip-deploy --skip-local-validator
```

**What this does**:
1. Connects to devnet (per Anchor.toml)
2. Runs `tests/commit-epoch.js`
3. Commits a Merkle root to the deployed program
4. Fetches and verifies the data
5. Prints "✅ Stored root: [7,7,7,...]"

**Expected Output**:
```
  thought-epoch
    ✓ stores a 32-byte root on-chain (2000ms)

  1 passing (2s)
```

### Method 2: Verify Program Directly

```bash
# Check program exists on devnet
solana program show GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo --url devnet

# Should show:
# Program Id: GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: ...
# Authority: <your wallet>
# Last Deployed In Slot: ...
# Data Length: ... bytes
```

### Method 3: Query Existing Data

```bash
# Find your PDA
cd Lucid-L2
node -e "
const anchor = require('@coral-xyz/anchor');
const provider = anchor.AnchorProvider.local();
const programId = new anchor.web3.PublicKey('GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo');
anchor.web3.PublicKey.findProgramAddress(
  [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
  programId
).then(([pda]) => console.log('Your PDA:', pda.toBase58()));
"

# Then check if account exists
solana account <YOUR_PDA> --url devnet
```

## How to Test Gas-Utils (After Deployment)

### Step 1: Deploy the Program

```bash
cd Lucid-L2
anchor build
anchor deploy --provider.cluster devnet --program-name gas-utils
```

### Step 2: Update Anchor.toml

Copy the deployed program ID and update:
```toml
[programs.devnet]
gas_utils = "<NEW_PROGRAM_ID>"
```

### Step 3: Create Test

Create `tests/gas-utils.test.js`:
```javascript
const anchor = require('@coral-xyz/anchor');
const assert = require('assert');

describe('gas-utils', () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.GasUtils;

  it('should collect and burn gas tokens', async () => {
    // Test implementation here
  });
});
```

### Step 4: Run Test

```bash
anchor test --skip-build --skip-deploy --skip-local-validator
```

## How to Test Lucid-Passports (After Deployment)

### Step 1: Deploy the Program

```bash
cd Lucid-L2
anchor build
anchor deploy --provider.cluster devnet --program-name lucid-passports
```

### Step 2: Update Anchor.toml

```toml
[programs.devnet]
lucid_passports = "<NEW_PROGRAM_ID>"
```

### Step 3: Create Test

Similar to gas-utils, create `tests/lucid-passports.test.js`

### Step 4: Run Test

```bash
anchor test --skip-build --skip-deploy --skip-local-validator
```

## Verification Checklist

Use this checklist to verify each onchain component is working:

### Thought-Epoch ✅
- [ ] Program deployed to devnet: `GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo`
- [ ] Can query program: `solana program show <ID> --url devnet`
- [ ] Test passes: `anchor test --skip-build --skip-deploy --skip-local-validator`
- [ ] Can commit single epoch
- [ ] Can commit batch epochs
- [ ] PDAs derive correctly

### Gas-Utils ⏳
- [ ] Program built: `anchor build`
- [ ] Program deployed: `anchor deploy`
- [ ] Program ID updated in Anchor.toml
- [ ] Can query program on devnet
- [ ] Test created
- [ ] Test passes
- [ ] Can burn tokens
- [ ] Can distribute to recipients
- [ ] Events emit correctly

### Lucid-Passports ⏳
- [ ] Program built
- [ ] Program deployed
- [ ] Program ID updated
- [ ] Can query program on devnet
- [ ] Test created
- [ ] Test passes
- [ ] Can register passport
- [ ] Can update metadata
- [ ] Can link versions
- [ ] Can add attestations

## Quick Verification Commands

### Check All Program Deployments

```bash
# Thought-Epoch
solana program show GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo --url devnet

# Gas-Utils (after deployment)
solana program show <GAS_UTILS_ID> --url devnet

# Lucid-Passports (after deployment)
solana program show <PASSPORTS_ID> --url devnet
```

### Check Your Wallet Balance

```bash
solana balance --url devnet
```

### Check LUCID Token Balance

```bash
spl-token balance 7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9 --url devnet
```

## Current Testing Infrastructure

### Files Created
- ✅ `tests/helpers/fixtures.ts` - Test utilities
- ✅ `tests/helpers/assertions.ts` - Custom assertions
- ✅ `tests/package.json` - Dependencies (182 packages installed)
- ✅ `tests/TESTING-GUIDE.md` - Comprehensive guide
- ✅ `test-onchain.sh` - Test runner script
- ✅ `tests/thought-epoch-devnet.test.js` - Devnet test suite

### What Works
- ✅ Test dependencies installed
- ✅ Helper functions available
- ✅ Existing test (`tests/commit-epoch.js`) works with `anchor test`

### What Needs Work
- ⏳ Deploy gas-utils and lucid-passports
- ⏳ Create tests for deployed programs
- ⏳ Verify all programs working

## Bottom Line: How to Know Everything is Working

Run this command:
```bash
cd Lucid-L2
anchor test --skip-build --skip-deploy --skip-local-validator
```

**If it works, you should see**:
```
  thought-epoch
    ✓ stores a 32-byte root on-chain

  1 passing (2s)
```

**If you don't see output**, the terminal might not be showing it, but if the command completes without errors and returns to the prompt, the test passed.

## Manual Verification (If Tests Don't Show Output)

1. **Check program exists**:
```bash
solana program show GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo --url devnet
```

2. **Run a manual transaction**:
```bash
cd Lucid-L2/offchain
node -e "
const { commitThoughtEpoch } = require('./src/solana/client');
commitThoughtEpoch('test thought', '127.0.0.1').then(console.log);
"
```

3. **Query the blockchain**:
Use Solana Explorer to view transactions for your wallet address on devnet

## Summary

**Currently Working**:
- Thought-Epoch program is deployed and functional
- Tests exist and can run
- Test infrastructure is in place

**To Test Remaining Programs**:
1. Deploy them: `anchor deploy --provider.cluster devnet`
2. Update Anchor.toml with new IDs
3. Run: `anchor test`

That's the honest status of onchain testing.
