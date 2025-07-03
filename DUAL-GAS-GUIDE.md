# Dual-Gas Metering System Guide

## Overview

The Lucid L2™ dual-gas system implements native $LUCID token burning for both compute (iGas) and memory (mGas) operations. This provides transparent, tunable gas metering while maintaining compatibility with Solana's ComputeBudgetProgram.

## Architecture

### Gas Types
- **iGas (Inference Gas)**: Burned for compute operations
  - Single calls: 1 LUCID per inference
  - Batch operations: 2 LUCID per batch (flat rate)
- **mGas (Memory Gas)**: Burned for memory writes
  - 5 LUCID per thought epoch root stored

### Implementation Pattern
```typescript
// 1. Create compute budget instruction (Solana CU)
const computeIx = makeComputeIx();

// 2. Create burn instructions for dual-gas
const igasIx = makeBurnIx(userAta, LUCID_MINT, authority, iGasAmount);
const mgasIx = makeBurnIx(userAta, LUCID_MINT, authority, mGasAmount);

// 3. Execute transaction with pre-instructions
await program.methods
  .commitEpoch([...rootBytes])
  .accounts({...})
  .preInstructions([computeIx, igasIx, mgasIx])
  .rpc();
```

## File Structure

```
offchain/src/
├── gas.ts              # Centralized gas logic and configuration
├── index.ts            # HTTP API with dual-gas integration
├── batch.ts            # Batch operations with gas optimization
├── cli.ts              # CLI commands with gas cost display
└── setup-lucid-mint.js # Configuration script for LUCID mint
```

## Configuration

### 1. Set LUCID Mint Address

```bash
cd offchain
node setup-lucid-mint.js <YOUR_LUCID_MINT_ADDRESS>
```

### 2. Adjust Gas Rates

Edit `offchain/src/gas.ts`:

```typescript
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation
```

## Usage Examples

### Single Inference Call
```bash
npm run cli run "Hello Lucid!"
# Output: 💰 Gas cost: 1 iGas + 5 mGas = 6 $LUCID
```

### Batch Operations
```bash
npm run cli batch "Hello" "Lucid" "World"
# Output: 💰 Batch gas cost: 2 iGas + 15 mGas = 17 $LUCID
```

### HTTP API
```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"text":"Hi Lucid!"}'
```

## Gas Cost Calculation

The system provides transparent gas cost calculation:

```typescript
import { calculateGasCost } from './gas';

// Single operation
const singleCost = calculateGasCost('single', 1);
// { iGas: 1, mGas: 5, total: 6 }

// Batch operation (3 roots)
const batchCost = calculateGasCost('batch', 3);
// { iGas: 2, mGas: 15, total: 17 }
```

## Development Workflow

### 1. Local Development
```bash
# Start Solana test validator
solana-test-validator --reset --quiet &

# Configure LUCID mint (use a test mint for development)
node setup-lucid-mint.js 11111111111111111111111111111112

# Start development server
npm start
```

### 2. Testing
```bash
# Test CLI functionality
npm run cli wallet
npm run cli run "Test message"

# Test batch operations
npm run cli batch "Test1" "Test2" "Test3"
```

### 3. Production Setup
```bash
# Deploy your LUCID token mint
# Configure the mint address
node setup-lucid-mint.js <PRODUCTION_MINT_ADDRESS>

# Ensure wallets have LUCID tokens
# Deploy and test
```

## Error Handling

Common issues and solutions:

### Invalid Mint Address
```
Error: Non-base58 character
```
**Solution**: Use `node setup-lucid-mint.js <VALID_MINT_ADDRESS>`

### Insufficient LUCID Balance
```
Error: Insufficient funds
```
**Solution**: Ensure wallet has enough LUCID tokens for gas costs

### Missing Associated Token Account
```
Error: Account not found
```
**Solution**: Create ATA for LUCID mint before first transaction

## Gas Optimization

### Batch Operations
- Single call: 6 LUCID (1 iGas + 5 mGas)
- 3-item batch: 17 LUCID (2 iGas + 15 mGas)
- **Savings**: 1 LUCID per batch vs individual calls

### Tuning Recommendations
- **iGas**: Adjust based on actual compute complexity
- **mGas**: Scale with storage costs and value
- **Batch rates**: Optimize for transaction throughput

## Integration Points

### Frontend Integration
```typescript
import { calculateGasCost, LUCID_MINT } from './gas';

// Display gas costs to users
const cost = calculateGasCost('single', 1);
console.log(`Cost: ${cost.total} LUCID (${cost.iGas} iGas + ${cost.mGas} mGas)`);
```

### Monitoring
- Track gas consumption patterns
- Monitor LUCID token burn rates
- Optimize gas parameters based on usage

## Future Enhancements

### Phase 3 Roadmap
1. **On-chain Gas Validation**: Move burn logic to Solana program
2. **Dynamic Gas Pricing**: Adjust rates based on network conditions
3. **Gas Rebates**: Reward efficient usage patterns
4. **Multi-token Support**: Accept multiple tokens for gas payments

### Advanced Features
- Gas estimation API endpoints
- Historical gas usage analytics
- Automated gas parameter tuning
- Cross-chain gas bridging

## Troubleshooting

### Development Issues
1. **TypeScript Errors**: Ensure all dependencies are installed
2. **Network Issues**: Verify Solana test validator is running
3. **Token Issues**: Check LUCID mint configuration

### Production Issues
1. **High Gas Costs**: Review and adjust gas parameters
2. **Transaction Failures**: Monitor Solana network status
3. **Token Supply**: Ensure adequate LUCID token liquidity

## Support

For issues or questions:
1. Check this guide first
2. Review error messages and logs
3. Verify configuration with `npm run cli wallet`
4. Test with minimal examples before complex operations
