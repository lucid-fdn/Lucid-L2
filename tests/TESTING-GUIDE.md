# Lucid L2 Onchain Testing Guide

Complete guide for testing all Solana onchain programs in the Lucid L2 ecosystem.

## Overview

This testing infrastructure provides production-ready test suites for:
- **thought-epoch**: Merkle root commitment system
- **gas-utils**: Token burning and gas distribution
- **lucid-passports**: AI asset passport management

## Prerequisites

1. **Solana CLI Tools** installed and configured
2. **Anchor 0.31.1** installed
3. **Node.js 18+** and npm
4. **Devnet SOL** in your wallet for testing
5. **LUCID Token Mint**: `7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9`

## Installation

```bash
cd Lucid-L2/tests
npm install
```

## Running Tests

### All Tests
```bash
cd Lucid-L2/tests
npm test
```

### Individual Test Suites

**Thought Epoch Tests**
```bash
npm run test:thought-epoch
```

**Gas Utils Tests**
```bash
npm run test:gas-utils
```

**Lucid Passports Tests**
```bash
npm run test:passports
```

**Integration Tests**
```bash
npm run test:integration
```

**Devnet Validation**
```bash
npm run test:devnet
```

## Test Structure

```
tests/
├── helpers/
│   ├── fixtures.ts          # Test utilities and fixtures
│   └── assertions.ts         # Custom assertion functions
├── thought-epoch-complete.test.ts
├── gas-utils-complete.test.ts
├── lucid-passports-complete.test.ts
├── integration/
│   └── end-to-end.test.ts
└── devnet/
    └── validation.test.ts
```

## Configuration

### RPC Endpoint

Tests are configured to use the QuikNode RPC endpoint:
```
https://virulent-icy-darkness.solana-mainnet.quiknode.pro/02db76ea26aebfe00b1557d88462e7e398356139/
```

### Test Wallet

Tests use the default Anchor wallet at:
```
~/.config/solana/id.json
```

Ensure this wallet has sufficient devnet SOL:
```bash
solana airdrop 2
```

## Test Coverage

### Thought Epoch Program

- ✅ Single epoch commitment
- ✅ Batch epoch commitments (up to 16)
- ✅ PDA derivation validation
- ✅ Authority verification
- ✅ Error handling (oversized batches)
- ✅ Edge cases (zero/max values)

### Gas Utils Program

- ✅ Token burning mechanics
- ✅ Recipient share validation
- ✅ Multiple recipient distribution (1-10)
- ✅ Percentage validation (must sum to 100)
- ✅ Arithmetic overflow protection
- ✅ Event emission verification

### Lucid Passports Program

- ✅ Passport registration (all asset types)
- ✅ Metadata updates
- ✅ Version linking
- ✅ Attestation additions
- ✅ Status transitions
- ✅ Authorization checks
- ✅ String length validations
- ✅ Policy flags verification

## Devnet Testing Workflow

### 1. Deploy Programs

```bash
cd Lucid-L2
anchor build
anchor deploy --provider.cluster devnet
```

### 2. Verify Deployment

```bash
# Check thought-epoch deployment
solana program show GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo --url devnet

# Verify program IDs match Anchor.toml
```

### 3. Run Test Suite

```bash
cd tests
npm test
```

### 4. Verify Results

Check that all tests pass and review:
- Transaction signatures
- Account state changes
- Event emissions
- Gas consumption

## Common Issues and Solutions

### Issue: "Insufficient funds"

**Solution**: Airdrop more SOL to your test wallet
```bash
solana airdrop 2
```

### Issue: "Account not found"

**Solution**: Ensure programs are deployed to devnet
```bash
anchor deploy --provider.cluster devnet
```

### Issue: "Transaction simulation failed"

**Solution**: 
1. Check program logs with `--skip-preflight`
2. Verify account ownership
3. Ensure sufficient token balances

### Issue: "RPC node request limit exceeded"

**Solution**: Wait a few minutes or use a different RPC endpoint

## Writing New Tests

### Test Template

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  generateMerkleRoot,
  confirmTransaction
} from "./helpers/fixtures";
import {
  assertPublicKeyEquals,
  TestResultsLogger
} from "./helpers/assertions";

describe("Your Test Suite", () => {
  const provider = anchor.AnchorProvider.local("YOUR_RPC_URL");
  anchor.setProvider(provider);
  
  const program = anchor.workspace.YourProgram as Program;
  const logger = new TestResultsLogger();
  
  it("should test something", async () => {
    const endTest = logger.startTest("Test name");
    
    try {
      // Your test logic here
      
      endTest();
    } catch (error) {
      logger.recordFailure("Test name", error.toString(), 0);
      throw error;
    }
  });
  
  after(() => {
    logger.printSummary();
  });
});
```

## Best Practices

### 1. Use Fixtures

Always use helper functions for common operations:
```typescript
import { generateMerkleRoot, createFundedWallet } from "./helpers/fixtures";

const root = generateMerkleRoot(42);
const wallet = await createFundedWallet(connection, 2);
```

### 2. Assert Thoroughly

Use custom assertions for clarity:
```typescript
assertBytesEqual(actual, expected, "Merkle roots should match");
assertPublicKeyEquals(account.owner, expectedOwner);
```

### 3. Handle Errors Gracefully

Always catch and log errors properly:
```typescript
try {
  await program.methods.someInstruction().rpc();
  endTest();
} catch (error) {
  logger.recordFailure("Test name", error.toString(), 0);
  throw error;
}
```

### 4. Confirm Transactions

Always confirm transactions before assertions:
```typescript
const tx = await program.methods.commitEpoch(root).rpc();
await confirmTransaction(provider.connection, tx);
```

### 5. Test Edge Cases

Don't just test happy paths:
```typescript
// Test boundary conditions
it("should handle maximum batch size", async () => {
  const maxRoots = generateMerkleRoots(16);
  // ...
});

// Test error conditions
it("should reject oversized batch", async () => {
  try {
    const tooMany = generateMerkleRoots(17);
    await program.methods.commitEpochs(tooMany).rpc();
    throw new Error("Should have failed");
  } catch (error) {
    expect(error.toString()).to.include("BatchTooLarge");
  }
});
```

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: Test Onchain Programs

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install Solana
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
          export PATH="/home/runner/.local/share/solana/install/active_release/bin:$PATH"
      - name: Install Anchor
        run: |
          cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
          avm install 0.31.1
          avm use 0.31.1
      - name: Run Tests
        run: |
          cd Lucid-L2/tests
          npm install
          npm test
```

## Performance Benchmarks

Expected test execution times:
- **Thought Epoch**: ~30 seconds
- **Gas Utils**: ~45 seconds
- **Lucid Passports**: ~60 seconds
- **Integration**: ~90 seconds
- **Total**: ~3-4 minutes

## Troubleshooting

### Enable Verbose Logging

```bash
ANCHOR_LOG=true npm test
```

### Skip Preflight Checks

For detailed error messages:
```typescript
await program.methods
  .commitEpoch(root)
  .rpc({ skipPreflight: true });
```

### Check Program Logs

```bash
solana logs --url devnet
```

## Additional Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Web3.js Guide](https://solana-labs.github.io/solana-web3.js/)
- [Mocha Test Framework](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)

## Support

For issues or questions:
1. Check this guide first
2. Review program source code
3. Check Solana devnet status
4. Review transaction logs
5. Report bugs with full error logs
