# GasUtils + CPI Implementation Guide

## Overview
This guide implements the proposed GasUtils program with Cross-Program Invocation (CPI) integration for the Lucid L2 project. The implementation moves gas burning logic from client-side to on-chain, providing better security, flexibility, and maintainability.

## Phase 1: GasUtils Program Implementation

### 1.1 Program Structure
```
programs/
├── thought-epoch/          # Existing core program
└── gas-utils/             # New utility program
    ├── Cargo.toml
    └── src/
        └── lib.rs         # GasUtils with collect_and_split instruction
```

### 1.2 GasUtils Program Code

The GasUtils program (`programs/gas-utils/src/lib.rs`) implements:

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod gas_utils {
    use super::*;

    pub fn collect_and_split(
        ctx: Context<CollectAndSplit>,
        m_gas_amount: u64,
        i_gas_amount: u64,
        recipients: Vec<RecipientSplit>,
    ) -> Result<()> {
        // Implementation details in the actual file
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CollectAndSplit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub gas_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecipientSplit {
    pub recipient: Pubkey,
    pub percentage: u16, // Basis points (10000 = 100%)
}
```

### 1.3 Key Features
- **Flexible Recipients**: Support for multiple recipients with percentage-based splits
- **Gas Collection**: Collects $LUCID tokens from user accounts
- **Automatic Distribution**: Distributes collected gas to specified recipients
- **Validation**: Ensures percentage splits add up to 100%
- **Security**: Proper account validation and ownership checks

## Phase 2: Core Program CPI Integration

### 2.1 Modify thought-epoch Program

Update `programs/thought-epoch/src/lib.rs` to include CPI calls:

```rust
use anchor_lang::prelude::*;
use gas_utils::program::GasUtils;
use gas_utils::{CollectAndSplit, RecipientSplit};

// Add CPI helper function
pub fn invoke_gas_collection(
    ctx: &Context<CommitEpoch>,
    m_gas_amount: u64,
    i_gas_amount: u64,
    recipients: Vec<RecipientSplit>,
) -> Result<()> {
    let cpi_program = ctx.accounts.gas_utils_program.to_account_info();
    let cpi_accounts = CollectAndSplit {
        user: ctx.accounts.user.to_account_info(),
        user_token_account: ctx.accounts.user_token_account.to_account_info(),
        gas_vault: ctx.accounts.gas_vault.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    gas_utils::cpi::collect_and_split(cpi_ctx, m_gas_amount, i_gas_amount, recipients)
}

// Update CommitEpoch instruction
pub fn commit_epoch(ctx: Context<CommitEpoch>, /* other params */) -> Result<()> {
    // Calculate gas requirements
    let recipients = vec![
        RecipientSplit {
            recipient: ctx.accounts.model_publisher.key(),
            percentage: 5000, // 50%
        },
        RecipientSplit {
            recipient: ctx.accounts.memory_provider.key(),
            percentage: 2000, // 20%
        },
        RecipientSplit {
            recipient: ctx.accounts.validator.key(),
            percentage: 3000, // 30%
        },
    ];
    
    // Invoke gas collection via CPI
    invoke_gas_collection(&ctx, m_gas_amount, i_gas_amount, recipients)?;
    
    // Continue with existing epoch logic...
    Ok(())
}
```

### 2.2 Update Account Structures

Add required accounts for CPI:

```rust
#[derive(Accounts)]
pub struct CommitEpoch<'info> {
    // Existing accounts...
    
    // Gas-related accounts
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub gas_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Model publisher account for gas distribution
    pub model_publisher: AccountInfo<'info>,
    
    /// CHECK: Memory provider account for gas distribution
    pub memory_provider: AccountInfo<'info>,
    
    /// CHECK: Validator account for gas distribution
    pub validator: AccountInfo<'info>,
    
    pub gas_utils_program: Program<'info, GasUtils>,
    pub token_program: Program<'info, Token>,
}
```

## Phase 3: Client Integration Updates

### 3.1 Remove Client-Side Gas Burning

Update `offchain/src/solana/gas.ts`:

```typescript
// Remove makeBurnIx function
// export function makeBurnIx(...) { ... } // DELETE THIS

// Update gas calculation to be informational only
export function calculateGasCost(
  operation: 'inference' | 'batch' | 'mmr',
  params: any
): { mGas: number; iGas: number; recipients: RecipientSplit[] } {
  // Calculate gas requirements
  const mGas = /* calculation logic */;
  const iGas = /* calculation logic */;
  
  // Define recipient splits based on operation type
  const recipients = getRecipientSplits(operation);
  
  return { mGas, iGas, recipients };
}

function getRecipientSplits(operation: string): RecipientSplit[] {
  switch (operation) {
    case 'inference':
      return [
        { recipient: MODEL_PUBLISHER_PUBKEY, percentage: 5000 },
        { recipient: MEMORY_PROVIDER_PUBKEY, percentage: 2000 },
        { recipient: VALIDATOR_PUBKEY, percentage: 3000 },
      ];
    case 'batch':
      return [
        { recipient: MODEL_PUBLISHER_PUBKEY, percentage: 4000 },
        { recipient: MEMORY_PROVIDER_PUBKEY, percentage: 3000 },
        { recipient: VALIDATOR_PUBKEY, percentage: 3000 },
      ];
    case 'mmr':
      return [
        { recipient: MODEL_PUBLISHER_PUBKEY, percentage: 3000 },
        { recipient: MEMORY_PROVIDER_PUBKEY, percentage: 2000 },
        { recipient: VALIDATOR_PUBKEY, percentage: 2000 },
        { recipient: PROOF_GENERATOR_PUBKEY, percentage: 3000 },
      ];
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
```

### 3.2 Update Transaction Building

Update `offchain/src/commands/run.ts`:

```typescript
import { calculateGasCost } from '../solana/gas.js';

export async function runInference(params: InferenceParams) {
  // Calculate gas requirements
  const { mGas, iGas, recipients } = calculateGasCost('inference', params);
  
  // Build transaction with CPI call (no separate burn instruction)
  const tx = await buildCommitEpochTransaction({
    ...params,
    mGas,
    iGas,
    recipients,
    // Include gas-related accounts
    userTokenAccount,
    gasVault,
    modelPublisher,
    memoryProvider,
    validator,
    gasUtilsProgram,
  });
  
  // Send transaction
  const signature = await sendTransaction(tx);
  return signature;
}
```

### 3.3 Update CLI Interface

Update `offchain/src/cli.ts`:

```typescript
// Remove gas burning commands
// Remove: program.command('burn-gas')...

// Update existing commands to show gas distribution
program
  .command('run')
  .description('Run inference with automatic gas distribution')
  .option('--show-gas', 'Show gas distribution details')
  .action(async (options) => {
    if (options.showGas) {
      const { mGas, iGas, recipients } = calculateGasCost('inference', {});
      console.log('Gas Distribution:');
      console.log(`M-Gas: ${mGas}, I-Gas: ${iGas}`);
      recipients.forEach(r => {
        console.log(`${r.recipient}: ${r.percentage / 100}%`);
      });
    }
    
    await runInference(options);
  });
```

## Phase 4: Enhanced Features

### 4.1 Dynamic Recipient Configuration

Add configuration management:

```rust
// In gas-utils program
#[account]
pub struct GasConfig {
    pub authority: Pubkey,
    pub default_splits: Vec<RecipientSplit>,
    pub operation_specific_splits: std::collections::HashMap<String, Vec<RecipientSplit>>,
}

pub fn update_gas_config(
    ctx: Context<UpdateGasConfig>,
    operation: String,
    splits: Vec<RecipientSplit>,
) -> Result<()> {
    require!(ctx.accounts.authority.key() == ctx.accounts.config.authority, ErrorCode::Unauthorized);
    
    // Validate splits add up to 100%
    let total: u16 = splits.iter().map(|s| s.percentage).sum();
    require!(total == 10000, ErrorCode::InvalidSplitPercentage);
    
    ctx.accounts.config.operation_specific_splits.insert(operation, splits);
    Ok(())
}
```

### 4.2 Gas Rebate Mechanisms

```rust
pub fn process_rebate(
    ctx: Context<ProcessRebate>,
    user: Pubkey,
    rebate_amount: u64,
) -> Result<()> {
    // Implement rebate logic for efficient operations
    // Transfer tokens back to user from rebate pool
    Ok(())
}
```

### 4.3 Multi-Token Support Preparation

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TokenSplit {
    pub mint: Pubkey,
    pub amount: u64,
    pub recipients: Vec<RecipientSplit>,
}

pub fn collect_and_split_multi_token(
    ctx: Context<CollectAndSplitMultiToken>,
    token_splits: Vec<TokenSplit>,
) -> Result<()> {
    // Future implementation for multiple token types
    Ok(())
}
```

## Phase 5: Testing and Deployment

### 5.1 Unit Tests

Create `programs/gas-utils/tests/gas_utils.rs`:

```rust
use anchor_lang::prelude::*;
use gas_utils::*;

#[tokio::test]
async fn test_collect_and_split() {
    // Test basic functionality
    let recipients = vec![
        RecipientSplit { recipient: Pubkey::new_unique(), percentage: 5000 },
        RecipientSplit { recipient: Pubkey::new_unique(), percentage: 3000 },
        RecipientSplit { recipient: Pubkey::new_unique(), percentage: 2000 },
    ];
    
    // Test the instruction
    // ... test implementation
}

#[tokio::test]
async fn test_invalid_splits() {
    // Test validation logic
    let invalid_recipients = vec![
        RecipientSplit { recipient: Pubkey::new_unique(), percentage: 6000 },
        RecipientSplit { recipient: Pubkey::new_unique(), percentage: 5000 },
    ];
    
    // Should fail with InvalidSplitPercentage
    // ... test implementation
}
```

### 5.2 Integration Tests

Create `tests/integration_test.rs`:

```rust
#[tokio::test]
async fn test_cpi_integration() {
    // Test thought-epoch -> gas-utils CPI flow
    let program_test = ProgramTest::new(
        "thought_epoch",
        thought_epoch::id(),
        processor!(thought_epoch::entry),
    );
    program_test.add_program("gas_utils", gas_utils::id(), None);
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Setup test accounts and execute CPI call
    // ... test implementation
}
```

### 5.3 Deployment Steps

1. **Deploy GasUtils Program**:
```bash
anchor deploy --program-name gas-utils
```

2. **Update Program IDs**:
```bash
# Update Anchor.toml with deployed program ID
# Update declare_id! in gas-utils/src/lib.rs
```

3. **Deploy Updated thought-epoch Program**:
```bash
anchor deploy --program-name thought-epoch
```

4. **Verify Deployment**:
```bash
anchor test
```

## Benefits of This Implementation

### 1. **Security Improvements**
- **On-chain Validation**: Gas burning logic is validated on-chain
- **Atomic Operations**: Gas collection and distribution happen atomically
- **Reduced Attack Surface**: No client-side gas burning logic to exploit

### 2. **Maintainability**
- **Single Source of Truth**: All gas logic centralized in GasUtils program
- **Easy Updates**: Gas parameters can be updated without touching core programs
- **Modular Design**: Clear separation between gas handling and core functionality

### 3. **Flexibility**
- **Dynamic Recipients**: Easy to add/remove/modify recipient splits
- **Operation-Specific Logic**: Different gas distributions for different operations
- **Future-Proof**: Ready for multi-token support and advanced features

### 4. **Efficiency**
- **Reduced Transaction Size**: No separate burn instructions
- **Lower Compute Units**: CPI overhead is minimal (~50-100μs)
- **Batch Operations**: Can handle multiple recipients in single instruction

### 5. **Scalability**
- **Independent Upgrades**: GasUtils can be upgraded independently
- **Multiple Programs**: Other programs can use the same gas infrastructure
- **Performance Monitoring**: Built-in gas tracking and analytics

## Migration Strategy

### Phase 1: Parallel Deployment
1. Deploy GasUtils program alongside existing system
2. Update client to support both old and new gas methods
3. Test thoroughly in development environment

### Phase 2: Gradual Migration
1. Update thought-epoch program to use CPI calls
2. Deploy updated program to testnet
3. Run comprehensive integration tests

### Phase 3: Full Cutover
1. Deploy to mainnet
2. Update all clients to use new system
3. Remove old gas burning logic

### Phase 4: Optimization
1. Monitor performance and gas costs
2. Implement advanced features (rebates, multi-token)
3. Optimize based on usage patterns

## Error Handling

### Common Error Codes
```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Invalid split percentage - must sum to 10000")]
    InvalidSplitPercentage,
    
    #[msg("Insufficient gas balance")]
    InsufficientGasBalance,
    
    #[msg("Unauthorized operation")]
    Unauthorized,
    
    #[msg("Invalid recipient account")]
    InvalidRecipient,
    
    #[msg("Gas vault not initialized")]
    GasVaultNotInitialized,
}
```

### Client Error Handling
```typescript
try {
  await runInference(params);
} catch (error) {
  if (error.code === 'InvalidSplitPercentage') {
    console.error('Gas split configuration error');
  } else if (error.code === 'InsufficientGasBalance') {
    console.error('Not enough LUCID tokens for gas');
  }
  // Handle other errors...
}
```

## Performance Considerations

### Gas Costs
- **CPI Overhead**: ~50-100 compute units
- **Token Transfers**: ~2000 compute units per recipient
- **Total Overhead**: Minimal compared to inference operations

### Optimization Strategies
1. **Batch Recipients**: Group similar recipients to reduce transfers
2. **Cache Configurations**: Store frequently used splits on-chain
3. **Lazy Evaluation**: Only calculate splits when needed

## Monitoring and Analytics

### On-Chain Events
```rust
#[event]
pub struct GasCollected {
    pub user: Pubkey,
    pub total_amount: u64,
    pub operation_type: String,
    pub recipients: Vec<RecipientSplit>,
    pub timestamp: i64,
}
```

### Client Metrics
```typescript
// Track gas distribution efficiency
export function trackGasMet
